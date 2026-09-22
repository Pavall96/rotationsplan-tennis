import { notFound } from "next/navigation";
import { getFullSchedule, getPlayerByToken, sessionsForPlayer, myRoleInSession } from "@/lib/queries";
import { buildIcsCalendar, sessionToIcsEvent } from "@/lib/ics";
import { getBaseUrl } from "@/lib/base-url";

export async function GET(_request: Request, { params }: RouteContext<"/api/ics/[token]/rotationsplan.ics">) {
  const { token } = await params;
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const schedule = await getFullSchedule();
  // Only real commitments (playing or coaching), not standby (Ersatz) sessions.
  const mine = sessionsForPlayer(schedule, player.id).filter((s) => {
    const role = myRoleInSession(s, player.id);
    return role === "starter" || role === "trainer";
  });
  const baseUrl = await getBaseUrl();

  const events = mine.map((s) => sessionToIcsEvent(s, player, baseUrl));
  const ics = buildIcsCalendar(events, "Tennis Wintertraining 2026/27");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
