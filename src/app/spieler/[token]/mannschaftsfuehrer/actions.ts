"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, sql, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { players, teams } from "@/db/schema";
import { getAllMatches, getTeams, type AgeClass } from "@/lib/matches";
import { getRoster, rosterByPlayer, activeRows } from "@/lib/roster";
import { getAvailability, openDaysByPlayer } from "@/lib/availability";
import { getLineups } from "@/lib/lineups";
import { buildSimulation, leftOut, SIM_FOCI, type SimFocus, type SimOptions } from "@/lib/lineup-sim";
import { proposeLineups, SimulationError } from "@/lib/lineup-ai";
import { getBaseUrl } from "@/lib/base-url";
import { sendNotice } from "@/lib/email";
import { formatDateForFile, formatDayShort, playerLabel } from "@/lib/format";

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
  /** Already reminded in the last REMINDER_COOLDOWN_HOURS (e.g. by another Mannschaftsführer) — skipped. */
  recentlyReminded: string[];
  sent: boolean;
};

const REMINDER_COOLDOWN_HOURS = 20;

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
  const cutoff = Date.now() - REMINDER_COOLDOWN_HOURS * 3_600_000;
  const recent = (p: (typeof recipients)[number]) => Boolean(p.availabilityRemindedAt && p.availabilityRemindedAt.getTime() > cutoff);
  const eligible = recipients.filter((p) => p.email && !recent(p));
  const preview = {
    withEmail: eligible.map((p) => playerLabel(p)),
    withoutEmail: recipients.filter((p) => !p.email).map((p) => playerLabel(p)),
    recentlyReminded: recipients.filter((p) => p.email && recent(p)).map((p) => playerLabel(p)),
    sent: false,
  };
  if (!send || eligible.length === 0) return preview;

  const from = process.env.MAIL_FROM;
  if (!from) return { error: "MAIL_FROM ist nicht gesetzt – es wurde nichts verschickt." };
  const baseUrl = await getBaseUrl();

  // Claim the players in one conditional update, so two captains sending at once can't both email the same person.
  const claimed = new Set(
    (
      await getDb()
        .update(players)
        .set({ availabilityRemindedAt: new Date() })
        .where(
          and(
            inArray(players.id, eligible.map((p) => p.id)),
            sql`(${players.availabilityRemindedAt} is null or ${players.availabilityRemindedAt} < ${new Date(cutoff)})`,
          ),
        )
        .returning({ id: players.id })
    ).map((r) => r.id),
  );
  const withEmail = eligible.filter((p) => claimed.has(p.id));

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
  return { ...preview, withEmail: withEmail.map((p) => playerLabel(p)), sent: true };
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

export type SimPlayerView = { playerId: number; name: string; lists: string; note: string | null };

export type SimTeamView = {
  matchId: number;
  team: string;
  ageClass: AgeClass;
  heading: string;
  /** The viewer's own team — they can mark the proposal there. */
  own: boolean;
  playersNeeded: number;
  stamm: (SimPlayerView & { fixed: boolean })[];
  ersatz: (SimPlayerView & { fixed: boolean })[];
  begruendung: string;
};

export type SimulationView =
  | {
      ok: true;
      teams: SimTeamView[];
      leftOut: SimPlayerView[];
      hinweise: string;
      errors: string[];
      warnings: string[];
      costCents: number;
    }
  | { ok: false; error: string };

export type SimulationRequest = {
  date: string;
  focus: Record<number, string>;
  pinned: number[];
  excluded: number[];
  allowMaybe: boolean;
  ersatz: boolean;
  avoidFestspielen: boolean;
  notes: string;
};

/**
 * Lets Claude propose the lineups of every team on one upcoming Spieltag. Nothing is saved — the Mannschaftsführer
 * decides what to mark or line up.
 */
