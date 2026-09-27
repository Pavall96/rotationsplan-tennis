import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { players, courts, sessions, sessionAssignments, rsvps } from "@/db/schema";
import { playerLabel } from "@/lib/format";

export type RsvpStatus = "ja" | "nein" | "offen";

export type AssignmentRole = "starter" | "ersatz" | "trainer" | "einspringer";

export type SessionAssignmentView = {
  playerId: number;
  displayName: string;
  role: AssignmentRole;
  slot: number | null;
  rsvpStatus: RsvpStatus;
};

export type SessionView = {
  id: number;
  courtSlug: string;
  courtLabel: string;
  hallName: string;
  withCoach: boolean;
  address: string | null;
  sessionNo: number;
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
  lkRange: string | null;
  note: string | null;
  starters: SessionAssignmentView[];
  ersatz: SessionAssignmentView | null;
  trainer: SessionAssignmentView | null;
  /** Players who took a place a starter cancelled, first come first served. */
  einspringer: SessionAssignmentView[];
};

/** Fetches every session with its court, assignments and RSVP status, joined in JS (dataset is tiny: ~58 sessions). */
export async function getFullSchedule(): Promise<SessionView[]> {
  const db = getDb();

  const sessionRows = await db
    .select({
      id: sessions.id,
      courtSlug: courts.slug,
      courtLabel: courts.label,
      hallName: courts.hallName,
      withCoach: courts.withCoach,
      address: courts.address,
      sessionNo: sessions.sessionNo,
      sessionDate: sessions.sessionDate,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      lkRange: sessions.lkRange,
      note: sessions.note,
    })
    .from(sessions)
    .innerJoin(courts, eq(sessions.courtId, courts.id))
    .orderBy(sessions.startsAt);

  const assignmentRows = await db
    .select({
      sessionId: sessionAssignments.sessionId,
      playerId: sessionAssignments.playerId,
      displayName: players.displayName,
      nickname: players.nickname,
      role: sessionAssignments.role,
      slot: sessionAssignments.slot,
      rsvpStatus: rsvps.status,
    })
    .from(sessionAssignments)
    .innerJoin(players, eq(sessionAssignments.playerId, players.id))
    .leftJoin(
      rsvps,
      and(eq(rsvps.sessionId, sessionAssignments.sessionId), eq(rsvps.playerId, sessionAssignments.playerId)),
    );

  const bySession = new Map<number, SessionAssignmentView[]>();
  for (const a of assignmentRows) {
    if (!bySession.has(a.sessionId)) bySession.set(a.sessionId, []);
    bySession.get(a.sessionId)!.push({
      playerId: a.playerId,
      displayName: playerLabel(a),
      role: a.role as AssignmentRole,
      slot: a.slot,
      rsvpStatus: (a.rsvpStatus as RsvpStatus | null) ?? "offen",
    });
  }

  return sessionRows.map((s) => {
    const all = bySession.get(s.id) ?? [];
    const starters = all.filter((a) => a.role === "starter").sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const ersatz = all.find((a) => a.role === "ersatz") ?? null;
    const trainer = all.find((a) => a.role === "trainer") ?? null;
    const einspringer = all
      .filter((a) => a.role === "einspringer")
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
    return { ...s, starters, ersatz, trainer, einspringer };
  });
}

export async function getPlayerByToken(token: string) {
  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.token, token)).limit(1);
  return player ?? null;
}

export async function getPlayerById(playerId: number) {
  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return player ?? null;
}

export function sessionsForPlayer(schedule: SessionView[], playerId: number) {
  return schedule.filter((s) => myRoleInSession(s, playerId) !== null);
}

export function myRoleInSession(session: SessionView, playerId: number): AssignmentRole | null {
  if (session.starters.some((a) => a.playerId === playerId)) return "starter";
  if (session.ersatz?.playerId === playerId) return "ersatz";
  if (session.trainer?.playerId === playerId) return "trainer";
  if (session.einspringer.some((a) => a.playerId === playerId)) return "einspringer";
  return null;
}
