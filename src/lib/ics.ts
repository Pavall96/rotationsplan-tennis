export type IcsEvent = {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  sequence: number;
  status: "CONFIRMED" | "CANCELLED";
};

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 5545: lines must not exceed 75 octets; continuation lines start with a space.
  const bytes = Buffer.byteLength(line, "utf-8");
  if (bytes <= 75) return line;
  const out: string[] = [];
  let current = line;
  let first = true;
  while (Buffer.byteLength(current, "utf-8") > 75) {
    let cut = 75;
    // Avoid splitting a multi-byte UTF-8 char.
    while (Buffer.byteLength(current.slice(0, cut), "utf-8") > 75) cut--;
    out.push((first ? "" : " ") + current.slice(0, cut));
    current = current.slice(cut);
    first = false;
  }
  out.push(" " + current);
  return out.join("\r\n");
}

function toUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildEvent(event: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(event.start)}`,
    `DTEND:${toUtcStamp(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location)}`,
    `SEQUENCE:${event.sequence}`,
    `STATUS:${event.status}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Tennis in 3 Stunden",
    "TRIGGER:-PT3H",
    "END:VALARM",
    "END:VEVENT",
  ];
  return lines.map(foldLine);
}

export function buildIcsCalendar(events: IcsEvent[], calendarName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rotationsplan Tennis//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...events.flatMap(buildEvent),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function buildSingleIcsEvent(event: IcsEvent): string {
  return buildIcsCalendar([event], event.summary);
}

import type { SessionView } from "@/lib/queries";

export function sessionToIcsEvent(
  session: SessionView,
  player: { id: number; token: string },
  baseUrl: string,
): IcsEvent {
  const withCoach = session.withCoach ? "mit Trainer" : "ohne Trainer";
  const summary = `Tennis · ${session.hallName} (${withCoach})`;
  const descriptionParts = [
    `Mit dabei: ${session.starters.map((a) => a.displayName).join(", ")}`,
    session.ersatz ? `Ersatz: ${session.ersatz.displayName}` : null,
    session.note ? `Hinweis: ${session.note}` : null,
    `Rückmeldung: ${baseUrl}/spieler/${player.token}`,
  ].filter((x): x is string => Boolean(x));

  const mySelf = [...session.starters, ...(session.ersatz ? [session.ersatz] : [])].find(
    (a) => a.playerId === player.id,
  );
  const cancelled = mySelf?.rsvpStatus === "nein";

  return {
    uid: `session-${session.id}-player-${player.id}@rotationsplan-tennis`,
    summary,
    // A real newline here (not "\\n") so escapeText's \n -> "\\n" pass produces the correct single-backslash ICS escape.
    description: descriptionParts.join("\n"),
    location: session.address ? `${session.hallName}, ${session.address}` : session.hallName,
    start: session.startsAt,
    end: session.endsAt,
    sequence: 0,
    status: cancelled ? "CANCELLED" : "CONFIRMED",
  };
}
