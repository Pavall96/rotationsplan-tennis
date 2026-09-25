import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { MatchList } from "@/components/MatchList";
import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { getAllMatches } from "@/lib/matches";
import { getPlayerRoster } from "@/lib/roster";
import { getAvailability, pollDaysForPlayer } from "@/lib/availability";
import { RememberMyPage } from "@/components/MyPageLink";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MyMatchesPage({ params, searchParams }: PageProps<"/spieler/[token]/punktspiele">) {
  const { token } = await params;
  const { team } = await searchParams;
  const player = await getPlayerByToken(token);
  if (!player) notFound();
  const [allMatches, roster, answers] = await Promise.all([
    getAllMatches(),
    getPlayerRoster(player.id),
    getAvailability(),
  ]);

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link href={`/spieler/${token}`} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zu meiner Seite
      </Link>
      <RememberMyPage token={token} />

      <header className="my-4">
        <h1 className="font-display text-2xl font-bold">Winterspiele 2026/27</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Route zur Halle mit einem Tipp. Unter „Fahrgemeinschaft“ bietest du Plätze in deinem Auto an oder fährst bei
          jemandem mit. Treffpunkt ist meist das Vereinsheim – wenn ihr euch woanders trefft, sprecht das direkt ab.
        </p>
      </header>

      <AvailabilityPicker
        token={token}
        playerId={player.id}
        days={player.playsMatches ? pollDaysForPlayer(roster, allMatches) : []}
        answers={answers}
      />

      <MatchList
        basePath={`/spieler/${token}/punktspiele`}
        teamSlug={typeof team === "string" ? team : undefined}
        viewer={{ token, playerId: player.id }}
      />
    </main>
  );
}
