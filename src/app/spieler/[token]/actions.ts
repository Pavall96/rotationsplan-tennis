"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { players, sessionAssignments, rsvps } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { notifyErsatz } from "@/lib/ersatz-alert";

async function saveRsvp(formData: FormData, source: "web" | "email") {
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

  const [previous] = await db
    .select({ status: rsvps.status })
    .from(rsvps)
    .where(and(eq(rsvps.sessionId, sessionId), eq(rsvps.playerId, player.id)))
    .limit(1);

  await db
    .insert(rsvps)
    .values({ sessionId, playerId: player.id, status, source })
    .onConflictDoUpdate({
      target: [rsvps.sessionId, rsvps.playerId],
      set: { status, respondedAt: new Date(), source },
    });

  revalidatePath("/");
  revalidatePath("/spieler/[token]", "page");

  if (assignment.role === "starter") {
    const baseUrl = await getBaseUrl();
    // Sent after the response so a slow mail provider never delays saving the answer.
    after(() =>
      notifyErsatz({
        sessionId,
        starterId: player.id,
        previous: (previous?.status as "ja" | "nein" | undefined) ?? null,
        status,
        baseUrl,
      }),
    );
  }

  return { token, sessionId, role: assignment.role };
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