export async function simulateLineups(token: string, req: SimulationRequest): Promise<SimulationView> {
  const [captain] = await getDb()
    .select({ id: players.id })
    .from(players)
    .innerJoin(teams, eq(teams.captainPlayerId, players.id))
    .where(eq(players.token, token))
    .limit(1);
  if (!captain) return { ok: false, error: "Nur Mannschaftsführer können simulieren." };

  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger) : []);
  const options: SimOptions = {
    focus: Object.fromEntries(
      Object.entries(req.focus ?? {}).filter(([, f]) => SIM_FOCI.includes(f as SimFocus)).map(([id, f]) => [Number(id), f as SimFocus]),
    ),
    pinned: ids(req.pinned),
    excluded: ids(req.excluded),
    allowMaybe: Boolean(req.allowMaybe),
    ersatz: Boolean(req.ersatz),
    avoidFestspielen: Boolean(req.avoidFestspielen),
  };
  const notes = String(req.notes ?? "").trim().slice(0, 500);
  const date = String(req.date ?? "");

  const [allMatches, roster, answers, lineupsByMatch, teamList] = await Promise.all([
    getAllMatches(),
    getRoster(),
    getAvailability(),
    getLineups(),
    getTeams(),
  ]);
  if (date < formatDateForFile(new Date()) || !allMatches.some((m) => m.matchDate === date)) {
    return { ok: false, error: "An dem Tag gibt es kein anstehendes Spiel." };
  }

  const input = buildSimulation(date, allMatches, activeRows(roster), answers, lineupsByMatch, options);
  // Pinned players who can't play anywhere that day are named instead of silently ignored.
  const possible = new Set(input.matches.flatMap((m) => [...m.fixedStamm, ...m.candidates.map((c) => c.playerId)]));
  const unpinnable = options.pinned.filter((id) => !possible.has(id));

  let result;
  try {
    result = await proposeLineups(input, notes);
  } catch (err) {
    if (err instanceof SimulationError) return { ok: false, error: err.message };
    console.error("Aufstellungs-Simulation fehlgeschlagen:", err);
    return { ok: false, error: "Die Simulation ist fehlgeschlagen – bitte später noch einmal versuchen." };
  }
  if (unpinnable.length > 0) {
    const names = roster.filter((r) => unpinnable.includes(r.playerId)).map((r) => r.name);
    result.day.warnings.unshift(`Festgelegt, kann aber an dem Tag für kein Team spielen: ${[...new Set(names)].join(", ")}.`);
  }

  const byId = new Map(input.players.map((p) => [p.playerId, p]));
  const view = (id: number): SimPlayerView => {
    const p = byId.get(id);
    const note = p
      ? [p.status === "vielleicht" ? "vielleicht" : null, `${p.einsaetzeBisher} Einsätze bei ${p.zusagenBisher} Zusagen`]
          .filter(Boolean)
          .join(" · ")
      : null;
    return { playerId: id, name: p?.name ?? `Spieler ${id}`, lists: p?.lists ?? "", note };
  };
  const myTeams = new Set(teamList.filter((t) => t.captainPlayerId === captain.id).map((t) => t.id));

  return {
    ok: true,
    teams: result.day.teams.map((t) => {
      const m = allMatches.find((x) => x.id === t.matchId)!;
      const sim = input.matches.find((x) => x.matchId === t.matchId)!;
      return {
        matchId: t.matchId,
        team: m.team.name,
        ageClass: m.team.ageClass,
        heading: `${sim.time} ${m.isHome ? "vs" : "@"} ${m.opponent}`,
        own: myTeams.has(m.team.id),
        playersNeeded: m.playersNeeded,
        stamm: t.stamm.map((id) => ({ ...view(id), fixed: sim.fixedStamm.includes(id) })),
        ersatz: t.ersatz.map((id) => ({ ...view(id), fixed: sim.fixedErsatz.includes(id) })),
        begruendung: t.begruendung,
      };
    }),
    leftOut: leftOut(input, result.day).map((p) => view(p.playerId)),
    hinweise: result.hinweise,
    errors: result.day.errors,
    warnings: result.day.warnings,
    costCents: Math.max(1, Math.round(result.costUsd * 100)),
  };
}
