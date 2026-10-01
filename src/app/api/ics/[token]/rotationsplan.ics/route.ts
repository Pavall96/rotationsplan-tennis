import { notFound } from "next/navigation";
import { getFullSchedule, getPlayerByToken, sessionsForPlayer, myRoleInSession } from "@/lib/queries";
import { buildIcsCalendar, sessionToIcsEvent, matchToIcsEvent } from "@/lib/ics";
import { getAllMatches } from "@/lib/matches";
import { getLineups } from "@/lib/lineups";
import { playingErsatz } from "@/lib/vacancy";
import { getBaseUrl } from "@/lib/base-url";

export async function GET(_request: Request, { params }: RouteContext<"/api/ics/[token]/rotationsplan.ics">) {
  const { token } = await params;
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const schedule = await getFullSchedule();
  // Only real commitments (playing, coaching or jumped in), not standby (Ersatz) sessions — unless the Ersatz is needed and said yes.
  const mine = sessionsForPlayer(schedule, player.id).filter((s) => {
    const role = myRoleInSession(s, player.id);
    return (
      role === "starter" ||
      role === "trainer" ||
      role === "einspringer" ||
      (role === "ersatz" && playingErsatz(s)?.playerId === player.id)
    );
  });
  const baseUrl = await getBaseUrl();

  // Punktspiele once the lineup is published, for Stammspieler (the Ersatz isn't a commitment, same as training).
  const [allMatches, lineupsByMatch] = await Promise.all([getAllMatches(), getLineups({ publishedOnly: true })]);
  const myMatches = allMatches.filter(
    (m) =>
      m.lineupPublishedAt &&
      (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === player.id && e.role === "stamm"),
  );

  const events = [
    ...mine.map((s) => sessionToIcsEvent(s, player, baseUrl)),
    ...myMatches.map((m) => matchToIcsEvent(m, lineupsByMatch.get(m.id) ?? [], player, baseUrl)),
  ];
  const ics = buildIcsCalendar(events, "Tennis TC Sonnenbrunnen 2026/27");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
