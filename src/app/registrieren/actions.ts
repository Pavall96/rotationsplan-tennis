"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { players } from "@/db/schema";

export type RegisterResult =
  | { status: "ok"; link: string; displayName: string }
  | { status: "already-registered"; displayName: string }
  | { status: "invalid" };

export async function registerEmail(formData: FormData): Promise<RegisterResult> {
  const playerId = Number(formData.get("playerId"));
  const email = String(formData.get("email") ?? "").trim();

  if (!playerId || !email || !email.includes("@")) {
    return { status: "invalid" };
  }

  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) return { status: "invalid" };

  if (player.email && player.email !== email) {
    // Already registered by someone — don't let a public form silently overwrite it.
    return { status: "already-registered", displayName: player.displayName };
  }

  await db.update(players).set({ email }).where(eq(players.id, playerId));

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return { status: "ok", link: `${baseUrl}/spieler/${player.token}`, displayName: player.displayName };
}
