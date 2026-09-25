"use server";

import { runReminders, type ReminderRunResult } from "@/lib/reminders";
import { runMatchReminders, type MatchReminderResult } from "@/lib/match-reminders";
import { getBaseUrl } from "@/lib/base-url";

export async function testReminderDryRun(
  adminKey: string,
): Promise<ReminderRunResult & { punktspiele: MatchReminderResult }> {
  if (!process.env.ADMIN_TOKEN || adminKey !== process.env.ADMIN_TOKEN) {
    throw new Error("Nicht autorisiert.");
  }
  const baseUrl = await getBaseUrl();
  const [training, punktspiele] = await Promise.all([
    runReminders({ dryRun: true, baseUrl }),
    runMatchReminders({ dryRun: true, baseUrl }),
  ]);
  return { ...training, punktspiele };
}
