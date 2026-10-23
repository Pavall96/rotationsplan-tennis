import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { getRoster, rosterByPlayer } from "@/lib/roster";
import { getLineups, lineupContext, singlesOrder, type LineupEntry } from "@/lib/lineups";
import { getAvailability, availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import { lineupCheck, isNonGerman, tooManyNonGermans, AGE_CLASS_LABEL, type LineupCheck } from "@/lib/eligibility";
import { getMarks, sameDayClaims, appearances, canMark, type Claim, type Appearance } from "@/lib/marks";
import { getMatchCaptains } from "@/lib/match-captain";
import { coordinationText, sameDayText, whatsappUrl } from "@/lib/invite";
import { formatDayShort, formatTime, playerLabel } from "@/lib/format";
import { addToLineup, removeFromLineup, markPlayer, unmarkPlayer, setMatchCaptain } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamChip } from "@/components/MatchCard";
import { PublishLineupButton } from "@/components/PublishLineupButton";
import { SameDayBlock, type SameDayMatch } from "@/components/SameDayBlock";
import { AlertIcon, ArrowLeftIcon, SparklesIcon } from "@/components/icons";
import { CaptainShell } from "@/components/CaptainShell";

export const dynamic = "force-dynamic";
// Publishing the lineup (a server action on this page) redoes the opponent assessment in after(), which waits for Claude.
export const maxDuration = 300;

type Candidate = {
  playerId: number;
  name: string;
  lists: string;
  position: number | null;
  countsAsGerman: boolean;
  status: AvailabilityStatus | "offen";
  check: LineupCheck;
  markable: boolean;
  claims: Claim[];
  appearances: Appearance[];
};

type MarkedRow = {
  playerId: number;
  name: string;
  lists: string;
  position: number | null;
  check: LineupCheck;
  /** Another team has lined this player up the same day since the mark was set. */
  linedUpElsewhere: Claim | null;
  /** Other teams that marked this player the same day. */
  claims: Claim[];
  status: AvailabilityStatus | "offen";
  /** Name of the non-German starter when this player would be a second one — only Ersatz is possible then. */
  nonGermanHint: string | null;
};

const GROUPS: { key: AvailabilityStatus | "offen"; label: string; color: string }[] = [
  { key: "ja", label: "Können", color: "text-[var(--color-ja)]" },
  { key: "vielleicht", label: "Vielleicht", color: "text-[var(--color-vielleicht)]" },
  { key: "offen", label: "Noch keine Antwort", color: "text-[var(--color-ink-muted)]" },
  { key: "nein", label: "Können nicht", color: "text-[var(--color-nein)]" },
];

const STATUS_LABEL: Record<AvailabilityStatus | "offen", string> = {
  ja: "kann",
  vielleicht: "vielleicht",
  nein: "kann nicht",
  offen: "keine Antwort",
};

const smallButton = "rounded-full px-2.5 py-1 text-[11px] font-semibold";
const markButton = `${smallButton} border border-dashed border-[var(--color-border-strong)] text-[var(--color-ink-muted)]`;

