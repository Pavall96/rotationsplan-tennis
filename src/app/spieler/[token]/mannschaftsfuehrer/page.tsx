import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { getPlayerByToken } from "@/lib/queries";
import { getTeams, getAllMatches, groupByDay, type AgeClass, type MatchView } from "@/lib/matches";
import { getRoster, rosterByPlayer, activeRows } from "@/lib/roster";
import { setPlaysMatches } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { getAvailability, availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import { getLineups, type LineupEntry } from "@/lib/lineups";
import { getMarks, conflictTeams } from "@/lib/marks";
import { AvailabilityOverview } from "@/components/AvailabilityOverview";
import { AvailabilityReminder } from "@/components/AvailabilityReminder";
import { LineupSimulator, type SimDay } from "@/components/LineupSimulator";
import { AGE_CLASS_LABEL, FIXED_POSITIONS, canBeAsked } from "@/lib/eligibility";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateForFile, formatDayShort, formatTime, playerLabel } from "@/lib/format";
import { inviteText, whatsappUrl } from "@/lib/invite";
import { AddPlayerForm } from "@/components/AddPlayerForm";
import { TeamChip } from "@/components/MatchCard";
import { ArrowLeftIcon, ChevronRightIcon } from "@/components/icons";

export const dynamic = "force-dynamic";
// The lineup simulation (a server action on this page) waits for Claude, which can take a while.
export const maxDuration = 120;

