import Link from "next/link";
import type { SessionView } from "@/lib/queries";
import { calendarHref, formatDateForFile } from "@/lib/format";
import { SessionCard } from "@/components/SessionCard";
import { ArrowLeftIcon } from "@/components/icons";
import { vacancyStatus } from "@/lib/vacancy";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const monthTitleFormatter = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

/** "YYYY-MM" plus a number of months, without touching local timezones. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** All days to draw for a month: leading/trailing nulls pad the grid to full Monday-first weeks. */
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function SeasonCalendar({
  schedule,
  month: requestedMonth,
  day: requestedDay,
}: {
  schedule: SessionView[];
  month?: string;
  day?: string;
}) {
  const today = formatDateForFile(new Date());

  const byDate = new Map<string, SessionView[]>();
  for (const s of schedule) {
    const key = formatDateForFile(s.startsAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(s);
  }
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Noch keine Termine eingetragen.</p>;
  }

  const firstMonth = dates[0].slice(0, 7);
  const lastMonth = dates[dates.length - 1].slice(0, 7);
  const clamp = (m: string) => (m < firstMonth ? firstMonth : m > lastMonth ? lastMonth : m);

  // Default: the month of the next session (or the last one once the season is over).
  const nextDate = dates.find((d) => d >= today) ?? dates[dates.length - 1];
  const month = clamp(/^\d{4}-\d{2}$/.test(requestedMonth ?? "") ? requestedMonth! : nextDate.slice(0, 7));

  const datesInMonth = dates.filter((d) => d.startsWith(month));
  const selectedDay =
    requestedDay && requestedDay.startsWith(month) && byDate.has(requestedDay)
      ? requestedDay
      : (datesInMonth.find((d) => d >= today) ?? datesInMonth[0]);

  const [y, m] = month.split("-").map(Number);
  const title = monthTitleFormatter.format(new Date(Date.UTC(y, m - 1, 1)));
  const prev = month > firstMonth ? shiftMonth(month, -1) : null;
  const next = month < lastMonth ? shiftMonth(month, 1) : null;

  const navClasses =
    "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]";

  return (
    <section id="kalender" className="scroll-mt-4">
      <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div className="mb-3 flex items-center justify-between">
          {prev ? (
            <Link href={calendarHref(prev)} className={navClasses} aria-label="Vorheriger Monat">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          ) : (
            <span className={`${navClasses} opacity-30`} aria-hidden="true">
              <ArrowLeftIcon className="h-4 w-4" />
            </span>
          )}
          <h2 className="font-display text-base font-bold">{title}</h2>
          {next ? (
            <Link href={calendarHref(next)} className={navClasses} aria-label="Nächster Monat">
              <ArrowLeftIcon className="h-4 w-4 rotate-180" />
            </Link>
          ) : (
            <span className={`${navClasses} opacity-30`} aria-hidden="true">
              <ArrowLeftIcon className="h-4 w-4 rotate-180" />
            </span>
          )}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="pb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">
              {w}
            </span>
          ))}
          {monthGrid(month).map((date, i) => {
            if (!date) return <span key={`pad-${i}`} />;
            const sessionsOnDay = byDate.get(date) ?? [];
            const dayNo = Number(date.slice(8));
            const isToday = date === today;
            const isPast = date < today;

            if (sessionsOnDay.length === 0) {
              return (
                <span
                  key={date}
                  className={`flex aspect-square items-center justify-center rounded-xl text-sm ${
                    isToday ? "font-bold text-[var(--color-brand)]" : "text-[var(--color-ink-faint)]"
                  }`}
                >
                  {dayNo}
                </span>
              );
            }

            const isSelected = date === selectedDay;
            const playersMissing = !isPast && sessionsOnDay.some((s) => (vacancyStatus(s)?.open ?? 0) > 0);
            return (
              <Link
                key={date}
                href={calendarHref(month, date)}
                scroll={false}
                aria-current={isSelected ? "date" : undefined}
                aria-label={playersMissing ? `${dayNo}. – Spieler fehlt` : undefined}
                className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold transition-colors ${
                  isSelected
                    ? "bg-[var(--color-brand)] text-[var(--background)]"
                    : "bg-[var(--color-brand-bg)] text-[var(--foreground)]"
                } ${isPast && !isSelected ? "opacity-50" : ""} ${isToday && !isSelected ? "ring-2 ring-[var(--color-brand)]" : ""}`}
              >
                {playersMissing && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-card)] bg-[var(--color-nein)]" />
                )}
                {dayNo}
                <span className="flex gap-0.5">
                  {sessionsOnDay.map((s) => (
                    <span
                      key={s.id}
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected
                          ? "bg-[var(--background)]"
                          : s.courtSlug === "happy-match"
                            ? "bg-[var(--color-platz1)]"
                            : "bg-[var(--color-platz2)]"
                      }`}
                    />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="mt-4 space-y-3">
          {byDate.get(selectedDay)!.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
      {!selectedDay && (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Keine Termine in diesem Monat.</p>
      )}
    </section>
  );
}
