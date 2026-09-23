import type { SessionView } from "@/lib/queries";
import { formatDate, formatTimeRange, mapsUrl } from "@/lib/format";
import { RsvpBadge } from "@/components/RsvpBadge";
import { AlertIcon, CheckIcon, PinIcon } from "@/components/icons";
import { vacancyStatus } from "@/lib/vacancy";

export function SessionCard({
  session,
  highlightPlayerId,
  variant = "full",
}: {
  session: SessionView;
  highlightPlayerId?: number;
  variant?: "full" | "compact";
}) {
  const isPlatz1 = session.courtSlug === "happy-match";
  const chipColorClasses = isPlatz1
    ? "text-[var(--color-platz1)] bg-[var(--color-platz1-bg)]"
    : "text-[var(--color-platz2)] bg-[var(--color-platz2-bg)]";
  const chipLabel = `${session.hallName}${session.withCoach ? " · mit Trainer" : ""}`;
  const goingCount = session.starters.filter((a) => a.rsvpStatus === "ja").length;
  const vacancy = vacancyStatus(session);

  if (variant === "compact") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3">
        <div className="min-w-0 whitespace-nowrap">
          <p className="truncate text-sm font-semibold">{formatDate(session.startsAt)}</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {formatTimeRange(session.startsAt, session.endsAt)}
          </p>
          {vacancy && (
            <p
              className={`mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${
                vacancy.open > 0 ? "text-[var(--color-nein)]" : "text-[var(--color-ja)]"
              }`}
            >
              {vacancy.open > 0 ? <AlertIcon className="h-3 w-3 shrink-0" /> : <CheckIcon className="h-3 w-3 shrink-0" />}
              {vacancy.short}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${chipColorClasses}`}>
            {session.hallName}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-ink-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ja)]" />
            {goingCount} zugesagt
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px] shadow-[0_10px_24px_-16px_rgba(21,32,28,0.28)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-bold whitespace-nowrap">{formatDate(session.startsAt)}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {formatTimeRange(session.startsAt, session.endsAt)}
          </p>
        </div>
        {session.address ? (
          <a
            href={mapsUrl(session.address)}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${chipColorClasses}`}
          >
            <PinIcon />
            {chipLabel}
          </a>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${chipColorClasses}`}
          >
            <PinIcon />
            {chipLabel}
          </span>
        )}
      </div>

      {session.note && (
        <p className="mb-3 inline-block rounded-lg bg-yellow-100 px-2 py-0.5 text-xs text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">
          {session.note}
        </p>
      )}

      <div className="mb-2 h-px bg-[var(--color-border)]" />

      <ul className="mb-2 space-y-1.5">
        {session.starters.map((a) => (
          <li
            key={a.playerId}
            className={`flex items-center justify-between text-sm ${
              a.playerId === highlightPlayerId ? "font-semibold" : ""
            }`}
          >
            <span>{a.displayName}</span>
            <RsvpBadge status={a.rsvpStatus} />
          </li>
        ))}
      </ul>

      {session.trainer && (
        <div className="flex items-center justify-between py-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">
            Trainer
          </span>
          <span
            className={`flex items-center gap-2 text-sm ${
              session.trainer.playerId === highlightPlayerId ? "font-semibold" : ""
            }`}
          >
            {session.trainer.displayName}
            <RsvpBadge status={session.trainer.rsvpStatus} />
          </span>
        </div>
      )}

      {session.ersatz && (
        <div className="flex items-center justify-between py-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">
            Ersatz
          </span>
          <RsvpBadge status={session.ersatz.rsvpStatus} />
        </div>
      )}

      {vacancy && (
        <p
          className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium ${
            vacancy.open > 0
              ? "bg-[var(--color-nein-bg)] text-[var(--color-nein)]"
              : "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
          }`}
        >
          {vacancy.open > 0 ? <AlertIcon className="h-3 w-3 shrink-0" /> : <CheckIcon className="h-3 w-3 shrink-0" />}
          {vacancy.label}
        </p>
      )}
    </div>
  );
}
