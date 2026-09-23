const TIMEZONE = "Europe/Berlin";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateFileFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(d: Date | string): string {
  return dateFormatter.format(new Date(d));
}

export function formatTime(d: Date | string): string {
  return timeFormatter.format(new Date(d));
}

export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} – ${formatTime(end)} Uhr`;
}

/** YYYY-MM-DD in Europe/Berlin, safe for filenames and comparisons. */
export function formatDateForFile(d: Date | string): string {
  return dateFileFormatter.format(new Date(d));
}

/** The name to show for a player: their chosen nickname if set, otherwise the spreadsheet name. */
export function playerLabel(p: { displayName: string; nickname?: string | null }): string {
  return p.nickname?.trim() || p.displayName;
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * Answer-button wording for the reminder email and its confirmation page. Ersatz answers mean "standing by",
 * unless a starter has already cancelled (`ersatzNeeded`) — then the Ersatz is answering whether they'll play.
 */
export function rsvpLabels(role: "starter" | "ersatz" | "trainer", ersatzNeeded = false): { ja: string; nein: string } {
  if (role === "ersatz") {
    return ersatzNeeded
      ? { ja: "Ja, ich springe ein", nein: "Nein, ich kann nicht" }
      : { ja: "Ja, ich halte mich bereit", nein: "Nein, heute nicht" };
  }
  return { ja: "Ja, ich bin dabei", nein: "Nein, ich kann nicht" };
}

/** Apple "Hide My Email" addresses only forward mail from senders registered with Apple, so our emails never arrive. */
export function isAppleRelayEmail(email: string): boolean {
  return /@privaterelay\.appleid\.com$/i.test(email.trim());
}
