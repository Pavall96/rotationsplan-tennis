import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { getRoster, rosterByPlayer } from "@/lib/roster";
import { getLineups, lineupContext, singlesOrder, type LineupEntry } from "@/lib/lineups";
import { getAvailability, availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import { lineupCheck, isNonGerman, tooManyNonGermans, type LineupCheck } from "@/lib/eligibility";
import { formatDayShort, formatTime } from "@/lib/format";
import { addToLineup, removeFromLineup } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamChip } from "@/components/MatchCard";
import { PublishLineupButton } from "@/components/PublishLineupButton";
import { AlertIcon, ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

type Candidate = {
  playerId: number;
  name: string;
  lists: string;
  position: number | null;
  countsAsGerman: boolean;
  status: AvailabilityStatus | "offen";
  check: LineupCheck;
};

const GROUPS: { key: AvailabilityStatus | "offen"; label: string; color: string }[] = [
  { key: "ja", label: "Können", color: "text-[var(--color-ja)]" },
  { key: "vielleicht", label: "Vielleicht", color: "text-[var(--color-vielleicht)]" },
  { key: "offen", label: "Noch keine Antwort", color: "text-[var(--color-ink-muted)]" },
  { key: "nein", label: "Können nicht", color: "text-[var(--color-nein)]" },
];

const smallButton = "rounded-full px-2.5 py-1 text-[11px] font-semibold";

export default async function LineupPage({ params }: PageProps<"/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]">) {
  const { token, matchId: matchIdParam } = await params;
  const matchId = Number(matchIdParam);
  const captain = await getPlayerByToken(token);
  if (!captain) notFound();

  const [allMatches, teamList, roster, lineupsByMatch, answers] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getLineups(),
    getAvailability(),
  ]);
  const match = allMatches.find((m) => m.id === matchId);
  const team = teamList.find((t) => t.id === match?.team.id);
  if (!match || !team || team.captainPlayerId !== captain.id) notFound();

  const rosters = rosterByPlayer(roster);
  const people = new Map<number, Omit<Candidate, "status" | "check"> & { playsMatches: boolean }>();
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
  // Re-checked on every visit: another team's lineup can make an earlier choice invalid (same day, Festspielen).
  const withMeta = (e: LineupEntry) => {
    const check = lineupCheck(
      rosters.get(e.playerId) ?? {},
      match.team,
      lineupContext(e.playerId, people.get(e.playerId)?.playsMatches ?? true, match, allMatches, lineupsByMatch),
    );
    return {
      ...e,
      position: people.get(e.playerId)?.position ?? null,
      lists: people.get(e.playerId)?.lists ?? "",
      countsAsGerman: !isNonGerman(rosters.get(e.playerId) ?? {}),
      problem: check.ok ? null : check.reason,
    };
  };
  const stamm = singlesOrder(lineup.filter((e) => e.role === "stamm").map(withMeta));
  const ersatz = singlesOrder(lineup.filter((e) => e.role === "ersatz").map(withMeta));

  const candidates: Candidate[] = [...people.values()]
    .filter((p) => !inLineup.has(p.playerId))
    .map((p) => ({
      ...p,
      status: answers.get(availabilityKey(p.playerId, match.matchDate)) ?? "offen",
      check: lineupCheck(
        rosters.get(p.playerId) ?? {},
        match.team,
        lineupContext(p.playerId, p.playsMatches, match, allMatches, lineupsByMatch),
      ),
    }));
  const eligible = singlesOrder(candidates.filter((c) => c.check.ok));
  const blocked = candidates.filter((c) => !c.check.ok && c.check.reason !== "Spielt diese Saison nicht");

  const warnings: string[] = [];
  if (tooManyNonGermans(stamm)) warnings.push("Mehr als ein Nicht-Deutscher aufgestellt (WSPO § 33a Ziff. 1).");
  for (const e of [...stamm, ...ersatz]) {
    if (e.problem) warnings.push(`${e.name} ist nicht mehr spielberechtigt: ${e.problem}.`);
  }
  const nonGermanStarter = stamm.find((e) => !e.countsAsGerman && e.response !== "nein");
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
  const otherToday = allMatches.filter((m) => m.matchDate === match.matchDate && m.id !== match.id);
  const hidden = { token, matchId };

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
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
          {formatDayShort(match.startsAt)} · {formatTime(match.startsAt)} Uhr{match.venue ? ` · ${match.venue.name}` : ""}
        </p>
        {otherToday.length > 0 && (
          <p className="mt-1 text-xs text-[var(--color-nein)]">
            Am selben Tag: {otherToday.map((m) => m.team.name).join(", ")} – dort Aufgestellte sind hier gesperrt.
          </p>
        )}
      </header>

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
            <LineupRow key={e.playerId} label={`${i + 1}`} entry={e} hidden={hidden} />
          ))}
          {stamm.length === 0 && <li className="text-sm text-[var(--color-ink-muted)]">Noch niemand aufgestellt.</li>}
        </ol>
        {ersatz.length > 0 && (
          <>
            <p className="mb-1 text-xs font-semibold text-[var(--color-ink-muted)]">Ersatz</p>
            <ul className="mb-3 space-y-1.5">
              {ersatz.map((e) => (
                <LineupRow key={e.playerId} label="E" entry={e} hidden={hidden} promote />
              ))}
            </ul>
          </>
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

      <section className="mb-6">
        <h2 className="mb-1 font-display font-bold">Spielberechtigt</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Nach Antwort für den {formatDayShort(match.startsAt)} gruppiert, innerhalb nach Meldeliste.
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
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{c.name}</span>
                          <span className="text-[11px] text-[var(--color-ink-faint)]">{c.lists}</span>
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "stamm" }}>
                            <SubmitButton className={`${smallButton} bg-[var(--color-brand)] text-white`}>
                              Aufstellen
                            </SubmitButton>
                          </ActionForm>
                          <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "ersatz" }}>
                            <SubmitButton className={`${smallButton} border border-[var(--color-border-strong)]`}>
                              Ersatz
                            </SubmitButton>
                          </ActionForm>
                        </span>
                      </div>
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
            <ul className="mt-2 space-y-1.5">
              {blocked.map((c) => (
                <li key={c.playerId} className="text-sm">
                  {c.name}
                  <span className="block text-[11px] text-[var(--color-ink-faint)]">{!c.check.ok && c.check.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
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
  promote = false,
}: {
  label: string;
  entry: LineupEntry & { lists: string; problem: string | null };
  hidden: { token: string; matchId: number };
  promote?: boolean;
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
          {response ? (
            <span className={`font-semibold ${response.color}`}> · {response.text}</span>
          ) : entry.notified ? (
            " · benachrichtigt"
          ) : (
            ""
          )}
        </span>
      </span>
      {promote && (
        <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: entry.playerId, role: "stamm" }}>
          <SubmitButton className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2">
            Aufstellen
          </SubmitButton>
        </ActionForm>
      )}
      <ActionForm action={removeFromLineup} hidden={{ ...hidden, playerId: entry.playerId }}>
        <SubmitButton className="text-[11px] text-[var(--color-nein)] underline underline-offset-2">Entfernen</SubmitButton>
      </ActionForm>
    </li>
  );
}
