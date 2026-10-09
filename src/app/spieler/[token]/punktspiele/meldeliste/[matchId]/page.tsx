import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { getRoster } from "@/lib/roster";
import { getLineups } from "@/lib/lineups";
import { getMatchCaptains } from "@/lib/match-captain";
import { officialName, MELDELISTE_SOURCE } from "@/lib/meldeliste";
import { AGE_CLASS_LABEL, FIXED_POSITIONS } from "@/lib/eligibility";
import { formatDayShort, formatTime } from "@/lib/format";
import { TeamChip } from "@/components/MatchCard";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MeldelistePage({
  params,
}: PageProps<"/spieler/[token]/punktspiele/meldeliste/[matchId]">) {
  const { token, matchId: matchIdParam } = await params;
  const matchId = Number(matchIdParam);
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const [allMatches, teamList, roster, matchCaptains] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getMatchCaptains(),
  ]);
  const match = allMatches.find((m) => m.id === matchId);
  if (!match) notFound();

  // Only the Mannschaftsführer and this match's Spieltags-Mannschaftsführer — the list carries WTB ID numbers.
  const isCaptain = teamList.some((t) => t.captainPlayerId === player.id);
  const ownTeam = teamList.some((t) => t.id === match.team.id && t.captainPlayerId === player.id);
  if (!isCaptain && matchCaptains.get(matchId)?.playerId !== player.id) notFound();

  // The team's own Mannschaftsführer sees the lineup as planned; everyone else only what is published.
  const entries = ((await getLineups({ publishedOnly: !ownTeam })).get(matchId) ?? []).filter((e) => e.response !== "nein");
  const list = roster.filter((r) => r.ageClass === match.team.ageClass);
  const stammIds = new Set(entries.filter((e) => e.role === "stamm").map((e) => e.playerId));
  const ersatzIds = new Set(entries.filter((e) => e.role === "ersatz").map((e) => e.playerId));
  // Singles are played in Meldeliste order (§ 33b Ziff. 1): number the starters as the list runs.
  const singles = new Map<number, number>();
  for (const r of list) if (stammIds.has(r.playerId)) singles.set(r.playerId, singles.size + 1);
  const listed = new Set(list.map((r) => r.playerId));
  const offList = entries.filter((e) => !listed.has(e.playerId));

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link
        href={ownTeam ? `/spieler/${token}/mannschaftsfuehrer/spiel/${matchId}` : `/spieler/${token}/punktspiele#spiel-${matchId}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {ownTeam ? "Zur Aufstellung" : "Zu den Winterspielen"}
      </Link>

      <header className="my-4">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight">
          Meldeliste {AGE_CLASS_LABEL[match.team.ageClass]}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {formatDayShort(match.startsAt)} · {formatTime(match.startsAt)} Uhr · {match.isHome ? "gegen" : "bei"}{" "}
          {match.opponent}
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          {MELDELISTE_SOURCE}. Plätze 1–{FIXED_POSITIONS} sind fest in der 1. Mannschaft. Die Einzel werden in der
          Reihenfolge der Liste gespielt.
        </p>
      </header>

      <ol className="divide-y divide-[var(--color-border)] rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 text-sm">
        {list.map((r) => {
          const single = singles.get(r.playerId);
          const ersatz = ersatzIds.has(r.playerId);
          return (
            <li key={r.playerId} className="flex items-center gap-2 py-2">
              <span className="w-6 shrink-0 text-right text-xs font-semibold text-[var(--color-ink-faint)]">
                {r.position}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${single || ersatz ? "font-semibold" : ""}`}>
                  {officialName(r.wtbId, r.name)}
                  {r.nationality ? ` (${r.nationality})` : ""}
                </span>
                <span className="flex flex-wrap gap-x-2 text-[11px] text-[var(--color-ink-muted)]">
                  {r.wtbId && <span>ID {r.wtbId}</span>}
                  {r.lk && <span>LK {r.lk.replace(".", ",")}</span>}
                  {!r.countsAsGerman && <span className="text-[var(--color-h30)]">zählt als Nicht-Deutscher</span>}
                </span>
              </span>
              {single ? (
                <span className="shrink-0 rounded-full bg-[var(--color-ja-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ja)]">
                  Einzel {single}
                </span>
              ) : ersatz ? (
                <span className="shrink-0 rounded-full bg-[var(--color-vielleicht-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-vielleicht)]">
                  Ersatz
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {offList.length > 0 && (
        <p className="mt-3 text-xs text-[var(--color-h30)]">
          Aufgestellt, aber nicht auf dieser Liste: {offList.map((e) => e.name).join(", ")} – spielberechtigt nur, wenn
          sie in der Wintermeldung stehen.
        </p>
      )}
    </main>
  );
}
