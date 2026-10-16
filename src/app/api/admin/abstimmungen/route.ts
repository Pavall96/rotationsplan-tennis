import { notFound } from "next/navigation";
import { getAllMatches, groupByDay } from "@/lib/matches";
import { getRoster, rosterByPlayer, activeRows } from "@/lib/roster";
import { getAvailability } from "@/lib/availability";
import { availabilityMatrix, availabilityWorkbook } from "@/lib/availability-export";
import { formatDateForFile } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Every Spieltag of the season (past ones too) with everyone's answer, as an Excel file. Guarded like /admin. */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!process.env.ADMIN_TOKEN || key !== process.env.ADMIN_TOKEN) notFound();

  const [allMatches, roster, answers] = await Promise.all([getAllMatches(), getRoster(), getAvailability()]);
  const active = activeRows(roster);
  const matrix = availabilityMatrix(groupByDay(allMatches), active, rosterByPlayer(active), answers);
  const file = await availabilityWorkbook(matrix);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Abstimmungen_Winterspiele_${formatDateForFile(new Date())}.xlsx"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
