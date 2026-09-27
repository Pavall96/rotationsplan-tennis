"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { players, sessionAssignments, rsvps } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { getFullSchedule, getPlayerByToken } from "@/lib/queries";
import { canJumpIn } from "@/lib/einspringen";
import { claimSlot, leaveSlot, retractCancellation } from "@/lib/slots";
import { notifyErsatz, notifyErsatzTakenOver } from "@/lib/ersatz-alert";

type Source = "web" | "email";

function revalidateSchedule() {
  revalidatePath("/");
  revalidatePath("/spieler/[token]", "page");
}

async function alertErsatzAfterStarterAnswer(
  sessionId: number,
  starterId: number,
  previous: "ja" | "nein" | null,
  status: "ja" | "nein",
) {
  const baseUrl = await getBaseUrl();
  // Sent after the response so a slow mail provider never delays saving the answer.
  after(() => notifyErsatz({ sessionId, starterId, previous, status, baseUrl }));
}

async function saveRsvp(formData: FormData, source: Source) {
  const token = String(formData.get("token") ?? "");
  const sessionId = Number(formData.get("sessionId"));
  const status = String(formData.get("status") ?? "");

  if (!token || !sessionId || (status !== "ja" && status !== "nein")) {
    throw new Error("Ungültige Anfrage.");
  }

  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.token, token)).limit(1);
  if (!player) {
    throw new Error("Ungültiger Link.");
  }

  const [assignment] = await db
    .select()
    .from(sessionAssignments)
    .where(and(eq(sessionAssignments.sessionId, sessionId), eq(sessionAssignments.playerId, player.id)))
    .limit(1);
  if (!assignment) {
    throw new Error("Du bist für diesen Termin nicht eingeteilt.");
  }
  const result = { token, sessionId, role: assignment.role };

  if (assignment.role === "einspringer") {
    // Jumping in already was the "ja"; "nein" hands the place back to whoever comes next.
    if (status === "nein") await leaveSlot(sessionId, player.id);
    revalidateSchedule();
    return result;
  }

  const [previousRow] = await db
    .select({ status: rsvps.status })
    .from(rsvps)
    .where(and(eq(rsvps.sessionId, sessionId), eq(rsvps.playerId, player.id)))
    .limit(1);
  const previous = (previousRow?.status as "ja" | "nein" | undefined) ?? null;

  if (assignment.role === "starter" && previous === "nein" && status === "ja") {
    // Someone may have jumped in meanwhile — then the place is theirs and the cancellation stays.
    const retracted = await retractCancellation(sessionId, player.id, source);
    revalidateSchedule();
    if (retracted) await alertErsatzAfterStarterAnswer(sessionId, player.id, previous, status);
    return result;
  }

  await db
    .insert(rsvps)
    .values({ sessionId, playerId: player.id, status, source })
    .onConflictDoUpdate({
      target: [rsvps.sessionId, rsvps.playerId],
      set: { status, respondedAt: new Date(), source },
    });

  revalidateSchedule();

  if (assignment.role === "starter") {
    await alertErsatzAfterStarterAnswer(sessionId, player.id, previous, status);
  }

  return result;
}

export async function setRsvp(formData: FormData) {
  await saveRsvp(formData, "web");
}

/** Submitted from the confirmation page the reminder email links to; lands the player on the updated card. */
export async function confirmRsvpFromEmail(formData: FormData) {
  const { token, sessionId, role } = await saveRsvp(formData, "email");
  const playerPage = `/spieler/${encodeURIComponent(token)}`;
  // Ersatz sessions aren't listed on the player page, so confirm on the answer page instead.
  redirect(
    role === "ersatz"
      ? `${playerPage}/antwort?termin=${sessionId}&gespeichert=1`
      : `${playerPage}#termin-${sessionId}`,
  );
}

/** Takes a free place for a player who isn't on the session. False when it's gone or they may not take it. */
async function tryJumpIn(formData: FormData, source: Source) {
  const token = String(formData.get("token") ?? "");
  const sessionId = Number(formData.get("sessionId"));
  if (!token || !sessionId) throw new Error("Ungültige Anfrage.");

  const player = await getPlayerByToken(token);
  if (!player) throw new Error("Ungültiger Link.");

  const schedule = await getFullSchedule();
  const session = schedule.find((s) => s.id === sessionId);
  const ok =
    !!session && canJumpIn(schedule, session, player.id, new Date()) && (await claimSlot(sessionId, player.id, source));

  if (ok) {
    revalidateSchedule();
    const baseUrl = await getBaseUrl();
    after(() => notifyErsatzTakenOver({ sessionId, einspringerId: player.id, baseUrl }));
  }
  return { playerPage: `/spieler/${encodeURIComponent(token)}`, sessionId, ok };
}

export async function jumpIn(formData: FormData) {
  const { playerPage, sessionId, ok } = await tryJumpIn(formData, "web");
  redirect(ok ? `${playerPage}#termin-${sessionId}` : `${playerPage}?vergeben=${sessionId}#freie-plaetze`);
}

/** The "Ich springe ein" button on the answer page the "Platz frei" email links to. */
export async function jumpInFromEmail(formData: FormData) {
  const { playerPage, sessionId, ok } = await tryJumpIn(formData, "email");
  redirect(ok ? `${playerPage}#termin-${sessionId}` : `${playerPage}/antwort?termin=${sessionId}&vergeben=1`);
}
