import Link from "next/link";
import { getAllMatches, getTeams, groupByDay } from "@/lib/matches";
import { getRidesByMatch } from "@/lib/rides";
import { getLineups } from "@/lib/lineups";
import { formatDateForFile, formatDayShort } from "@/lib/format";
import { MatchCard, teamChipClasses } from "@/components/MatchCard";
import { RideSection } from "@/components/RideSection";
import { LineupLine } from "@/components/LineupLine";

/**
 * Upcoming team matches grouped by day, filterable by team. With a viewer (the personal page) each card gets the
 * interactive Fahrgemeinschaft block; without one only ride counts are shown.
 */
export async function MatchList({
  basePath,
  teamSlug,
  viewer,
}: {
  basePath: string;
  teamSlug: string | undefined;
  viewer: { token: string; playerId: number } | null;
}) {
  const [allMatches, teamList, ridesByMatch, lineupsByMatch] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRidesByMatch(),
    getLineups(),
  ]);

  const selected = teamList.find((t) => t.slug === teamSlug) ?? null;
  const today = formatDateForFile(new Date());
  const days = groupByDay(allMatches.filter((m) => m.matchDate >= today));

  return (
    <>
      <nav className="mb-5 flex flex-wrap gap-2 text-xs font-semibold">
        <Link
          href={basePath}
          className={`rounded-full px-3 py-1.5 ${
            selected ? "bg-[var(--color-tabs-bg)] text-[var(--color-ink-muted)]" : "bg-[var(--color-brand)] text-white"
          }`}
        >
          Alle
        </Link>
        {teamList.map((t) => (
          <Link
            key={t.slug}
            href={`${basePath}?team=${t.slug}`}
            className={`rounded-full px-3 py-1.5 ${
              selected?.slug === t.slug ? "bg-[var(--color-brand)] text-white" : teamChipClasses(t.ageClass)
            }`}
          >
            {t.name}
          </Link>
        ))}
      </nav>

      {selected && (
        <p className="mb-4 text-xs text-[var(--color-ink-muted)]">
          {selected.league}
          {selected.captainName && ` · Mannschaftsführer: ${selected.captainName}`}
        </p>
      )}

      <div className="space-y-6">
        {days.map(({ date, matches: dayMatches }) => {
          const shown = selected ? dayMatches.filter((m) => m.team.id === selected.id) : dayMatches;
          if (shown.length === 0) return null;
          return (
            <section key={date}>
              <h2 className="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                <span>{formatDayShort(date)}</span>
                {!selected && dayMatches.length > 1 && (
                  <span className="normal-case tracking-normal font-semibold text-[var(--color-nein)]">
                    {dayMatches.length} Spiele an diesem Tag
                  </span>
                )}
              </h2>
              <div className="space-y-3">
                {shown.map((m) => (
                  <MatchCard key={m.id} match={m}>
                    <LineupLine match={m} entries={lineupsByMatch.get(m.id) ?? []} viewer={viewer} />
                    <RideSection
                      match={m}
                      data={ridesByMatch.get(m.id) ?? { rides: [], requests: [] }}
                      viewer={viewer}
                    />
                  </MatchCard>
                ))}
              </div>
            </section>
          );
        })}
        {days.length === 0 && <p className="text-sm text-[var(--color-ink-muted)]">Noch keine Spiele eingetragen.</p>}
      </div>
    </>
  );
}
