"use server";

import { runReminders, type ReminderRunResult } from "@/lib/reminders";
import { getBaseUrl } from "@/lib/base-url";

export async function testReminderDryRun(adminKey: string): Promise<ReminderRunResult> {
  if (!process.env.ADMIN_TOKEN || adminKey !== process.env.ADMIN_TOKEN) {
    throw new Error("Nicht autorisiert.");
  }
  const baseUrl = await getBaseUrl();
  return runReminders({ dryRun: true, baseUrl });
}
