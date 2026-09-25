import { runReminders } from "@/lib/reminders";
import { runMatchReminders } from "@/lib/match-reminders";
import { getBaseUrl } from "@/lib/base-url";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const baseUrl = await getBaseUrl();

  try {
    const result = await runReminders({ dryRun, baseUrl });
    const punktspiele = await runMatchReminders({ dryRun, baseUrl });
    return Response.json({ ...result, punktspiele });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, { status: 500 });
  }
}
