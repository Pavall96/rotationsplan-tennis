import type { SessionView } from "@/lib/queries";
import { openSlots } from "@/lib/vacancy";

/** Playing (or coaching) at a session — an Ersatz only stands by, so that doesn't count. */
function playsAt(session: SessionView, playerId: number): boolean {
  return (
    session.starters.some((a) => a.playerId === playerId) ||
    session.trainer?.playerId === playerId ||
    session.einspringer.some((a) => a.playerId === playerId)
  );
}

function isOnSession(session: SessionView, playerId: number): boolean {
  return playsAt(session, playerId) || session.ersatz?.playerId === playerId;
}

/** Players on the training rotation: planned as starter or Ersatz somewhere this season (coaches don't count). */
function rotationPlayerIds(schedule: SessionView[]): Set<number> {
  const ids = new Set<number>();
  for (const s of schedule) {
    for (const a of s.starters) ids.add(a.playerId);
    if (s.ersatz) ids.add(s.ersatz.playerId);
  }
  return ids;
}

/**
 * Whether a player may take a free place at this session: it isn't over and has a place open, they're on the
 * rotation but not on this session, and they aren't already playing in the other hall that evening.
 */
export function canJumpIn(schedule: SessionView[], session: SessionView, playerId: number, now: Date): boolean {
  if (session.endsAt <= now || openSlots(session) === 0) return false;
  if (isOnSession(session, playerId)) return false;
  if (!rotationPlayerIds(schedule).has(playerId)) return false;
  return !schedule.some((s) => s.id !== session.id && s.sessionDate === session.sessionDate && playsAt(s, playerId));
}

/** Upcoming sessions this player could jump into right now. */
export function jumpInOptions(schedule: SessionView[], playerId: number, now: Date): SessionView[] {
  return schedule.filter((s) => canJumpIn(schedule, s, playerId, now));
}

/** Who is looking at a public page (known from the remembered personal link) and where they may jump in. */
export type JumpInViewer = { token: string; sessionIds: Set<number> };

/** Everyone who should get the "Platz frei" email for this session. */
export function openSlotRecipients(schedule: SessionView[], session: SessionView, now: Date): number[] {
  return [...rotationPlayerIds(schedule)].filter((id) => canJumpIn(schedule, session, id, now));
}
