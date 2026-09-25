import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { getPlayerByToken } from "@/lib/queries";
import { getTeams, getAllMatches, groupByDay, type AgeClass } from "@/lib/matches";
import { getRoster, rosterByPlayer, activeRows } from "@/lib/roster";
import { setPlaysMatches } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { getAvailability } from "@/lib/availability";
import { AvailabilityOverview } from "@/components/AvailabilityOverview";
import { AvailabilityReminder } from "@/components/AvailabilityReminder";
import { AGE_CLASS_LABEL, FIXED_POSITIONS } from "@/lib/eligibility";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateForFile, playerLabel } from "@/lib/format";
import { inviteText, whatsappUrl } from "@/lib/invite";
import { AddPlayerForm } from "@/components/AddPlayerForm";
import { TeamChip } from "@/components/MatchCard";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

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
  const [allMatches, allPlayers, roster, answers, baseUrl] = await Promise.all([
    getAllMatches(),
    db.select().from(players).orderBy(players.displayName),
    getRoster(),
    getAvailability(),
    getBaseUrl(),
  ]);
  const listClass: AgeClass = liste === "herren" || liste === "h30" ? liste : myTeams[0].ageClass;
  const list = roster.filter((r) => r.ageClass === listClass);
  const onHerrenList = new Set(roster.filter((r) => r.ageClass === "herren").map((r) => r.playerId));
  const onAnyList = new Set(roster.map((r) => r.playerId));
  const notListed = allPlayers.filter((p) => !onAnyList.has(p.id));
  const registerUrl = `${baseUrl}/registrieren`;
  const today = formatDateForFile(new Date());
  const days = groupByDay(allMatches.filter((m) => m.matchDate >= today));
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
          roster={activeRows(roster)}
          rosters={rosterByPlayer(activeRows(roster))}
          answers={answers}
        />
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
          Sommer 2026 · {list.filter((r) => r.registered).length} von {list.length} in der App eingetragen. Plätze
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
