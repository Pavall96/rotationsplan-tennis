import { refreshAllScouting } from "@/lib/scouting-store";

// The run waits for Claude (one call per changed match), on top of the WTB pages.
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const teams = await refreshAllScouting({ dryRun });
  // A team whose WTB data could not be fetched (or looks empty) makes the run fail visibly; the other teams are
  // already updated. A failed Claude assessment does not: it stays ok with assessment "fehlgeschlagen" (and the
  // reason in `error`) and is retried by the next run.
  return Response.json({ teams }, { status: teams.some((t) => !t.ok) ? 500 : 200 });
}
