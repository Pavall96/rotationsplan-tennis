import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { getFullSchedule, getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { mergeAgenda } from "@/lib/agenda";
import { jumpInOptions, type JumpInViewer } from "@/lib/einspringen";
import { MY_TOKEN_KEY } from "@/lib/my-token";
import { SessionCard } from "@/components/SessionCard";
import { CompactMatchCard } from "@/components/MatchCard";
import { formatDateForFile } from "@/lib/format";
import { MyPageLink } from "@/components/MyPageLink";
import { SeasonCalendar } from "@/components/SeasonCalendar";
import { ChevronRightIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { ansicht, monat, tag } = await searchParams;
  // "alle" was the old "Ganze Saison" tab; old links land on the calendar, which now covers the whole season.
  const showCalendar = ansicht === "kalender" || ansicht === "alle";

  const [schedule, allMatches] = await Promise.all([getFullSchedule(), getAllMatches()]);

  // Known device: let the player take a free place right on the card.
  const myToken = (await cookies()).get(MY_TOKEN_KEY)?.value;
  const me = myToken ? await getPlayerByToken(myToken) : null;
  // Mannschaftsführer get a direct way into their area — only on a device that knows them.
  const captainOf = me ? (await getTeams()).filter((t) => t.captainPlayerId === me.id) : [];
  const viewer: JumpInViewer | null = me
    ? { token: me.token, sessionIds: new Set(jumpInOptions(schedule, me.id, new Date()).map((s) => s.id)) }
    : null;
  const today = formatDateForFile(new Date());
  const upcoming = schedule.filter((s) => formatDateForFile(s.startsAt) >= today);

  const nextDate = upcoming[0] ? formatDateForFile(upcoming[0].startsAt) : null;
  const nextSessions = nextDate ? upcoming.filter((s) => formatDateForFile(s.startsAt) === nextDate) : [];

  // The next session(s) already get their own hero section above — don't repeat them in the list below.
  const nextIds = new Set(nextSessions.map((s) => s.id));
  const restUpcoming = upcoming.filter((s) => !nextIds.has(s.id));
  // Punktspiele sit between the training sessions; on a known device the card opens the personal match page.
  const agenda = mergeAgenda(
    restUpcoming,
    allMatches.filter((m) => m.matchDate >= today),
  );
  const matchHref = (matchId: number) =>
    me ? `/spieler/${me.token}/punktspiele#spiel-${matchId}` : `/punktspiele#spiel-${matchId}`;


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

      <Link
        href="/punktspiele"
        className="-mt-4 mb-6 flex items-center justify-between gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3 text-sm font-medium"
      >
        Winterspiele der Mannschaften
        <ChevronRightIcon className="shrink-0 text-[var(--color-ink-faint)]" />
      </Link>

      {me && captainOf.length > 0 && (
        <Link
          href={`/spieler/${me.token}/mannschaftsfuehrer`}
          className="-mt-4 mb-6 flex items-center justify-between gap-2 rounded-[14px] bg-[var(--color-brand)] px-[14px] py-3 text-sm font-semibold text-white"
        >
          <span>
            Mannschaftsführer-Bereich
            <span className="block text-xs font-normal opacity-80">
              {captainOf.map((t) => t.name).join(", ")} · aufstellen und verwalten
            </span>
          </span>
          <ChevronRightIcon className="shrink-0" />
        </Link>
      )}

      {!showCalendar && nextSessions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Nächster Termin
          </h2>
          <div className="space-y-3">
            {nextSessions.map((s) => (
              <SessionCard key={s.id} session={s} viewer={viewer} />
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
          viewer={viewer}
        />
      ) : (
        <section className="space-y-3">
          {agenda.map((item) =>
            item.kind === "session" ? (
              <SessionCard key={`s${item.session.id}`} session={item.session} variant="compact" />
            ) : (
              <CompactMatchCard key={`m${item.match.id}`} match={item.match} href={matchHref(item.match.id)} />
            ),
          )}
          {agenda.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">Keine weiteren Termine in dieser Saison.</p>
          )}
        </section>
      )}
    </main>
  );
}
