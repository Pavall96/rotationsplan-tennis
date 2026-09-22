import type { SessionView } from "@/lib/queries";
import { formatDate, formatTimeRange } from "@/lib/format";
import { RsvpBadge } from "@/components/RsvpBadge";

export function SessionCard({
  session,
  highlightPlayerId,
}: {
  session: SessionView;
  highlightPlayerId?: number;
}) {
  const courtColor = session.courtSlug === "happy-match" ? "var(--color-platz1)" : "var(--color-platz2)";
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/15 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold">{formatDate(session.startsAt)}</p>
          <p className="text-sm text-black/60 dark:text-white/60">
            {formatTimeRange(session.startsAt, session.endsAt)}
          </p>
        </div>
        <span
          className="text-xs font-medium px-2 py-1 rounded-full text-white"
          style={{ backgroundColor: courtColor }}
        >
          {session.hallName} · {session.withCoach ? "mit Trainer" : "ohne Trainer"}
        </span>
      </div>

      {session.note && (
        <p className="mb-2 inline-block text-xs bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200 rounded px-2 py-0.5">
          {session.note}
        </p>
      )}

      <ul className="space-y-1 mb-2">
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
        <p className="text-sm text-black/60 dark:text-white/60">
          Trainer: <span className={session.trainer.playerId === highlightPlayerId ? "font-semibold" : ""}>{session.trainer.displayName}</span>
          {" "}
          <RsvpBadge status={session.trainer.rsvpStatus} />
        </p>
      )}

      {session.ersatz && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Ersatz: <span className={session.ersatz.playerId === highlightPlayerId ? "font-semibold" : ""}>{session.ersatz.displayName}</span>
          {" "}
          <RsvpBadge status={session.ersatz.rsvpStatus} />
        </p>
      )}

      {session.starters.some((a) => a.rsvpStatus === "nein") && session.ersatz && (
        <p className="mt-2 text-xs text-[var(--color-nein)]">
          Ersatz gesucht: bitte {session.ersatz.displayName} fragen
        </p>
      )}
    </div>
  );
}
