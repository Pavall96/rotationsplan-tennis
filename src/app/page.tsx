import Link from "next/link";
import { getFullSchedule } from "@/lib/queries";
import { SessionCard } from "@/components/SessionCard";
import { formatDateForFile } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { ansicht } = await searchParams;
  const showAll = ansicht === "alle";

  const schedule = await getFullSchedule();
  const today = formatDateForFile(new Date());
  const upcoming = schedule.filter((s) => formatDateForFile(s.startsAt) >= today);
  const visible = showAll ? schedule : upcoming;

  const nextDate = upcoming[0] ? formatDateForFile(upcoming[0].startsAt) : null;
  const nextSessions = nextDate ? upcoming.filter((s) => formatDateForFile(s.startsAt) === nextDate) : [];

  const groupedByDate = new Map<string, typeof visible>();
  for (const s of visible) {
    const key = formatDateForFile(s.startsAt);
    if (!groupedByDate.has(key)) groupedByDate.set(key, []);
    groupedByDate.get(key)!.push(s);
  }

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <header className="mb-6">
        <h1 className="text-xl font-bold">Rotationsplan Wintertraining 2026/27</h1>
        <p className="text-sm text-black/60 dark:text-white/60">17 Spieler · 2 Hallen · dienstags</p>
      </header>

      {nextSessions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50 mb-2">
            Nächster Termin
          </h2>
          <div className="space-y-3">
            {nextSessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </section>
      )}

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/?ansicht=kommend"
          className={`px-3 py-1 rounded-full border ${!showAll ? "bg-black text-white dark:bg-white dark:text-black" : "border-black/20 dark:border-white/20"}`}
        >
          Kommende Termine
        </Link>
        <Link
          href="/?ansicht=alle"
          className={`px-3 py-1 rounded-full border ${showAll ? "bg-black text-white dark:bg-white dark:text-black" : "border-black/20 dark:border-white/20"}`}
        >
          Ganze Saison
        </Link>
      </div>

      <section className="space-y-6">
        {[...groupedByDate.entries()].map(([date, sessionsOnDate]) => (
          <div key={date}>
            <div className="space-y-3">
              {sessionsOnDate.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/60">Keine Termine in dieser Ansicht.</p>
        )}
      </section>
    </main>
  );
}
