import { refreshAllScouting } from "@/lib/scouting-store";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const teams = await refreshAllScouting({ dryRun });
  // A team that failed (WTB down, Claude error) makes the run fail visibly; the other teams are already updated.
  return Response.json({ teams }, { status: teams.some((t) => !t.ok) ? 500 : 200 });
}