export default async function LineupPage({ params }: PageProps<"/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]">) {
  const { token, matchId: matchIdParam } = await params;
  const matchId = Number(matchIdParam);
  const captain = await getPlayerByToken(token);
  if (!captain) notFound();

  const [allMatches, teamList, roster, lineupsByMatch, answers, marksByMatch, matchCaptains] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getLineups(),
    getAvailability(),
    getMarks(),
    getMatchCaptains(),
  ]);
  const match = allMatches.find((m) => m.id === matchId);
  const team = teamList.find((t) => t.id === match?.team.id);
  if (!match || !team || team.captainPlayerId !== captain.id) notFound();

  const rosters = rosterByPlayer(roster);
  const people = new Map<number, Omit<Candidate, "status" | "check" | "markable" | "claims" | "appearances"> & { playsMatches: boolean }>();
  for (const r of roster) {
    const p = people.get(r.playerId) ?? {
      playerId: r.playerId,
      name: r.name,
      lists: "",
      position: null,
      countsAsGerman: !isNonGerman(rosters.get(r.playerId) ?? {}),
      playsMatches: r.playsMatches,
    };
    const tag = `${r.ageClass === "h30" ? "H30" : "H"} ${r.position}`;
    p.lists = p.lists ? `${p.lists} · ${tag}` : tag;
    if (r.ageClass === match.team.ageClass) p.position = r.position;
    people.set(r.playerId, p);
  }

  const lineup = lineupsByMatch.get(matchId) ?? [];
  const inLineup = new Set(lineup.map((e) => e.playerId));
  const marksHere = (marksByMatch.get(matchId) ?? []).filter((m) => m.playsMatches && !inLineup.has(m.playerId));
  const markedIds = new Set(marksHere.map((m) => m.playerId));
  const day = formatDayShort(match.startsAt);

  const assess = (playerId: number) => {
    const playerRoster = rosters.get(playerId) ?? {};
    const ctx = lineupContext(playerId, people.get(playerId)?.playsMatches ?? true, match, allMatches, lineupsByMatch);
    return { check: lineupCheck(playerRoster, match.team, ctx), markable: canMark(playerRoster, match.team, ctx).ok };
  };
  const claimsOf = (playerId: number) =>
    sameDayClaims(playerId, match, allMatches, lineupsByMatch, marksByMatch, teamList);
  const talkUrl = (playerName: string, claim: Claim) =>
    claim.captainName && claim.captainPlayerId !== captain.id
      ? whatsappUrl(
          coordinationText({
            captainName: claim.captainName,
            day,
            player: playerName,
            myTeam: match.team.name,
            theirTeam: claim.match.team.name,
            kind: claim.kind,
          }),
        )
      : null;

  // Re-checked on every visit: another team's lineup can make an earlier choice invalid (same day, Festspielen).
  const withMeta = (e: LineupEntry) => {
    const check = assess(e.playerId).check;
    return {
      ...e,
      position: people.get(e.playerId)?.position ?? null,
      lists: people.get(e.playerId)?.lists ?? "",
      countsAsGerman: !isNonGerman(rosters.get(e.playerId) ?? {}),
      problem: check.ok ? null : check.reason,
      claims: claimsOf(e.playerId),
    };
  };
  const stamm = singlesOrder(lineup.filter((e) => e.role === "stamm").map(withMeta));
  const doppel = singlesOrder(lineup.filter((e) => e.role === "doppel").map(withMeta));
  const ersatz = singlesOrder(lineup.filter((e) => e.role === "ersatz").map(withMeta));
  const nonGermanStarter = [...stamm, ...doppel].find((e) => !e.countsAsGerman && e.response !== "nein");
  const markedRows: MarkedRow[] = singlesOrder(
    marksHere.map((m) => ({
      playerId: m.playerId,
      name: m.name,
      lists: people.get(m.playerId)?.lists ?? "",
      position: people.get(m.playerId)?.position ?? null,
      check: assess(m.playerId).check,
      linedUpElsewhere: claimsOf(m.playerId).find((c) => c.kind === "aufgestellt") ?? null,
      claims: claimsOf(m.playerId).filter((c) => c.kind === "vorgemerkt"),
      status: answers.get(availabilityKey(m.playerId, match.matchDate)) ?? "offen",
      nonGermanHint:
        nonGermanStarter && isNonGerman(rosters.get(m.playerId) ?? {}) ? nonGermanStarter.name : null,
    })),
  );

  const candidates: Candidate[] = [...people.values()]
    .filter((p) => !inLineup.has(p.playerId) && !markedIds.has(p.playerId))
    .map((p) => ({
      ...p,
      status: answers.get(availabilityKey(p.playerId, match.matchDate)) ?? "offen",
      ...assess(p.playerId),
      claims: claimsOf(p.playerId),
      appearances: appearances(p.playerId, allMatches, lineupsByMatch),
    }));
  const eligible = singlesOrder(candidates.filter((c) => c.check.ok));
  const blocked = candidates.filter((c) => !c.check.ok && c.check.reason !== "Spielt diese Saison nicht");

  const warnings: string[] = [];
  if (tooManyNonGermans([...stamm, ...doppel])) warnings.push("Mehr als ein Nicht-Deutscher aufgestellt (WSPO § 33a Ziff. 1).");
  for (const e of [...stamm, ...doppel, ...ersatz]) {
    if (e.problem) warnings.push(`${e.name} ist nicht mehr spielberechtigt: ${e.problem}.`);
  }
  if (stamm.some((e) => e.position === null)) {
    warnings.push("Nicht jeder steht auf dieser Meldeliste – die Einzel-Reihenfolge ergibt sich erst aus der Wintermeldung.");
  }
  const declined = stamm.filter((e) => e.response === "nein");
  if (declined.length > 0) {
    warnings.unshift(
      `${declined.map((e) => e.name).join(", ")} ${declined.length === 1 ? "hat" : "haben"} abgesagt – entfernen und ${
        ersatz.length ? "Ersatz hochstufen" : "jemand anderen aufstellen"
      }, dann Änderungen veröffentlichen.`,
    );
  }

  // Spieltags-Mannschaftsführer: someone from the lineup who stands in when the captain doesn't play that day.
  const matchCaptain = matchCaptains.get(matchId) ?? null;
  if (matchCaptain && lineup.some((e) => e.playerId === matchCaptain.playerId && e.response === "nein")) {
    warnings.unshift(
      `${matchCaptain.name} ist Mannschaftsführer am Spieltag, hat aber abgesagt – bitte jemand anderen eintragen.`,
    );
  }
  const matchCaptainOptions = [...stamm, ...doppel, ...ersatz].filter(
    (e) => e.playerId !== captain.id && (e.response !== "nein" || e.playerId === matchCaptain?.playerId),
  );

  const sameDay: SameDayMatch[] = allMatches
    .filter((m) => m.matchDate === match.matchDate && m.id !== match.id)
    .map((m) => {
      const entries = lineupsByMatch.get(m.id) ?? [];
      const other = teamList.find((t) => t.id === m.team.id);
      const own = other?.captainPlayerId === captain.id;
      return {
        match: m,
        stamm: entries.filter((e) => e.role === "stamm").map((e) => ({ name: e.name, declined: e.response === "nein" })),
        doppel: entries.filter((e) => e.role === "doppel").map((e) => e.name),
        ersatz: entries.filter((e) => e.role === "ersatz").map((e) => e.name),
        marked: (marksByMatch.get(m.id) ?? []).filter((x) => x.playsMatches).map((x) => x.name),
        captainName: other?.captainName ?? null,
        whatsapp:
          other?.captainName && !own
            ? whatsappUrl(sameDayText({ captainName: other.captainName, day, teams: [m.team.name, match.team.name] }))
            : null,
        own,
      };
    });
  const hidden = { token, matchId };

  return (
    <CaptainShell token={token} active="spiele">
      <Link
        href={`/spieler/${token}/mannschaftsfuehrer`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zum Mannschaftsführer-Bereich
      </Link>

      <header className="my-4">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight">
          {match.isHome ? "gegen" : "bei"} {match.opponent}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {day} · {formatTime(match.startsAt)} Uhr{match.venue ? ` · ${match.venue.name}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/spieler/${token}/punktspiele/meldeliste/${matchId}`}
            className="text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
          >
            Meldeliste {AGE_CLASS_LABEL[match.team.ageClass]} ansehen ›
          </Link>
          <Link
            href={`/spieler/${token}/mannschaftsfuehrer?tab=simulation&tag=${match.matchDate}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand)]"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            Spieltag simulieren ›
          </Link>
        </div>
      </header>

      {/* Wide screens: the lineup stays in view on the left while picking players on the right. */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          {sameDay.length > 0 && (
            <div className="lg:hidden">
              <SameDayBlock matches={sameDay} />
            </div>
          )}

          <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display font-bold">Aufstellung</h2>
              <span
                className={`text-xs font-semibold ${
                  stamm.length - declined.length === match.playersNeeded ? "text-[var(--color-ja)]" : "text-[var(--color-nein)]"
                }`}
              >
                {stamm.length - declined.length} von {match.playersNeeded}
              </span>
            </div>
            <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
              Sortiert nach Meldeliste – in dieser Reihenfolge werden die Einzel gespielt.
              {match.lineupPublishedAt ? " Veröffentlicht, die Spieler sehen sie auf ihrer Seite." : " Noch nicht veröffentlicht."}
            </p>

            <ol className="mb-3 space-y-1.5">
              {stamm.map((e, i) => (
                <LineupRow
                  key={e.playerId}
                  label={`${i + 1}`}
                  entry={e}
                  hidden={hidden}
                  talkFor={(cl) => talkUrl(e.name, cl)}
                  unpublished={Boolean(match.lineupPublishedAt) && !e.published}
                  matchCaptain={e.playerId === matchCaptain?.playerId}
                />
              ))}
              {stamm.length === 0 && <li className="text-sm text-[var(--color-ink-muted)]">Noch niemand aufgestellt.</li>}
            </ol>
            {doppel.length > 0 && (
              <>
                <p className="mb-1 text-xs font-semibold text-[var(--color-ink-muted)]">
                  Nur Doppel <span className="font-normal">– kein Einzel, kommen für die Doppel dazu</span>
                </p>
                <ul className="mb-3 space-y-1.5">
                  {doppel.map((e) => (
                    <LineupRow
                      key={e.playerId}
                      label="D"
                      entry={e}
                      hidden={hidden}
                      talkFor={(cl) => talkUrl(e.name, cl)}
                      promote="Ins Einzel"
                      unpublished={Boolean(match.lineupPublishedAt) && !e.published}
                      matchCaptain={e.playerId === matchCaptain?.playerId}
                    />
                  ))}
                </ul>
              </>
            )}
            {ersatz.length > 0 && (
              <>
                <p className="mb-1 text-xs font-semibold text-[var(--color-ink-muted)]">Ersatz</p>
                <ul className="mb-3 space-y-1.5">
                  {ersatz.map((e) => (
                    <LineupRow
                      key={e.playerId}
                      label="E"
                      entry={e}
                      hidden={hidden}
                      talkFor={(cl) => talkUrl(e.name, cl)}
                      promote="Aufstellen"
                      unpublished={Boolean(match.lineupPublishedAt) && !e.published}
                      matchCaptain={e.playerId === matchCaptain?.playerId}
                    />
                  ))}
                </ul>
              </>
            )}
            {markedRows.length > 0 && (
              <>
                <p className="mb-1 text-xs font-semibold text-[var(--color-ink-muted)]">
                  Vorgemerkt <span className="font-normal">– nur für Mannschaftsführer sichtbar</span>
                </p>
                <ul className="mb-3 space-y-1.5">
                  {markedRows.map((r) => (
                    <MarkRow
                      key={r.playerId}
                      row={r}
                      hidden={hidden}
                      talk={r.linedUpElsewhere ? talkUrl(r.name, r.linedUpElsewhere) : null}
                      talkFor={(cl) => talkUrl(r.name, cl)}
                    />
                  ))}
                </ul>
              </>
            )}

            {lineup.length > 0 && (
              <div className="mb-3 rounded-[10px] border border-[var(--color-border)] px-3 py-2.5">
                <p className="text-xs font-semibold">Mannschaftsführer am Spieltag</p>
                <p className="mb-2 text-[11px] text-[var(--color-ink-muted)]">
                  Spielst du selbst nicht mit? Dann trag jemanden aus der Aufstellung ein. Er sieht die Meldeliste und
                  bekommt die Absagen – aufstellen und veröffentlichen kannst weiterhin nur du.
                </p>
                <ActionForm action={setMatchCaptain} hidden={hidden} className="flex flex-wrap items-center gap-2">
                  <select
                    key={matchCaptain?.playerId ?? "self"}
                    name="playerId"
                    defaultValue={matchCaptain?.playerId ?? ""}
                    aria-label="Mannschaftsführer am Spieltag"
                    className="min-w-0 flex-1 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-2.5 py-2 text-base"
                  >
                    <option value="">{`${playerLabel(captain)} (Mannschaftsführer)`}</option>
                    {matchCaptainOptions.map((e) => (
                      <option key={e.playerId} value={e.playerId}>
                        {`${e.name}${e.role === "ersatz" ? " (Ersatz)" : e.role === "doppel" ? " (nur Doppel)" : ""}${e.response === "nein" ? " – abgesagt" : ""}`}
                      </option>
                    ))}
                  </select>
                  <SubmitButton className={`${smallButton} bg-[var(--color-brand)] text-white`}>Speichern</SubmitButton>
                </ActionForm>
              </div>
            )}

            {warnings.map((w) => (
              <p key={w} className="mb-2 flex gap-1.5 rounded-lg bg-[var(--color-nein-bg)] px-2.5 py-2 text-xs text-[var(--color-nein)]">
                <AlertIcon className="mt-0.5 h-3 w-3 shrink-0" />
                {w}
              </p>
            ))}

            {lineup.length > 0 && (
              <PublishLineupButton token={token} matchId={matchId} published={Boolean(match.lineupPublishedAt)} />
            )}
          </section>
        </div>

        <div>
          {sameDay.length > 0 && (
            <div className="hidden lg:block">
              <SameDayBlock matches={sameDay} />
            </div>
          )}
          <section className="mb-6">
            <h2 className="mb-1 font-display font-bold">Spielberechtigt</h2>
            <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
              Nach Antwort für den {day} gruppiert, innerhalb nach Meldeliste. „Vormerken“ heißt: hätte ich gern – es
              sperrt niemanden und die Spieler sehen es nicht.
            </p>
            <div className="space-y-4">
              {GROUPS.map((g) => {
                const list = eligible.filter((c) => c.status === g.key);
                if (list.length === 0) return null;
                return (
                  <details
                    key={g.key}
                    open={g.key === "ja" || g.key === "vielleicht" || undefined}
                    className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2.5"
                  >
                    <summary className={`cursor-pointer list-none text-sm font-semibold ${g.color}`}>
                      {g.label} ({list.length})
                    </summary>
                    <ul className="mt-2 divide-y divide-[var(--color-border)]">
                      {list.map((c) => (
                        <li key={c.playerId} className="py-2">
                          <span className="block truncate text-sm">{c.name}</span>
                          <span className="text-[11px] text-[var(--color-ink-faint)]">{c.lists}</span>
                          <AppearanceLine appearances={c.appearances} />
                          {c.claims.map((cl) => (
                            <ClaimNote key={cl.match.id} claim={cl} url={talkUrl(c.name, cl)} />
                          ))}
                          {nonGermanStarter && !c.countsAsGerman && (
                            <p className="mt-1 text-[11px] text-[var(--color-h30)]">
                              Nur als Ersatz – {nonGermanStarter.name} ist schon als Nicht-Deutscher aufgestellt
                            </p>
                          )}
                          {c.check.ok &&
                            c.check.warnings.map((w) => (
                              <p key={w} className="mt-1 text-[11px] text-[var(--color-h30)]">
                                {w}
                              </p>
                            ))}
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "stamm" }}>
                              <SubmitButton className={`${smallButton} bg-[var(--color-brand)] text-white`}>
                                Aufstellen
                              </SubmitButton>
                            </ActionForm>
                            <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "doppel" }}>
                              <SubmitButton className={`${smallButton} border border-[var(--color-border-strong)]`}>
                                Nur Doppel
                              </SubmitButton>
                            </ActionForm>
                            <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "ersatz" }}>
                              <SubmitButton className={`${smallButton} border border-[var(--color-border-strong)]`}>
                                Ersatz
                              </SubmitButton>
                            </ActionForm>
                            <ActionForm action={markPlayer} hidden={{ ...hidden, playerId: c.playerId }}>
                              <SubmitButton className={markButton}>Vormerken</SubmitButton>
                            </ActionForm>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>

            {blocked.length > 0 && (
              <details className="mt-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2.5">
                <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--color-ink-muted)]">
                  Nicht spielberechtigt ({blocked.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {blocked.map((c) => (
                    <li key={c.playerId} className="text-sm">
                      {c.name}
                      <span className="block text-[11px] text-[var(--color-ink-faint)]">{!c.check.ok && c.check.reason}</span>
                      {c.markable && (
                        <>
                          {c.claims.map((cl) => (
                            <ClaimNote key={cl.match.id} claim={cl} url={talkUrl(c.name, cl)} />
                          ))}
                          <ActionForm action={markPlayer} hidden={{ ...hidden, playerId: c.playerId }} className="mt-1 inline-block">
                            <SubmitButton className={markButton}>Vormerken</SubmitButton>
                          </ActionForm>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      </div>
    </CaptainShell>
  );
}

function AppearanceLine({ appearances }: { appearances: Appearance[] }) {
  if (appearances.length === 0) return null;
  return (
    <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
      Einsätze: {appearances.map((a) => `${a.teamName} ${a.count}`).join(" · ")}
    </p>
  );
}

function ClaimNote({ claim, url }: { claim: Claim; url: string | null }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--color-h30)]">
      <span>
        ⚠ {claim.kind === "aufgestellt" ? "Aufgestellt bei" : "Auch vorgemerkt von"} {claim.match.team.name}
      </span>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
          Absprechen ›
        </a>
      )}
    </p>
  );
}

function MarkRow({
  row,
  hidden,
  talk,
  talkFor,
}: {
  row: MarkedRow;
  hidden: { token: string; matchId: number };
  talk: string | null;
  talkFor: (claim: Claim) => string | null;
}) {
  const elsewhere = row.linedUpElsewhere;
  const problem = !elsewhere && !row.check.ok ? row.check.reason : null;
  return (
    <li
      className={`flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--color-border-strong)] px-3 py-2 ${
        problem ? "bg-[var(--color-nein-bg)]" : ""
      }`}
    >
      <span className="w-4 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">V</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{row.name}</span>
        <span className="text-[11px] text-[var(--color-ink-faint)]">
          {row.lists} · {STATUS_LABEL[row.status]}
          {elsewhere ? (
            <span className="font-semibold text-[var(--color-h30)]"> · inzwischen bei {elsewhere.match.team.name} aufgestellt</span>
          ) : problem ? (
            <span className="font-semibold text-[var(--color-nein)]"> · {problem}</span>
          ) : null}
        </span>
        {row.nonGermanHint && (
          <span className="mt-0.5 block text-[11px] text-[var(--color-h30)]">
            Nur als Ersatz – {row.nonGermanHint} ist schon als Nicht-Deutscher aufgestellt
          </span>
        )}
        {row.claims.map((cl) => (
          <ClaimNote key={cl.match.id} claim={cl} url={talkFor(cl)} />
        ))}
      </span>
      {elsewhere
        ? talk && (
            <a
              href={talk}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2"
            >
              Absprechen ›
            </a>
          )
        : row.check.ok && (
            <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: row.playerId, role: "stamm" }}>
              <SubmitButton className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2">
                Aufstellen
              </SubmitButton>
            </ActionForm>
          )}
      <ActionForm action={unmarkPlayer} hidden={{ ...hidden, playerId: row.playerId }}>
        <SubmitButton className="text-[11px] text-[var(--color-nein)] underline underline-offset-2">Entfernen</SubmitButton>
      </ActionForm>
    </li>
  );
}

const RESPONSE_LABEL = {
  ja: { text: "zugesagt", color: "text-[var(--color-ja)]" },
  nein: { text: "abgesagt", color: "text-[var(--color-nein)]" },
};

function LineupRow({
  label,
  entry,
  hidden,
  talkFor,
  promote,
  unpublished = false,
  matchCaptain = false,
}: {
  label: string;
  entry: LineupEntry & { lists: string; problem: string | null; claims: Claim[] };
  hidden: { token: string; matchId: number };
  talkFor: (claim: Claim) => string | null;
  /** Label of the button that moves this player into the singles; none for Stammspieler. */
  promote?: string;
  /** Added or changed since the last publish — players don't see it yet. */
  unpublished?: boolean;
  /** This player is the Spieltags-Mannschaftsführer. */
  matchCaptain?: boolean;
}) {
  const response = entry.response ? RESPONSE_LABEL[entry.response] : null;
  return (
    <li
      className={`flex items-center gap-2 rounded-[10px] px-3 py-2 ${
        entry.problem ? "bg-[var(--color-nein-bg)]" : "bg-[var(--color-tabs-bg)]"
      }`}
    >
      <span className="w-4 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">{label}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{entry.name}</span>
        <span className="text-[11px] text-[var(--color-ink-faint)]">
          {entry.lists}
          {matchCaptain && <span className="font-semibold text-[var(--color-brand)]"> · MF am Spieltag</span>}
          {unpublished ? (
            <span className="font-semibold text-[var(--color-h30)]"> · noch nicht veröffentlicht</span>
          ) : response ? (
            <span className={`font-semibold ${response.color}`}> · {response.text}</span>
          ) : entry.notified ? (
            " · benachrichtigt"
          ) : (
            ""
          )}
        </span>
        {entry.claims.map((cl) => (
          <ClaimNote key={cl.match.id} claim={cl} url={talkFor(cl)} />
        ))}
      </span>
      {promote && (
        <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: entry.playerId, role: "stamm" }}>
          <SubmitButton className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2">
            {promote}
          </SubmitButton>
        </ActionForm>
      )}
      <ActionForm action={removeFromLineup} hidden={{ ...hidden, playerId: entry.playerId }}>
        <SubmitButton className="text-[11px] text-[var(--color-nein)] underline underline-offset-2">Entfernen</SubmitButton>
      </ActionForm>
    </li>
  );
}
