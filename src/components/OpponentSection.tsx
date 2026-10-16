import type { AgeClass } from "@/lib/matches";
import type { OpponentView } from "@/lib/scouting";
import { formatDate } from "@/lib/format";

const BOX = "rounded-[14px] bg-[var(--color-tabs-bg)] px-3 py-2.5";
const LABEL = "mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-faint)]";

function lkLabel(lk: number | null): string {
  if (lk === null) return "LK –";
  return `LK ${lk}`;
}

/** Matches in a "won:lost" record. */
function doublesPlayed(record: string): number {
  return record.split(":").reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/** Opponent overview for a team's next match: league table, likely lineup and the written assessment. */
export function OpponentSection({ view, ageClass }: { view: OpponentView; ageClass: AgeClass }) {
  const ourColor = ageClass === "h30" ? "text-[var(--color-h30)]" : "text-[var(--color-herren)]";
  // In dark mode brand and Herren blue are close; the age-class tint tells our row apart from the opponent's.
  const ourTint = ageClass === "h30" ? "bg-[var(--color-h30-bg)]" : "bg-[var(--color-herren-bg)]";

  return (
    <div className="mb-3 space-y-3">
      <div className={BOX}>
        <p className={LABEL}>Tabelle</p>
        <table aria-label="Tabelle" className="w-full table-fixed border-collapse text-xs">
          <tbody>
            {view.standings.map((row) => {
              const isOurs = row.teamUrl === view.ourTeamUrl;
              const tone =
                row.teamUrl === view.opponentTeamUrl
                  ? "font-bold text-[var(--color-brand)]"
                  : isOurs
                    ? `font-bold ${ourColor}`
                    : "";
              const tint = isOurs ? ourTint : "";
              return (
                <tr key={row.teamUrl} className={`border-b border-[var(--color-border)] last:border-b-0 ${tone}`}>
                  <td className={`w-6 rounded-l-md py-1 pl-1 pr-1 ${tint}`}>{row.rank}</td>
                  <td className={`truncate py-1 pr-2 ${tint}`}>{row.team}</td>
                  <td className={`w-12 whitespace-nowrap rounded-r-md py-1 pr-1 text-right ${tint}`}>{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={BOX}>
        <p className={LABEL}>{view.hasPlayed ? "So haben sie aufgestellt" : "Noch keine Spiele – so sind sie gemeldet"}</p>
        <ul className="space-y-0.5 text-xs leading-relaxed">
          {view.players.map((p) => (
            <li key={p.position} className="flex gap-1.5">
              <span className="w-4 shrink-0 text-[var(--color-ink-faint)]">{p.position}</span>
              <span className="min-w-0">
                {p.name} ({lkLabel(p.lk)})
                {view.hasPlayed && (
                  <span className="text-[var(--color-ink-muted)]">
                    {" "}
                    · {p.appearances + doublesPlayed(p.doubles)}× · Einzel {p.singles} · Doppel {p.doubles}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {view.assessment && (
        <p className="rounded-[14px] bg-[var(--color-brand-bg)] px-3 py-2.5 text-sm leading-snug">
          <span className="font-bold text-[var(--color-brand)]">Einschätzung:</span> {view.assessment}
        </p>
      )}

      <p className="-mt-1 text-xs text-[var(--color-ink-muted)]">
        Stand: {formatDate(view.fetchedAt)} · Quelle:{" "}
        <a
          href={view.groupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          nuLiga
        </a>
      </p>
    </div>
  );
}
