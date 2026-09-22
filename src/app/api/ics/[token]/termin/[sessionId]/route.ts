import { notFound } from "next/navigation";
import { getFullSchedule, getPlayerByToken, sessionsForPlayer } from "@/lib/queries";
import { buildSingleIcsEvent, sessionToIcsEvent } from "@/lib/ics";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateForFile } from "@/lib/format";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/ics/[token]/termin/[sessionId]">,
) {
  const { token, sessionId } = await params;
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const schedule = await getFullSchedule();
  const mine = sessionsForPlayer(schedule, player.id);
  const session = mine.find((s) => s.id === Number(sessionId));
  if (!session) notFound();

  const baseUrl = await getBaseUrl();
  const ics = buildSingleIcsEvent(sessionToIcsEvent(session, player, baseUrl));
  const filename = `tennis-${formatDateForFile(session.startsAt)}.ics`;

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
