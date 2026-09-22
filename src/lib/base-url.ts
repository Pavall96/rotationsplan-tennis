import { headers } from "next/headers";

/** Prefers NEXT_PUBLIC_BASE_URL (required in contexts without a request, e.g. the cron job); falls back to request headers for local/preview use. */
export async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
