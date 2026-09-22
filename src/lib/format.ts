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
