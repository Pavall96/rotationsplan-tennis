import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFullSchedule,
  getPlayerByToken,
  sessionsForPlayer,
  myRoleInSession,
} from "@/lib/queries";
import { formatDate, formatTimeRange, formatDateForFile, playerLabel, mapsUrl } from "@/lib/format";
import { getBaseUrl } from "@/lib/base-url";
import { RsvpForm } from "@/components/RsvpForm";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { FirstVisitGuide } from "@/components/FirstVisitGuide";
import { RememberMyPage } from "@/components/MyPageLink";
import { ArrowLeftIcon, CalendarIcon, ChevronRightIcon, PinIcon } from "@/components/icons";
import { getTeams, getAllMatches } from "@/lib/matches";
import { getPlayerRoster } from "@/lib/roster";
import { getAvailability, pollDaysForPlayer } from "@/lib/availability";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { getLineups } from "@/lib/lineups";
import { MatchCard } from "@/components/MatchCard";
import { LineupLine } from "@/components/LineupLine";
import { FreeSlotCard } from "@/components/FreeSlotCard";
import { jumpInOptions } from "@/lib/einspringen";
import { lineup, openSlots } from "@/lib/vacancy";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params, searchParams }: PageProps<"/spieler/[token]">) {
  const { token } = await params;
  const { vergeben } = await searchParams;

  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const [schedule, teamList, allMatches, roster, answers, lineupsByMatch] = await Promise.all([
    getFullSchedule(),
    getTeams(),
    getAllMatches(),
    getPlayerRoster(player.id),
    getAvailability(),
    getLineups({ publishedOnly: true }),
  ]);
  const myMatches = allMatches.filter(
    (m) =>
      m.lineupPublishedAt &&
      m.matchDate >= formatDateForFile(new Date()) &&
      (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === player.id),
  );
  const pollDays = player.playsMatches ? pollDaysForPlayer(roster, allMatches) : [];
  const captainOf = teamList.filter((t) => t.captainPlayerId === player.id);
  const mySessions = sessionsForPlayer(schedule, player.id);
  const baseUrl = await getBaseUrl();

  const today = formatDateForFile(new Date());
  const upcoming = mySessions.filter(
    (s) => formatDateForFile(s.startsAt) >= today && myRoleInSession(s, player.id) !== "ersatz",
  );

  // "Spieltage" counts starter (and trainer) slots, matching the workbook's COUNTIF (which excludes Ersatz).
  const starterSessions = mySessions.filter((s) => {
    const role = myRoleInSession(s, player.id);
    return role === "starter" || role === "trainer";
  });
  const mitCount = starterSessions.filter((s) => s.withCoach).length;
  const ohneCount = starterSessions.filter((s) => !s.withCoach).length;

  // Players who only play team matches (added by a Mannschaftsführer) have no training sessions at all.
  const trains = mySessions.length > 0;

  const freeSlots = jumpInOptions(schedule, player.id, new Date());
  // Set when "Ich springe ein" lost the race; the place went to someone quicker.
  const missedSlot = vergeben ? schedule.find((s) => s.id === Number(vergeben)) : undefined;

  const webcalUrl = `${baseUrl.replace(/^https?:/, "webcal:")}/api/ics/${token}/rotationsplan.ics`;
  const httpsIcsUrl = `${baseUrl}/api/ics/${token}/rotationsplan.ics`;

  const calendarSection = (
    <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-brand-bg)] text-[var(--color-brand)]">
          <CalendarIcon />
        </span>
        <h2 className="font-display font-bold">Kalender abonnieren</h2>
      </div>
      <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
        Abonniere deine Termine als Kalender – Training und deine Punktspiele, sobald du aufgestellt bist. Neue oder
        geänderte Termine erscheinen automatisch (je nach Kalender-App alle paar Stunden).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={webcalUrl}
          className="inline-block rounded-full bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Kalender abonnieren
        </a>
        <CopyLinkButton value={httpsIcsUrl} label={"Link kopieren (falls „Abonnieren“ nicht klappt)"} />
      </div>
    </section>
  );

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zur Gesamtübersicht
      </Link>

      <header className="my-4">
        <h1 className="font-display text-2xl font-bold">Hallo {playerLabel(player)}!</h1>
      </header>

      <FirstVisitGuide token={token} trains={trains} />
      <RememberMyPage token={token} />

      <div className="mb-6 space-y-2">
        {captainOf.length > 0 && (
          <Link
            href={`/spieler/${token}/mannschaftsfuehrer`}
            className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--color-brand)] px-[14px] py-3 text-sm font-semibold text-white"
          >
            Mannschaftsführer-Bereich ({captainOf.map((t) => t.name).join(", ")})
            <ChevronRightIcon className="shrink-0" />
          </Link>
        )}
        <Link
          href={`/spieler/${token}/punktspiele`}
          className="flex items-center justify-between gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3 text-sm font-medium"
        >
          Winterspiele der Mannschaften
          <ChevronRightIcon className="shrink-0 text-[var(--color-ink-faint)]" />
        </Link>
      </div>

      {myMatches.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Deine Punktspiele
          </h2>
          <div className="space-y-3">
            {myMatches.map((m) => (
              <MatchCard key={m.id} match={m} showDate>
                <LineupLine match={m} entries={lineupsByMatch.get(m.id) ?? []} viewer={{ token, playerId: player.id }} />
                <Link
                  href={`/spieler/${token}/punktspiele#spiel-${m.id}`}
                  className="mt-3 flex items-center justify-between rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
                >
                  Fahrgemeinschaft
                  <ChevronRightIcon className="shrink-0 text-[var(--color-ink-faint)]" />
                </Link>
              </MatchCard>
            ))}
          </div>
        </section>
      )}

      <AvailabilityPicker token={token} playerId={player.id} days={pollDays} answers={answers} />

      {trains ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-2.5 text-center">
              <p className="font-display text-xl font-bold text-[var(--color-brand)]">{starterSessions.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">Spieltage</p>
            </div>
            <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-2.5 text-center">
              <p className="font-display text-xl font-bold text-[var(--color-brand)]">{mitCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">Mit Trainer</p>
            </div>
            <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-2.5 text-center">
              <p className="font-display text-xl font-bold text-[var(--color-brand)]">{ohneCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">Ohne Trainer</p>
            </div>
          </div>

          {calendarSection}

          {(freeSlots.length > 0 || missedSlot) && (
            <section id="freie-plaetze" className="mb-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Freie Plätze
              </h2>
              {missedSlot && (
                <p
                  role="status"
                  className="mb-3 rounded-2xl bg-[var(--color-offen-bg)] px-4 py-3 text-sm text-[var(--color-offen)]"
                >
                  Der Platz am {formatDate(missedSlot.startsAt)} ist schon vergeben. Danke trotzdem!
                </p>
              )}
              <div className="space-y-3">
                {freeSlots.map((s) => (
                  <FreeSlotCard key={s.id} token={token} session={s} />
                ))}
              </div>
            </section>
          )}

          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Deine nächsten Termine
          </h2>
          <div className="space-y-3">
            {upcoming.map((s) => {
              const role = myRoleInSession(s, player.id);
              const myAssignment = [s.trainer, ...s.starters, ...s.einspringer].find(
                (a) => a?.playerId === player.id,
              )!;
              const myStatus = myAssignment.rsvpStatus;
              const others = lineup(s)
                .filter((a) => a.playerId !== player.id)
                .map((a) => a.displayName);
              // A starter who cancelled can't take it back once someone else has their place.
              const placeTaken = role === "starter" && myStatus === "nein" && openSlots(s) === 0;
              const isPlatz1 = s.courtSlug === "happy-match";
              const chipColorClasses = isPlatz1
                ? "text-[var(--color-platz1)] bg-[var(--color-platz1-bg)]"
                : "text-[var(--color-platz2)] bg-[var(--color-platz2-bg)]";
              const chipLabel = `${s.hallName}${s.withCoach ? " · mit Trainer" : ""}`;

              return (
                <div
                  key={s.id}
                  id={`termin-${s.id}`}
                  className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px] shadow-[0_10px_24px_-16px_rgba(21,32,28,0.28)]"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold whitespace-nowrap">{formatDate(s.startsAt)}</p>
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        {formatTimeRange(s.startsAt, s.endsAt)}
                      </p>
                    </div>
                    {s.address ? (
                      <a
                        href={mapsUrl(s.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${chipColorClasses}`}
                      >
                        <PinIcon />
                        {chipLabel}
                      </a>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${chipColorClasses}`}
                      >
                        <PinIcon />
                        {chipLabel}
                      </span>
                    )}
                  </div>

                  {s.note && (
                    <p className="mb-2 inline-block rounded-lg bg-yellow-100 px-2 py-0.5 text-xs text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">
                      {s.note}
                    </p>
                  )}

                  {role === "trainer" ? (
                    <p className="mb-1 text-sm font-medium">Du bist als Trainer eingeteilt.</p>
                  ) : (
                    <>
                      {role === "einspringer" && <p className="mb-1 text-sm font-medium">Du bist eingesprungen.</p>}
                      <p className="text-sm">
                        Mit dabei: {others.join(", ")}
                        {s.trainer && ` · Trainer: ${s.trainer.displayName}`}
                      </p>
                    </>
                  )}

                  {placeTaken ? (
                    <p className="mt-3 rounded-[14px] bg-[var(--color-offen-bg)] px-4 py-3 text-sm text-[var(--color-offen)]">
                      Du hast abgesagt, dein Platz wurde übernommen.
                    </p>
                  ) : (
                    <RsvpForm token={token} sessionId={s.id} current={myStatus} />
                  )}

                  <a
                    href={`/api/ics/${token}/termin/${s.id}`}
                    className="mt-2 inline-block text-xs text-[var(--color-ink-muted)] underline"
                  >
                    Diesen Termin als .ics herunterladen
                  </a>
                </div>
              );
            })}
            {upcoming.length === 0 && (
              <p className="text-sm text-[var(--color-ink-muted)]">Keine weiteren Termine in dieser Saison.</p>
            )}
          </div>
        </>
      ) : (
        <>
          {(pollDays.length > 0 || myMatches.length > 0) && calendarSection}
          <p className="text-sm text-[var(--color-ink-muted)]">
            Du bist nicht im Trainings-Rotationsplan eingeteilt. Die Termine der Mannschaften findest du unter
            „Winterspiele“.
          </p>
        </>
      )}
    </main>
  );
}
