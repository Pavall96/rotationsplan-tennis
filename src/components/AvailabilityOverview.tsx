import Link from "next/link";
import type { MatchView } from "@/lib/matches";
import type { RosterRow } from "@/lib/roster";
import { canBeAsked, type PlayerRoster } from "@/lib/eligibility";
import { availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import { formatDayShort, formatTime } from "@/lib/format";
import { TeamChip } from "@/components/MatchCard";

type Person = { playerId: number; name: string; lists: string; sortKey: number };

const GROUPS: { key: AvailabilityStatus | "offen"; label: string; color: string }[] = [
  { key: "ja", label: "Können", color: "text-[var(--color-ja)]" },
  { key: "vielleicht", label: "Vielleicht", color: "text-[var(--color-vielleicht)]" },
  { key: "nein", label: "Können nicht", color: "text-[var(--color-nein)]" },
  { key: "offen", label: "Noch keine Antwort", color: "text-[var(--color-ink-muted)]" },
];

/** Per Spieltag: who can play, sorted by Meldeliste position, with the list positions shown for lining up. */
export function AvailabilityOverview({
  days,
  roster,
  rosters,
  answers,
  lineupHref,
}: {
  days: { date: string; matches: MatchView[] }[];
  roster: RosterRow[];
  rosters: Map<number, PlayerRoster>;
  answers: Map<string, AvailabilityStatus>;
  /** Where to line up a match, for the matches the viewer may line up. */
  lineupHref?: (match: MatchView) => string | null;
}) {
  const people = new Map<number, Person>();
  for (const r of roster) {
    const p = people.get(r.playerId) ?? { playerId: r.playerId, name: r.name, lists: "", sortKey: 999 };
    const tag = `${r.ageClass === "h30" ? "H30" : "H"} ${r.position}`;
    p.lists = p.lists ? `${p.lists} · ${tag}` : tag;
    p.sortKey = Math.min(p.sortKey, r.position);
    people.set(r.playerId, p);
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)]">
      {days.map(({ date, matches }) => {
        const asked = [...people.values()]
          .filter((p) => matches.some((m) => canBeAsked(rosters.get(p.playerId) ?? {}, m.team)))
          .sort((a, b) => a.sortKey - b.sortKey);
        const byStatus = (key: AvailabilityStatus | "offen") =>
          asked.filter((p) => (answers.get(availabilityKey(p.playerId, date)) ?? "offen") === key);
        const needed = matches.reduce((n, m) => n + m.playersNeeded, 0);
        const yes = byStatus("ja").length;

        return (
          <details key={date} className="group border-b border-[var(--color-border)] last:border-b-0">
            <summary className="cursor-pointer list-none px-3.5 py-2.5">
              <p className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold">
                <span>{formatDayShort(date)}</span>
                <span className={yes >= needed ? "text-[var(--color-ja)]" : "text-[var(--color-nein)]"}>
                  {yes} von {needed} nötigen können
                </span>
              </p>
              {matches.map((m) => {
                const href = lineupHref?.(m);
                return (
                  <p key={m.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <TeamChip name={m.team.name} ageClass={m.team.ageClass} />
                    <span className="min-w-0 flex-1 truncate">
                      {formatTime(m.startsAt)} {m.isHome ? "vs" : "@"} {m.opponent}
                    </span>
                    {href && (
                      <Link
                        href={href}
                        className="shrink-0 rounded-full bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        Aufstellen ›
                      </Link>
                    )}
                  </p>
                );
              })}
              <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">
                {byStatus("vielleicht").length} vielleicht · {byStatus("nein").length} nicht ·{" "}
                {byStatus("offen").length} offen <span className="group-open:hidden">· Namen anzeigen ▾</span>
              </p>
            </summary>
            <div className="space-y-2.5 px-3.5 pb-3">
              {GROUPS.map((g) => {
                const list = byStatus(g.key);
                if (list.length === 0) return null;
                return (
                  <div key={g.key}>
                    <p className={`mb-0.5 text-xs font-semibold ${g.color}`}>
                      {g.label} ({list.length})
                    </p>
                    <ul className="text-sm">
                      {list.map((p) => (
                        <li key={p.playerId} className="flex justify-between gap-2">
                          <span className="truncate">{p.name}</span>
                          <span className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">{p.lists}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
