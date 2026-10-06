import { runTrainerUpdates } from "@/lib/trainer-update";
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
    return Response.json(await runTrainerUpdates({ dryRun, baseUrl }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, { status: 500 });
  }
}
