import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getFullSchedule,
  getPlayerByToken,
  sessionsForPlayer,
  myRoleInSession,
} from "@/lib/queries";
import { formatDate, formatTimeRange, formatDateForFile } from "@/lib/format";
import { getBaseUrl } from "@/lib/base-url";
import { RsvpForm } from "@/components/RsvpForm";
import { CopyLinkButton } from "@/components/CopyLinkButton";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: PageProps<"/spieler/[token]">) {
  const { token } = await params;

  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const schedule = await getFullSchedule();
  const mySessions = sessionsForPlayer(schedule, player.id);
  const baseUrl = await getBaseUrl();

  const today = formatDateForFile(new Date());
  const upcoming = mySessions.filter((s) => formatDateForFile(s.startsAt) >= today);

  // "Spieltage" counts starter slots only, matching the workbook's COUNTIF (which excludes Ersatz).
  const starterSessions = mySessions.filter((s) => myRoleInSession(s, player.id) === "starter");
  const mitCount = starterSessions.filter((s) => s.withCoach).length;
  const ohneCount = starterSessions.filter((s) => !s.withCoach).length;

  const webcalUrl = `${baseUrl.replace(/^https?:/, "webcal:")}/api/ics/${token}/rotationsplan.ics`;
  const httpsIcsUrl = `${baseUrl}/api/ics/${token}/rotationsplan.ics`;

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link href="/" className="text-sm underline text-black/60 dark:text-white/60">
        ← Zur Gesamtübersicht
      </Link>

      <header className="my-4">
        <h1 className="text-xl font-bold">Hallo {player.displayName}!</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Du hast {starterSessions.length} Spieltage: {mitCount} mit Trainer, {ohneCount} ohne Trainer.
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-black/10 dark:border-white/15 p-4">
        <h2 className="font-semibold mb-1">Kalender abonnieren</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mb-3">
          Abonniere deine Termine als Kalender – neue oder geänderte Termine erscheinen automatisch
          (Aktualisierung je nach Kalender-App alle paar Stunden).
        </p>
        <div className="flex flex-col gap-2 items-start">
          <a
            href={webcalUrl}
            className="inline-block bg-black text-white dark:bg-white dark:text-black rounded-md px-4 py-2 text-sm font-semibold"
          >
            Kalender abonnieren
          </a>
          <CopyLinkButton value={httpsIcsUrl} label={"Link kopieren (falls „Abonnieren“ nicht klappt)"} />
        </div>
      </section>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50 mb-2">
        Deine nächsten Termine
      </h2>
      <div className="space-y-4">
        {upcoming.map((s) => {
          const role = myRoleInSession(s, player.id);
          const myStatus = role === "starter"
            ? s.starters.find((a) => a.playerId === player.id)!.rsvpStatus
            : s.ersatz!.rsvpStatus;
          const others = s.starters.filter((a) => a.playerId !== player.id).map((a) => a.displayName);
          const courtColor = s.courtSlug === "happy-match" ? "var(--color-platz1)" : "var(--color-platz2)";

          return (
            <div key={s.id} id={`termin-${s.id}`} className="rounded-lg border border-black/10 dark:border-white/15 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold">{formatDate(s.startsAt)}</p>
                  <p className="text-sm text-black/60 dark:text-white/60">
                    {formatTimeRange(s.startsAt, s.endsAt)}
                  </p>
                </div>
                <span
                  className="text-xs font-medium px-2 py-1 rounded-full text-white"
                  style={{ backgroundColor: courtColor }}
                >
                  {s.hallName} · {s.withCoach ? "mit Trainer" : "ohne Trainer"}
                </span>
              </div>

              {s.note && (
                <p className="mb-2 inline-block text-xs bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200 rounded px-2 py-0.5">
                  {s.note}
                </p>
              )}

              {role === "ersatz" ? (
                <p className="text-sm font-medium mb-1">Du bist Ersatz an diesem Termin.</p>
              ) : (
                <p className="text-sm mb-1">Mit dabei: {others.join(", ")}</p>
              )}
              {s.ersatz && role !== "ersatz" && (
                <p className="text-sm text-black/60 dark:text-white/60 mb-2">Ersatz: {s.ersatz.displayName}</p>
              )}

              <RsvpForm token={token} sessionId={s.id} current={myStatus} />

              <a
                href={`/api/ics/${token}/termin/${s.id}`}
                className="inline-block mt-2 text-xs underline text-black/60 dark:text-white/60"
              >
                Diesen Termin als .ics herunterladen
              </a>
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/60">Keine weiteren Termine in dieser Saison.</p>
        )}
      </div>
    </main>
  );
}
