import Link from "next/link";
import type { MatchView, AgeClass } from "@/lib/matches";
import { formatDate, formatTime, formatDayShort, directionsUrl, appleDirectionsUrl } from "@/lib/format";
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

/** Unmissable Heim/Auswärts marker: filled green pill for home, outlined neutral pill for away. */
export function HomeAwayBadge({ isHome }: { isHome: boolean }) {
  return isHome ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--color-ja)] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
      <span aria-hidden>⌂</span> Heimspiel
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
      <span aria-hidden>→</span> Auswärts
    </span>
  );
}

export function MatchCard({
  match,
  showDate = false,
  opponent,
  children,
}: {
  match: MatchView;
  /** For lists that aren't grouped under day headers. */
  showDate?: boolean;
  /** Opponent overview, shown above the venue block. */
  opponent?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { venue } = match;

  return (
    <div
      id={`spiel-${match.id}`}
      className={`scroll-mt-4 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px] shadow-[0_10px_24px_-16px_rgba(21,32,28,0.28)] ${
        match.isHome ? "border-l-[5px] border-l-[var(--color-ja)]" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <HomeAwayBadge isHome={match.isHome} />
      </div>

      <p className="font-display text-lg font-bold leading-snug">
        {match.isHome ? "gegen" : "bei"} {match.opponent}
      </p>
      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">{showDate && `${formatDayShort(match.startsAt)} · `}
        {formatTime(match.startsAt)} Uhr
      </p>

      {match.isHome && (
        <p className="mb-3 rounded-[14px] bg-[var(--color-ja-bg)] px-3 py-2.5 text-sm text-[var(--color-ja)]">
          <span className="font-semibold">Nicht vergessen:</span> Bälle mitbringen und nach dem Spiel den Spielbericht
          ausfüllen.
        </p>
      )}

      {opponent}

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

/** One line in the home page's "Kommende Termine": a Punktspiel between the training sessions. */
export function CompactMatchCard({ match, href }: { match: MatchView; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3 transition-colors active:bg-[var(--color-tabs-bg)]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{formatDate(match.startsAt)}</p>
        <p className="text-xs text-[var(--color-ink-muted)]">{formatTime(match.startsAt)} Uhr</p>
        <p className="mt-0.5 truncate text-xs font-semibold">
          Punktspiel {match.isHome ? "gegen" : "bei"} {match.opponent}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <span className="whitespace-nowrap text-xs text-[var(--color-ink-muted)]">
          {match.isHome ? "Heimspiel" : "Auswärts"}
        </span>
      </div>
    </Link>
  );
}