export default async function CaptainPage({
  params,
  searchParams,
}: PageProps<"/spieler/[token]/mannschaftsfuehrer">) {
  const { token } = await params;
  const { liste } = await searchParams;
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const teamList = await getTeams();
  const myTeams = teamList.filter((t) => t.captainPlayerId === player.id);
  if (myTeams.length === 0) notFound();

  const db = getDb();
  const [allMatches, allPlayers, roster, answers, lineupsByMatch, baseUrl, marksByMatch] = await Promise.all([
    getAllMatches(),
    db.select().from(players).orderBy(players.displayName),
    getRoster(),
    getAvailability(),
    getLineups(),
    getBaseUrl(),
    getMarks(),
  ]);
  const myTeamIds = new Set(myTeams.map((t) => t.id));
  const listClass: AgeClass = liste === "herren" || liste === "h30" ? liste : myTeams[0].ageClass;
  const list = roster.filter((r) => r.ageClass === listClass);
  const onHerrenList = new Set(roster.filter((r) => r.ageClass === "herren").map((r) => r.playerId));
  const onAnyList = new Set(roster.map((r) => r.playerId));
  const notListed = allPlayers.filter((p) => !onAnyList.has(p.id));
  const registerUrl = `${baseUrl}/registrieren`;
  const today = formatDateForFile(new Date());
  const days = groupByDay(allMatches.filter((m) => m.matchDate >= today));
  const upcoming = days.flatMap(({ matches: dayMatches }) => dayMatches);
  const myMatches = upcoming.filter((m) => myTeamIds.has(m.team.id));
  const otherMatches = upcoming.filter((m) => !myTeamIds.has(m.team.id));
  const active = activeRows(roster);
  const activeRosters = rosterByPlayer(active);
  const activeIds = [...new Set(active.map((r) => r.playerId))];
  const answerCounts = (m: MatchView): AnswerCounts => {
    const counts: AnswerCounts = { ja: 0, vielleicht: 0, nein: 0, offen: 0 };
    for (const id of activeIds) {
      if (!canBeAsked(activeRosters.get(id) ?? {}, m.team)) continue;
      counts[answers.get(availabilityKey(id, m.matchDate)) ?? "offen"]++;
    }
    return counts;
  };
  // Who said kann/vielleicht for each upcoming day (and isn't lined up yet) — the captain can pin or exclude them.
  const simDays: SimDay[] = days.map(({ date, matches: dayMatches }) => {
    const linedUp = new Set(dayMatches.flatMap((m) => (lineupsByMatch.get(m.id) ?? []).map((e) => e.playerId)));
    const seen = new Set<number>();
    const dayPlayers: SimDay["players"] = [];
    for (const r of active) {
      const status = answers.get(availabilityKey(r.playerId, date));
      if (seen.has(r.playerId) || linedUp.has(r.playerId) || (status !== "ja" && status !== "vielleicht")) continue;
      if (!dayMatches.some((m) => canBeAsked(activeRosters.get(r.playerId) ?? {}, m.team))) continue;
      seen.add(r.playerId);
      dayPlayers.push({ playerId: r.playerId, name: r.name, status });
    }
    return {
      date,
      label: `${formatDayShort(date)} · ${dayMatches.map((m) => m.team.name).join(", ")}`,
      matches: dayMatches.map((m) => ({ matchId: m.id, team: m.team.name, ageClass: m.team.ageClass, rank: m.team.rank })),
      players: dayPlayers.sort((a, b) => a.name.localeCompare(b.name, "de")),
    };
  });
  const groupText =
    "Winterspiele 2026/27: Bitte tragt in der App ein, an welchen Spieltagen ihr könnt – " +
    `daraus stellen wir die Teams auf. Einfach hier öffnen: ${baseUrl}/punktspiele`;

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link
        href={`/spieler/${token}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zu meiner Seite
      </Link>

      <header className="my-4">
        <h1 className="font-display text-2xl font-bold">Mannschaftsführer</h1>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {myTeams.map((t) => (
            <TeamChip key={t.id} name={t.name} ageClass={t.ageClass} />
          ))}
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-1 font-display font-bold">Deine Spiele</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Spiel antippen, Spieler aufstellen, dann veröffentlichen – erst dann sehen die Spieler die Aufstellung und
          bekommen eine E-Mail.
        </p>
        <div className="space-y-2.5">
          {myMatches.map((m) => (
            <OwnMatchCard
              key={m.id}
              href={`/spieler/${token}/mannschaftsfuehrer/spiel/${m.id}`}
              match={m}
              entries={lineupsByMatch.get(m.id) ?? []}
              answers={answerCounts(m)}
              conflicts={conflictTeams(m, allMatches, lineupsByMatch, marksByMatch)}
            />
          ))}
          {myMatches.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">Keine anstehenden Spiele mehr.</p>
          )}
        </div>
      </section>

      {otherMatches.length > 0 && (
        <details className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)]">
          <summary className="cursor-pointer list-none px-3.5 py-2.5">
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              Andere Teams
              <span className="shrink-0 whitespace-nowrap text-xs font-normal text-[var(--color-ink-muted)]">
                zum Mitlesen ▾
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
              Wer dort steht, ist am selben Tag für dich gesperrt.
            </span>
          </summary>
          <div className="border-t border-[var(--color-border)]">
            {otherMatches.map((m) => {
              const stamm = (lineupsByMatch.get(m.id) ?? []).filter((e) => e.role === "stamm");
              const doppel = (lineupsByMatch.get(m.id) ?? []).filter((e) => e.role === "doppel");
              return (
                <div key={m.id} className="border-b border-[var(--color-border)] px-3.5 py-2.5 last:border-b-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <TeamChip name={m.team.name} ageClass={m.team.ageClass} />
                      <span className="truncate text-sm">
                        {formatDayShort(m.startsAt)} {formatTime(m.startsAt)} {m.isHome ? "vs" : "@"} {m.opponent}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        m.lineupPublishedAt ? "text-[var(--color-ja)]" : "text-[var(--color-ink-muted)]"
                      }`}
                    >
                      {stamm.length}/{m.playersNeeded}
                      {m.lineupPublishedAt ? " · veröffentlicht" : ""}
                    </span>
                  </span>
                  {stamm.length > 0 && (
                    <span className="mt-0.5 block truncate text-xs text-[var(--color-ink-muted)]">
                      {stamm.map((e) => e.name).join(", ")}
                      {doppel.length > 0 && ` · Doppel: ${doppel.map((e) => e.name).join(", ")}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      <section className="mb-6">
        <h2 className="mb-1 font-display font-bold">Wer kann wann?</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Antworten aller Spieler pro Spieltag – antippen für Namen. Gezählt wird, wer laut Meldeliste für mindestens
          eines der Spiele an dem Tag in Frage kommt. Niemand darf an einem Tag in zwei Mannschaften spielen.
        </p>
        <div className="mb-3">
          <AvailabilityReminder token={token} groupText={groupText} />
        </div>
        <AvailabilityOverview
          days={days}
          roster={active}
          rosters={activeRosters}
          answers={answers}
          lineupHref={(m) => (myTeamIds.has(m.team.id) ? `/spieler/${token}/mannschaftsfuehrer/spiel/${m.id}` : null)}
        />
      </section>

      <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="mb-1 font-display font-bold">Aufstellung simulieren</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Claude schlägt für alle Teams eines Spieltags eine Aufstellung vor – aus den Zusagen, der Meldeliste und wer
          bisher wie oft gespielt hat. Die Spielregeln prüft die App danach selbst. Bereits Aufgestellte bleiben drin.
        </p>
        <LineupSimulator token={token} days={simDays} />
      </section>

      <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="mb-1 font-display font-bold">Spieler hinzufügen</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Alle von der Meldeliste sind schon in der App. Hier nur neue Spieler anlegen – die müssen zusätzlich in
          die Wintermeldung beim WTB, sonst dürfen sie nicht spielen.
        </p>
        <AddPlayerForm token={token} registerUrl={registerUrl} />
      </section>

      <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h2 className="mb-1 font-display font-bold">Meldeliste</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Winter 2026/27 · {list.filter((r) => r.registered).length} von {list.length} in der App eingetragen. Plätze
          1–{FIXED_POSITIONS} sind fest in der 1. Mannschaft.
        </p>
        <div className="mb-3 flex gap-1 rounded-full bg-[var(--color-tabs-bg)] p-1 text-xs">
          {(["herren", "h30"] as const).map((c) => (
            <Link
              key={c}
              href={`/spieler/${token}/mannschaftsfuehrer?liste=${c}`}
              className={`flex-1 rounded-full px-3 py-1.5 text-center font-semibold ${
                listClass === c ? "bg-[var(--color-card)] shadow-sm" : "text-[var(--color-ink-muted)]"
              }`}
            >
              {AGE_CLASS_LABEL[c]}
            </Link>
          ))}
        </div>
        <ol className="divide-y divide-[var(--color-border)] text-sm">
          {list.map((r) => (
            <li key={r.playerId} className="flex items-center gap-2 py-2">
              <span className="w-6 shrink-0 text-right text-xs font-semibold text-[var(--color-ink-faint)]">
                {r.position}
              </span>
              <span className={`min-w-0 flex-1 ${r.playsMatches ? "" : "opacity-50"}`}>
                <span className="block truncate">{r.name}</span>
                <span className="flex flex-wrap gap-x-2 text-[11px] text-[var(--color-ink-muted)]">
                  {r.lk && <span>LK {r.lk.replace(".", ",")}</span>}
                  {r.position <= FIXED_POSITIONS && <span className="font-semibold">fest 1. Mannschaft</span>}
                  {!r.playsMatches && <span className="font-semibold">spielt nicht</span>}
                  {r.ageClass === "h30" && !onHerrenList.has(r.playerId) && (
                    <span className="text-[var(--color-h30)]">nicht auf der Herren-Liste</span>
                  )}
                </span>
              </span>
              <ActionForm
                action={setPlaysMatches}
                hidden={{ token, playerId: r.playerId, playsMatches: String(!r.playsMatches) }}
                className="shrink-0"
              >
                <button type="submit" className="text-[11px] text-[var(--color-ink-faint)] underline underline-offset-2">
                  {r.playsMatches ? "spielt nicht" : "spielt wieder"}
                </button>
              </ActionForm>
              {!r.playsMatches ? null : r.registered ? (
                <span className="shrink-0 text-xs font-semibold text-[var(--color-ja)]">eingetragen</span>
              ) : (
                <a
                  href={whatsappUrl(inviteText(r.name, registerUrl))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
                >
                  Einladen
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>

      {notListed.length > 0 && (
        <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <h2 className="mb-1 font-display font-bold">Nicht auf der Meldeliste ({notListed.length})</h2>
          <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
            Diese Spieler dürfen erst bei Punktspielen mitspielen, wenn sie in der Wintermeldung stehen.
          </p>
          <p className="text-sm">{notListed.map((p) => playerLabel(p)).join(", ")}</p>
        </section>
      )}

    </main>
  );
}

type AnswerCounts = Record<AvailabilityStatus | "offen", number>;

/** One of the captain's own matches: where the lineup stands and one clear way in. */
function OwnMatchCard({
  href,
  match,
  entries,
  answers,
  conflicts,
}: {
  href: string;
  match: MatchView;
  entries: LineupEntry[];
  answers: AnswerCounts;
  conflicts: string[];
}) {
  const stamm = entries.filter((e) => e.role === "stamm");
  const declined = stamm.filter((e) => e.response === "nein").length;
  const doppel = entries.filter((e) => e.role === "doppel");
  const doppelDeclined = doppel.filter((e) => e.response === "nein").length;
  const published = Boolean(match.lineupPublishedAt);
  const unpublishedChanges = published && entries.some((e) => !e.published);
  const full = stamm.length - declined >= match.playersNeeded;

  const status = !published
    ? { text: stamm.length ? "Noch nicht veröffentlicht" : "Noch niemand aufgestellt", color: "text-[var(--color-ink-muted)]" }
    : declined > 0
      ? { text: `${declined} ${declined === 1 ? "Absage" : "Absagen"} – Ersatz nötig`, color: "text-[var(--color-nein)]" }
      : doppelDeclined > 0
        ? { text: `${doppelDeclined} ${doppelDeclined === 1 ? "Absage" : "Absagen"} im Doppel`, color: "text-[var(--color-h30)]" }
        : unpublishedChanges
          ? { text: "Änderungen noch nicht veröffentlicht", color: "text-[var(--color-h30)]" }
          : { text: "Veröffentlicht", color: "text-[var(--color-ja)]" };
  const action =
    !stamm.length && !doppel.length
      ? "Aufstellen"
      : published && !declined && !doppelDeclined && !unpublishedChanges
        ? "Ansehen"
        : "Weiter";

  return (
    <Link
      href={href}
      className="block rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-3.5"
    >
      <span className="flex items-center justify-between gap-2">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <span className="text-xs font-semibold text-[var(--color-ink-muted)]">
          {formatDayShort(match.startsAt)} · {formatTime(match.startsAt)}
        </span>
      </span>
      <span className="mt-2 block font-display text-lg font-bold leading-tight">
        {match.isHome ? "gegen" : "bei"} {match.opponent}
      </span>
      <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
        <span className="font-semibold text-[var(--color-ja)]">{answers.ja} können</span> · {answers.vielleicht}{" "}
        vielleicht · {answers.nein} nicht · {answers.offen} offen
      </span>
      {conflicts.length > 0 && (
        <span className="mt-1 block text-xs font-semibold text-[var(--color-h30)]">
          ⚠ Absprache mit {conflicts.join(", ")} offen
        </span>
      )}
      {stamm.length > 0 && (
        <span className="mt-1.5 block truncate text-xs">{stamm.map((e) => e.name).join(", ")}</span>
      )}
      {doppel.length > 0 && (
        <span className="mt-0.5 block truncate text-xs text-[var(--color-ink-muted)]">
          Nur Doppel: {doppel.map((e) => e.name).join(", ")}
        </span>
      )}
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="min-w-0">
          <span className={`block text-sm font-bold ${full ? "text-[var(--color-ja)]" : ""}`}>
            {stamm.length - declined} von {match.playersNeeded} aufgestellt
          </span>
          <span className={`block text-[11px] font-semibold ${status.color}`}>{status.text}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand)] py-2 pl-4 pr-3 text-sm font-semibold text-white">
          {action}
          <ChevronRightIcon className="h-4 w-4" />
        </span>
      </span>
    </Link>
  );
}
