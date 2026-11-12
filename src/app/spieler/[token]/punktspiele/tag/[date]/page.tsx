import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { activeRows, getRoster } from "@/lib/roster";
import { getLineups, plays } from "@/lib/lineups";
import { getMatchCaptains, matchDayCaptain } from "@/lib/match-captain";
import { dayVotes, getAvailability } from "@/lib/availability";
import { formatDayShort, formatTime } from "@/lib/format";
import { HomeAwayBadge, TeamChip } from "@/components/MatchCard";
import { LineupLine } from "@/components/LineupLine";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

/** One Spieltag in detail: its matches with the published lineup, and who answered what in the Abstimmung. */
export default async function SpieltagPage({ params }: PageProps<"/spieler/[token]/punktspiele/tag/[date]">) {
  const { token, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const [allMatches, teamList, roster, answers, lineupsByMatch, matchCaptains] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getAvailability(),
    getLineups({ publishedOnly: true }),
    getMatchCaptains(),
  ]);
  const dayMatches = allMatches.filter((m) => m.matchDate === date);
  if (dayMatches.length === 0) notFound();

  const votes = dayVotes(date, allMatches, answers, activeRows(roster));
  const viewer = { token, playerId: player.id };
  // Who is lined up (and hasn't cancelled) that day, with the team — marks the names in the vote lists.
  const playingFor = new Map<number, string[]>();
  for (const m of dayMatches) {
    for (const e of lineupsByMatch.get(m.id) ?? []) {
      if (!plays(e.role) || e.response === "nein") continue;
      playingFor.set(e.playerId, [...(playingFor.get(e.playerId) ?? []), m.team.name]);
    }
  }
  const anyLineup = dayMatches.some((m) => m.lineupPublishedAt);

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link
        href={`/spieler/${token}/punktspiele`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zu den Winterspielen
      </Link>

      <header className="my-4">
        <h1 className="font-display text-2xl font-bold">{formatDayShort(date)}</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {dayMatches.length > 1 ? `${dayMatches.length} Spiele an diesem Tag` : "Ein Spiel an diesem Tag"}
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">Wer spielt</h2>
        <div className="space-y-3">
          {dayMatches.map((m) => {
            const entries = lineupsByMatch.get(m.id) ?? [];
            const captain = matchDayCaptain(m, teamList, matchCaptains, entries);
            return (
              <div key={m.id} className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <TeamChip name={m.team.name} ageClass={m.team.ageClass} />
                  <HomeAwayBadge isHome={m.isHome} />
                </div>
                <p className="font-display font-bold leading-snug">
                  {m.isHome ? "gegen" : "bei"} {m.opponent}
                </p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {formatTime(m.startsAt)} Uhr{m.venue ? ` · ${m.venue.name}` : ""}
                </p>
                {captain && (
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Mannschaftsführer:{" "}
                    <span className="font-semibold text-[var(--color-ink)]">
                      {captain.playerId === player.id ? "du" : captain.name}
                    </span>
                  </p>
                )}
                {m.lineupPublishedAt ? (
                  <LineupLine match={m} entries={entries} viewer={viewer} matchCaptain={matchCaptains.get(m.id)} />
                ) : (
                  <p className="mt-3 rounded-[14px] bg-[var(--color-tabs-bg)] px-3 py-2.5 text-sm text-[var(--color-ink-muted)]">
                    Aufstellung noch nicht veröffentlicht.
                  </p>
                )}
                <Link
                  href={`/spieler/${token}/punktspiele#spiel-${m.id}`}
                  className="mt-3 inline-block text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
                >
                  Spielkarte mit Fahrgemeinschaft ›
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="font-display font-bold">Abstimmung</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          {votes.ja.length} können · {votes.vielleicht.length} vielleicht · {votes.nein} können nicht · {votes.open} noch
          offen
        </p>
        <VoteList
          title="Können"
          tone="ja"
          people={votes.ja}
          playingFor={playingFor}
          showPlaying={anyLineup}
          me={player.id}
        />
        <VoteList
          title="Vielleicht"
          tone="vielleicht"
          people={votes.vielleicht}
          playingFor={playingFor}
          showPlaying={anyLineup}
          me={player.id}
        />
      </section>
    </main>
  );
}

function VoteList({
  title,
  tone,
  people,
  playingFor,
  showPlaying,
  me,
}: {
  title: string;
  tone: "ja" | "vielleicht";
  people: { playerId: number; name: string }[];
  playingFor: Map<number, string[]>;
  showPlaying: boolean;
  me: number;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <h3 className={`mb-1 text-xs font-bold uppercase tracking-wide ${
          tone === "ja" ? "text-[var(--color-ja)]" : "text-[var(--color-vielleicht)]"
        }`}>
        {title} ({people.length})
      </h3>
      {people.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">niemand</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((p) => {
            const teams = playingFor.get(p.playerId);
            return (
              <li
                key={p.playerId}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  tone === "ja"
                    ? "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
                    : "bg-[var(--color-vielleicht-bg)] text-[var(--color-vielleicht)]"
                } ${p.playerId === me ? "ring-2 ring-[var(--color-brand)]" : ""}`}
              >
                {p.playerId === me ? "Du" : p.name}
                {showPlaying && teams && <span className="font-normal"> · spielt {teams.join(", ")}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
