"use server";

import { runReminders, type ReminderRunResult } from "@/lib/reminders";
import { getBaseUrl } from "@/lib/base-url";

export async function testReminderDryRun(): Promise<ReminderRunResult> {
  const baseUrl = await getBaseUrl();
  return runReminders({ dryRun: true, baseUrl });
}
