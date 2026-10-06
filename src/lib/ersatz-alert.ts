import { getFullSchedule, getPlayerById, type SessionView } from "@/lib/queries";
import { sendErsatzAlert, type ErsatzAlertInput } from "@/lib/email";
import { playerLabel } from "@/lib/format";
import { ersatzNoLongerNeeded } from "@/lib/vacancy";

type Answer = "ja" | "nein";

/**
 * Which email (if any) the Ersatz should get after a starter's answer changed, given the session as it is
 * *after* the change. Only the first cancellation alerts the Ersatz — they can fill one slot, and a second
 * email wouldn't change what they need to do — and the all-clear goes out only once nobody is missing.
 */
export function ersatzAlertKind(
  session: SessionView,
  previous: Answer | null,
  status: Answer,
  now: Date,
): ErsatzAlertInput["kind"] | null {
  if (!session.ersatz || session.ersatz.rsvpStatus === "nein") return null;
  if (session.endsAt <= now) return null;

  const cancelled = session.starters.filter((a) => a.rsvpStatus === "nein").length;
  if (status === "nein" && previous !== "nein" && cancelled === 1) return "gebraucht";
  if (status === "ja" && previous === "nein" && cancelled === 0) return "entwarnung";
  return null;
}

async function emailErsatz(
  session: SessionView,
  kind: ErsatzAlertInput["kind"],
  baseUrl: string,
  jumpedIn?: string,
): Promise<void> {
  const ersatz = await getPlayerById(session.ersatz!.playerId);
  if (!ersatz?.email) return;

  const from = process.env.MAIL_FROM;
  if (!from) {
    console.warn("MAIL_FROM ist nicht gesetzt – Ersatz-Benachrichtigung übersprungen.");
    return;
  }

  const result = await sendErsatzAlert(
    { to: ersatz.email, playerName: playerLabel(ersatz), session, token: ersatz.token, baseUrl, kind, jumpedIn },
    { from, replyTo: process.env.REPLY_TO },
  );
  if (result.error) console.error(`Ersatz-Benachrichtigung (${kind}) fehlgeschlagen:`, result.error);
}

/** Emails the session's Ersatz after a starter cancelled or took a cancellation back. Never throws. */
export async function notifyErsatz(opts: {
  sessionId: number;
  previous: Answer | null;
  status: Answer;
  baseUrl: string;
}): Promise<void> {
  try {
    const schedule = await getFullSchedule();
    const session = schedule.find((s) => s.id === opts.sessionId);
    if (!session) return;

    const kind = ersatzAlertKind(session, opts.previous, opts.status, new Date());
    if (!kind) return;

    await emailErsatz(session, kind, opts.baseUrl);
  } catch (err) {
    console.error("Ersatz-Benachrichtigung fehlgeschlagen:", err);
  }
}

/** Tells the Ersatz they're off the hook when someone else jumped into the last free place. Never throws. */
export async function notifyErsatzTakenOver(opts: {
  sessionId: number;
  einspringerId: number;
  baseUrl: string;
}): Promise<void> {
  try {
    const schedule = await getFullSchedule();
    const session = schedule.find((s) => s.id === opts.sessionId);
    if (!session || !ersatzNoLongerNeeded(session, new Date())) return;

    const jumpedIn = session.einspringer.find((a) => a.playerId === opts.einspringerId)?.displayName;
    await emailErsatz(session, "uebernommen", opts.baseUrl, jumpedIn);
  } catch (err) {
    console.error("Ersatz-Benachrichtigung fehlgeschlagen:", err);
  }
}
