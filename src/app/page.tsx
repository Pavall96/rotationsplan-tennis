import Link from "next/link";
import Image from "next/image";
import { getFullSchedule } from "@/lib/queries";
import { SessionCard } from "@/components/SessionCard";
import { formatDateForFile } from "@/lib/format";
import { MyPageLink } from "@/components/MyPageLink";
import { SeasonCalendar } from "@/components/SeasonCalendar";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { ansicht, monat, tag } = await searchParams;
  // "alle" was the old "Ganze Saison" tab; old links land on the calendar, which now covers the whole season.
  const showCalendar = ansicht === "kalender" || ansicht === "alle";

  const schedule = await getFullSchedule();
  const today = formatDateForFile(new Date());
  const upcoming = schedule.filter((s) => formatDateForFile(s.startsAt) >= today);

  const nextDate = upcoming[0] ? formatDateForFile(upcoming[0].startsAt) : null;
  const nextSessions = nextDate ? upcoming.filter((s) => formatDateForFile(s.startsAt) === nextDate) : [];

  // The next session(s) already get their own hero section above — don't repeat them in the list below.
  const nextIds = new Set(nextSessions.map((s) => s.id));
  const restUpcoming = upcoming.filter((s) => !nextIds.has(s.id));


  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <header className="mb-6 flex items-center gap-2.5">
        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <Image src="/logo.png" alt="TC Sonnenbrunnen" width={36} height={36} priority className="h-full w-full object-cover" />
        </span>
        <div>
          <h1 className="font-display text-lg font-bold leading-tight">Rotationsplan</h1>
          <p className="text-xs text-[var(--color-ink-muted)]">Wintertraining 2026/27</p>
        </div>
      </header>

      <MyPageLink />

      {!showCalendar && nextSessions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Nächster Termin
          </h2>
          <div className="space-y-3">
            {nextSessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-4 flex gap-1 rounded-full bg-[var(--color-tabs-bg)] p-1 text-sm">
        <Link
          href="/"
          className={`flex-1 rounded-full px-3 py-2 text-center font-semibold transition-colors ${
            !showCalendar
              ? "bg-[var(--color-card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--color-ink-muted)]"
          }`}
        >
          Kommende Termine
        </Link>
        <Link
          href="/?ansicht=kalender"
          className={`flex-1 rounded-full px-3 py-2 text-center font-semibold transition-colors ${
            showCalendar
              ? "bg-[var(--color-card)] text-[var(--foreground)] shadow-sm"
              : "text-[var(--color-ink-muted)]"
          }`}
        >
          Kalender
        </Link>
      </div>

      {showCalendar ? (
        <SeasonCalendar
          schedule={schedule}
          month={typeof monat === "string" ? monat : undefined}
          day={typeof tag === "string" ? tag : undefined}
        />
      ) : (
        <section className="space-y-3">
          {restUpcoming.map((s) => (
            <SessionCard key={s.id} session={s} variant="compact" />
          ))}
          {restUpcoming.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">Keine weiteren Termine in dieser Saison.</p>
          )}
        </section>
      )}
    </main>
  );
}
