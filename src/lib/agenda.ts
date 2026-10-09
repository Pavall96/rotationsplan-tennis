import type { SessionView } from "@/lib/queries";
import type { MatchView } from "@/lib/matches";

export type AgendaItem = { kind: "session"; session: SessionView } | { kind: "match"; match: MatchView };

const startOf = (item: AgendaItem) => (item.kind === "session" ? item.session.startsAt : item.match.startsAt).getTime();

/** Training sessions and Punktspiele in one list, in the order they start. */
export function mergeAgenda(sessions: SessionView[], matches: MatchView[]): AgendaItem[] {
  const items: AgendaItem[] = [
    ...sessions.map((session) => ({ kind: "session" as const, session })),
    ...matches.map((match) => ({ kind: "match" as const, match })),
  ];
  return items.sort((a, b) => startOf(a) - startOf(b));
}
