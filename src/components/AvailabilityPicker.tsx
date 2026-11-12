import Link from "next/link";
import { setAvailability } from "@/app/spieler/[token]/punktspiele/actions";
import { ActionForm } from "@/components/ActionForm";
import { TeamChip } from "@/components/MatchCard";
import { CheckIcon, XIcon } from "@/components/icons";
import { formatDayShort, formatTime } from "@/lib/format";
import { availabilityKey, type AvailabilityStatus, type DayCrowd, type PollDay } from "@/lib/availability";

const OPTIONS: { status: AvailabilityStatus; label: string; on: string; off: string }[] = [
  {
    status: "ja",
    label: "Kann",
    on: "bg-[var(--color-ja)] text-white",
    off: "bg-[var(--color-ja-bg)] text-[var(--color-ja)]",
  },
  {
    status: "vielleicht",
    label: "Vielleicht",
    on: "bg-[var(--color-vielleicht)] text-white dark:text-black",
    off: "bg-[var(--color-vielleicht-bg)] text-[var(--color-vielleicht)]",
  },
  {
    status: "nein",
    label: "Kann nicht",
    on: "bg-[var(--color-nein)] text-white",
    off: "bg-[var(--color-nein-bg)] text-[var(--color-nein)]",
  },
];

/** "Wann kannst du spielen?" — one row per upcoming Spieltag with Kann / Vielleicht / Kann nicht. */
export function AvailabilityPicker({
  token,
  playerId,
  days,
  answers,
  crowd,
}: {
  token: string;
  playerId: number;
  days: PollDay[];
  answers: Map<string, AvailabilityStatus>;
  /** What the others answered, per Spieltag; omitted: nothing shown. */
  crowd?: Map<string, DayCrowd>;
}) {
  if (days.length === 0) return null;
  const answered = days.filter((d) => answers.has(availabilityKey(playerId, d.date))).length;

  return (
    <section
      id="verfuegbarkeit"
      className="mb-6 scroll-mt-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <h2 className="font-display font-bold">Winterspiele: Wann kannst du spielen?</h2>
      <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
        {answered === days.length
          ? "Danke, alles beantwortet! Du kannst deine Antworten jederzeit ändern."
          : `${answered} von ${days.length} Spieltagen beantwortet. Die Mannschaftsführer stellen daraus die Teams auf.`}
      </p>

      <ul className="divide-y divide-[var(--color-border)]">
        {days.map((day) => {
          const current = answers.get(availabilityKey(playerId, day.date));
          return (
            <li key={day.date} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/spieler/${token}/punktspiele/tag/${day.date}`}
                  className="mr-1 text-sm font-semibold underline decoration-[var(--color-border-strong)] underline-offset-4"
                >
                  {formatDayShort(day.date)} ›
                </Link>
                {day.matches.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)]">
                    <TeamChip name={m.team.name} ageClass={m.team.ageClass} />
                    {formatTime(m.startsAt)}
                  </span>
                ))}
              </div>
              <ActionForm action={setAvailability} hidden={{ token, date: day.date }} className="flex gap-1.5">
                {OPTIONS.map((o) => (
                  <button
                    key={o.status}
                    type="submit"
                    name="status"
                    value={o.status}
                    aria-pressed={current === o.status}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-[12px] px-2 py-2.5 text-xs font-semibold ${
                      current === o.status ? o.on : o.off
                    }`}
                  >
                    {o.status === "ja" && <CheckIcon className="h-3 w-3" />}
                    {o.status === "nein" && <XIcon className="h-3 w-3" />}
                    {o.label}
                  </button>
                ))}
              </ActionForm>
              <CrowdLine crowd={crowd?.get(day.date)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CrowdLine({ crowd }: { crowd: DayCrowd | undefined }) {
  if (!crowd) return null;
  return (
    <div className="mt-2 space-y-0.5 text-xs text-[var(--color-ink-muted)]">
      <p>
        <span className="font-semibold text-[var(--color-ja)]">Können ({crowd.ja.length}):</span>{" "}
        {crowd.ja.length > 0 ? crowd.ja.join(", ") : "noch niemand"}
      </p>
      {crowd.vielleicht.length > 0 && (
        <p>
          <span className="font-semibold text-[var(--color-vielleicht)]">Vielleicht ({crowd.vielleicht.length}):</span>{" "}
          {crowd.vielleicht.join(", ")}
        </p>
      )}
      {crowd.open > 0 && <p>Noch offen: {crowd.open}</p>}
    </div>
  );
}
