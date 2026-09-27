import type { AssignmentRole, RsvpStatus, SessionAssignmentView, SessionView } from "@/lib/queries";

export function assignment(
  playerId: number,
  rsvpStatus: RsvpStatus = "offen",
  role: AssignmentRole = "starter",
): SessionAssignmentView {
  return { playerId, displayName: `P${playerId}`, role, slot: null, rsvpStatus };
}

/** A Platz-1 session on 03.11.2026 with starters 1–4 and Ersatz 5, nobody has answered yet. */
export function makeSession(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: 1,
    courtSlug: "happy-match",
    courtLabel: "Platz 1",
    hallName: "Happy Match",
    withCoach: true,
    address: null,
    sessionNo: 1,
    sessionDate: "2026-11-03",
    startsAt: new Date("2026-11-03T19:30:00Z"),
    endsAt: new Date("2026-11-03T21:00:00Z"),
    lkRange: null,
    note: null,
    starters: [assignment(1), assignment(2), assignment(3), assignment(4)],
    ersatz: assignment(5, "offen", "ersatz"),
    trainer: null,
    einspringer: [],
    ...overrides,
  };
}
