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

  // Run independently: a failing training reminder must not stop the match-day emails, and vice versa.
  const [training, punktspiele] = await Promise.allSettled([
    runReminders({ dryRun, baseUrl }),
    runMatchReminders({ dryRun, baseUrl }),
  ]);
  const message = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : "Unbekannter Fehler");
  const body = {
    ...(training.status === "fulfilled" ? training.value : { error: message(training) }),
    punktspiele: punktspiele.status === "fulfilled" ? punktspiele.value : { error: message(punktspiele) },
  };
  const failed = training.status === "rejected" || punktspiele.status === "rejected";
  return Response.json(body, { status: failed ? 500 : 200 });
}
