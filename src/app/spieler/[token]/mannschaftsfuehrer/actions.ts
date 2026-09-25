"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq, sql, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { players, teams } from "@/db/schema";
import { getAllMatches } from "@/lib/matches";
import { getRoster, rosterByPlayer, activeRows } from "@/lib/roster";
import { getAvailability, openDaysByPlayer } from "@/lib/availability";
import { getBaseUrl } from "@/lib/base-url";
import { sendNotice } from "@/lib/email";
import { formatDayShort, playerLabel } from "@/lib/format";

export type AddPlayerResult =
  | { status: "ok"; displayName: string }
  | { status: "name-taken"; displayName: string }
  | { status: "invalid" }
  | { status: "forbidden" };

/** Mannschaftsführer add players who don't train (and so weren't in the training spreadsheet). */
export async function addPlayer(formData: FormData): Promise<AddPlayerResult> {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim().replace(/\s+/g, " ");
  const lkRaw = String(formData.get("lk") ?? "").trim().replace(",", ".");
  const lk = lkRaw ? Number(lkRaw) : null;

  if (!displayName || displayName.length > 60 || (lk !== null && !(lk >= 1 && lk <= 25))) {
    return { status: "invalid" };
  }

  const db = getDb();
  if (!(await isCaptain(token))) return { status: "forbidden" };

  // Case-insensitive, so "max müller" doesn't end up next to "Max Müller" in the sign-up list.
  const [existing] = await db
    .select({ displayName: players.displayName })
    .from(players)
    .where(sql`lower(${players.displayName}) = lower(${displayName})`)
    .limit(1);
  if (existing) return { status: "name-taken", displayName: existing.displayName };

  await db.insert(players).values({
    displayName,
    lk: lk === null ? null : lk.toFixed(1),
    wantsCoach: false,
    token: crypto.randomBytes(24).toString("base64url"),
  });

  revalidatePath(`/spieler/${token}/mannschaftsfuehrer`);
  return { status: "ok", displayName };
}

async function isCaptain(token: string): Promise<boolean> {
  const [captain] = await getDb()
    .select({ id: players.id })
    .from(players)
    .innerJoin(teams, eq(teams.captainPlayerId, players.id))
    .where(eq(players.token, token))
    .limit(1);
  return Boolean(captain);
}

export type ReminderPreview = {
  withEmail: string[];
  withoutEmail: string[];
  sent: boolean;
};

/**
 * Emails every rostered player who still has unanswered Spieltage. With `send` unset it only returns who would get
 * the email, so the Mannschaftsführer sees the list before anything goes out.
 */
export async function availabilityReminder(token: string, send: boolean): Promise<ReminderPreview | { error: string }> {
  if (!(await isCaptain(token))) return { error: "Nur Mannschaftsführer können erinnern." };

  const [allMatches, roster, answers] = await Promise.all([getAllMatches(), getRoster(), getAvailability()]);
  const open = openDaysByPlayer(rosterByPlayer(activeRows(roster)), allMatches, answers);
  const recipients = open.size
    ? await getDb().select().from(players).where(inArray(players.id, [...open.keys()])).orderBy(players.displayName)
    : [];
  const withEmail = recipients.filter((p) => p.email);
  const preview = {
    withEmail: withEmail.map((p) => playerLabel(p)),
    withoutEmail: recipients.filter((p) => !p.email).map((p) => playerLabel(p)),
    sent: false,
  };
  if (!send || withEmail.length === 0) return preview;

  const from = process.env.MAIL_FROM;
  if (!from) return { error: "MAIL_FROM ist nicht gesetzt – es wurde nichts verschickt." };
  const baseUrl = await getBaseUrl();

  // Sent after the response; one at a time with a pause to stay under the mail provider's rate limit.
  after(async () => {
    for (const p of withEmail) {
      const days = open.get(p.id)!;
      try {
        const result = await sendNotice(
          {
            to: p.email!,
            playerName: playerLabel(p),
            subject: "Winterspiele: An welchen Spieltagen kannst du?",
            line: "Bitte trag kurz ein, an welchen Spieltagen du bei den Winterspielen kannst – die Mannschaftsführer stellen daraus die Teams auf.",
            detail: `Noch offen: ${days.map((d) => formatDayShort(d.date)).join(", ")}`,
            cta: { url: `${baseUrl}/spieler/${p.token}/punktspiele#verfuegbarkeit`, label: "Jetzt eintragen" },
            token: p.token,
            baseUrl,
          },
          { from, replyTo: process.env.REPLY_TO },
        );
        if (result.error) console.error(`Verfügbarkeits-Erinnerung an ${p.email} fehlgeschlagen: ${result.error}`);
      } catch (err) {
        console.error(`Verfügbarkeits-Erinnerung an ${p.email} fehlgeschlagen:`, err);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  });
  return { ...preview, sent: true };
}

/** Marks a player who holds a Meldeliste position but won't play (or plays again). */
export async function setPlaysMatches(formData: FormData): Promise<{ error?: string } | void> {
  const token = String(formData.get("token") ?? "");
  const playerId = Number(formData.get("playerId"));
  const playsMatches = formData.get("playsMatches") === "true";
  if (!(await isCaptain(token))) return { error: "Nur Mannschaftsführer können das ändern." };
  await getDb().update(players).set({ playsMatches }).where(eq(players.id, playerId));
  revalidatePath("/spieler/[token]/mannschaftsfuehrer", "page");
  revalidatePath("/spieler/[token]", "page");
}
