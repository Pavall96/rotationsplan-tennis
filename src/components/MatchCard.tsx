import type { MatchView, AgeClass } from "@/lib/matches";
import { formatTime, directionsUrl, appleDirectionsUrl } from "@/lib/format";
import { PinIcon } from "@/components/icons";

export function teamChipClasses(ageClass: AgeClass): string {
  return ageClass === "h30"
    ? "text-[var(--color-h30)] bg-[var(--color-h30-bg)]"
    : "text-[var(--color-herren)] bg-[var(--color-herren-bg)]";
}

export function TeamChip({ name, ageClass }: { name: string; ageClass: AgeClass }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${teamChipClasses(ageClass)}`}>
      {name}
    </span>
  );
}

export function MatchCard({ match, children }: { match: MatchView; children?: React.ReactNode }) {
  const { venue } = match;

  return (
    <div
      id={`spiel-${match.id}`}
      className="scroll-mt-4 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px] shadow-[0_10px_24px_-16px_rgba(21,32,28,0.28)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          {match.isHome ? "Heimspiel" : "Auswärts"}
        </span>
      </div>

      <p className="font-display text-lg font-bold leading-snug">
        {match.isHome ? "gegen" : "bei"} {match.opponent}
      </p>
      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">{formatTime(match.startsAt)} Uhr</p>

      {venue && (
        <div className="rounded-[14px] bg-[var(--color-tabs-bg)] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <PinIcon className="shrink-0 text-[var(--color-ink-muted)]" />
            {venue.name}
          </p>
          {venue.address && <p className="pl-[18px] text-xs text-[var(--color-ink-muted)]">{venue.address}</p>}
          {venue.notes && <p className="mt-1 pl-[18px] text-xs">{venue.notes}</p>}
          {venue.address && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[18px]">
              <a
                href={directionsUrl(venue.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-[var(--color-brand)] px-3.5 py-1.5 text-xs font-semibold text-white"
              >
                Route starten
              </a>
              <a
                href={appleDirectionsUrl(venue.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-ink-muted)] underline underline-offset-2"
              >
                in Apple Karten
              </a>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
