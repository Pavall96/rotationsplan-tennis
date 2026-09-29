import type { MatchView } from "@/lib/matches";
import { formatTime } from "@/lib/format";
import { TeamChip } from "@/components/MatchCard";

export type SameDayMatch = {
  match: MatchView;
  /** Stamm entries; `declined` ones said "nein" and don't count as lined up. */
  stamm: { name: string; declined: boolean }[];
  ersatz: string[];
  marked: string[];
  captainName: string | null;
  /** WhatsApp link to that team's Mannschaftsführer; null for the viewer's own team or without a captain. */
  whatsapp: string | null;
  /** The viewer is that team's Mannschaftsführer too. */
  own: boolean;
};

/** The other matches on the same day: who's lined up or wanted there, and a way to talk to their Mannschaftsführer. */
export function SameDayBlock({ matches }: { matches: SameDayMatch[] }) {
  return (
    <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h2 className="mb-1 font-display font-bold">Am selben Tag</h2>
      <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
        Wer dort aufgestellt ist, ist hier gesperrt. Vorgemerkte sind nur Wünsche – sprecht euch ab.
      </p>
      <ul className="space-y-2.5">
        {matches.map((s) => (
          <li key={s.match.id} className="rounded-[14px] bg-[var(--color-tabs-bg)] p-3 text-xs">
            <p className="flex items-center gap-2 text-sm">
              <TeamChip name={s.match.team.name} ageClass={s.match.team.ageClass} />
              <span className="min-w-0 truncate">
                {formatTime(s.match.startsAt)} {s.match.isHome ? "vs" : "@"} {s.match.opponent}
              </span>
            </p>
            <p className="mt-1.5">
              <span className="font-semibold">
                Aufgestellt {s.stamm.filter((e) => !e.declined).length}/{s.match.playersNeeded}:
              </span>{" "}
              {s.stamm.length ? s.stamm.map((e) => (e.declined ? `${e.name} (abgesagt)` : e.name)).join(", ") : "noch niemand"}
            </p>
            {s.ersatz.length > 0 && (
              <p>
                <span className="font-semibold">Ersatz:</span> {s.ersatz.join(", ")}
              </p>
            )}
            {s.marked.length > 0 && (
              <p className="text-[var(--color-h30)]">
                <span className="font-semibold">Vorgemerkt:</span> {s.marked.join(", ")}
              </p>
            )}
            <p className="mt-2 flex items-center justify-between gap-2 text-[var(--color-ink-muted)]">
              <span className="min-w-0 truncate">
                {s.own ? "Dein Team" : s.captainName ? `MF: ${s.captainName}` : "kein Mannschaftsführer eingetragen"}
              </span>
              {s.whatsapp && (
                <a
                  href={s.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-semibold text-[var(--color-brand)] underline underline-offset-2"
                >
                  WhatsApp ›
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
