"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { players, sessionAssignments, rsvps } from "@/db/schema";

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

  await db
    .insert(rsvps)
    .values({ sessionId, playerId: player.id, status, source })
    .onConflictDoUpdate({
      target: [rsvps.sessionId, rsvps.playerId],
      set: { status, respondedAt: new Date(), source },
    });

  revalidatePath("/");
  revalidatePath("/spieler/[token]", "page");

  return { token, sessionId };
}

export async function setRsvp(formData: FormData) {
  await saveRsvp(formData, "web");
}

/** Submitted from the confirmation page the reminder email links to; lands the player on the updated card. */
export async function confirmRsvpFromEmail(formData: FormData) {
  const { token, sessionId } = await saveRsvp(formData, "email");
  redirect(`/spieler/${encodeURIComponent(token)}#termin-${sessionId}`);
}
