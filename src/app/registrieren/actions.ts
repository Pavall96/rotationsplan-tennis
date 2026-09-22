"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { playerLabel } from "@/lib/format";

export type RegisterResult =
  | { status: "ok"; link: string; displayName: string }
  | { status: "already-registered"; displayName: string }
  | { status: "invalid" };

export async function registerEmail(formData: FormData): Promise<RegisterResult> {
  const playerId = Number(formData.get("playerId"));
  const email = String(formData.get("email") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();

  if (!playerId || !email || !email.includes("@")) {
    return { status: "invalid" };
  }

  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) return { status: "invalid" };

  if (player.email && player.email !== email) {
    // Already registered by someone — don't let a public form silently overwrite it.
    return { status: "already-registered", displayName: playerLabel(player) };
  }

  await db
    .update(players)
    .set({ email, nickname: nickname || null })
    .where(eq(players.id, playerId));

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return {
    status: "ok",
    link: `${baseUrl}/spieler/${player.token}`,
    displayName: nickname || player.displayName,
  };
}
