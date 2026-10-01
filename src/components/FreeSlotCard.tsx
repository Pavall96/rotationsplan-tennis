import type { SessionView } from "@/lib/queries";
import { formatDate, formatTimeRange } from "@/lib/format";
import { lineup, openSlots } from "@/lib/vacancy";
import { jumpIn } from "@/app/spieler/[token]/actions";
import { JumpInForm } from "@/components/JumpInForm";
import { PinIcon } from "@/components/icons";

export function FreeSlotCard({ token, session }: { token: string; session: SessionView }) {
  const open = openSlots(session);
  const playing = lineup(session)
    .filter((a) => a.rsvpStatus !== "nein")
    .map((a) => a.displayName);
  const isPlatz1 = session.courtSlug === "happy-match";
  const chipColorClasses = isPlatz1
    ? "text-[var(--color-platz1)] bg-[var(--color-platz1-bg)]"
    : "text-[var(--color-platz2)] bg-[var(--color-platz2-bg)]";

  return (
    <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px]">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-bold whitespace-nowrap">{formatDate(session.startsAt)}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">{formatTimeRange(session.startsAt, session.endsAt)}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${chipColorClasses}`}
        >
          <PinIcon />
          {session.hallName}
          {session.withCoach ? " · mit Trainer" : ""}
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--color-nein)]">
        {open === 1 ? "1 Platz frei" : `${open} Plätze frei`}
      </p>
      <p className="text-sm">Mit dabei: {playing.join(", ")}</p>
      <JumpInForm token={token} sessionId={session.id} action={jumpIn} />
    </div>
  );
}
