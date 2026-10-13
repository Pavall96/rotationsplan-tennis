import type { SessionView } from "@/lib/queries";
import { openSlotRecipients } from "@/lib/einspringen";
import { formatDateForFile } from "@/lib/format";
import { openSlots } from "@/lib/vacancy";

/** Who just gave up a place: a starter saying "nein", or someone who had jumped in leaving again. */
export type Cancellation = { playerId: number; role: "starter" | "einspringer"; previous: "ja" | "nein" | null };

/** Who gets the "Platz frei" email right away, given the session *after* the cancellation. Empty unless it's the training day and the session hasn't started. */
export function sameDayOpenSlotRecipients(schedule: SessionView[], session: SessionView, cancelled: Cancellation, now: Date): number[] {
  if (formatDateForFile(session.startsAt) !== formatDateForFile(now)) return [];
  if (session.startsAt <= now) return [];
  if (cancelled.role === "starter" && cancelled.previous === "nein") return [];
  if (openSlots(session) === 0) return [];
  return openSlotRecipients(schedule, session, now).filter((id) => id !== cancelled.playerId);
}
