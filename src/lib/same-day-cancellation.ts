import type { AssignmentRole, SessionView } from "@/lib/queries";
import { openSlotRecipients } from "@/lib/einspringen";
import { formatDateForFile } from "@/lib/format";
import { ersatzNeeded, lineup } from "@/lib/vacancy";

/** Who just said "nein", in which role, and what they had answered before. */
export type Cancellation = { playerId: number; role: AssignmentRole; previous: "ja" | "nein" | null };

/**
 * Whether the "nein" took someone off the court, given the session *after* it: the first no of a starter, of
 * someone who jumped in or of the coach — and of the Ersatz only if they had said yes and were needed.
 */
function leftTheCourt(session: SessionView, { role, previous }: Cancellation): boolean {
  if (role === "ersatz") return previous === "ja" && ersatzNeeded(session);
  return previous !== "nein";
}

/**
 * Who is emailed right away when someone cancels on the day of the session itself, given the session *after*
 * the cancellation. Earlier cancellations send nothing here: the morning email shows them.
 * `freePlayers` get the "Platz frei" email, `court` (everyone still coming) a short notice.
 */
export function sameDayCancellationMails(
  schedule: SessionView[],
  session: SessionView,
  cancelled: Cancellation,
  now: Date,
): { freePlayers: number[]; court: number[] } {
  const today = formatDateForFile(session.startsAt) === formatDateForFile(now) && session.endsAt > now;
  if (!today || !leftTheCourt(session, cancelled)) return { freePlayers: [], court: [] };

  // The first starter to cancel already triggers the "Ersatz gesucht" email — no second one for the Ersatz.
  const ersatzAlerted =
    cancelled.role === "starter" && session.starters.filter((a) => a.rsvpStatus === "nein").length === 1;
  const court = [...lineup(session), ...(session.trainer ? [session.trainer] : [])]
    .filter((a) => a.rsvpStatus !== "nein" && a.playerId !== cancelled.playerId)
    .filter((a) => !(ersatzAlerted && a.role === "ersatz"))
    .map((a) => a.playerId);

  // Whoever just handed a place back isn't on the session any more, but shouldn't be asked to take it again.
  const freePlayers =
    cancelled.role === "trainer"
      ? []
      : openSlotRecipients(schedule, session, now).filter((id) => id !== cancelled.playerId);

  return { freePlayers, court };
}
