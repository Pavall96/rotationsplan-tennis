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
    // Only a hint (Apple and Google keep their own schedule), but apps that honour it pick up jump-ins the same hour.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap(buildEvent),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function buildSingleIcsEvent(event: IcsEvent): string {
  return buildIcsCalendar([event], event.summary);
}

import type { SessionAssignmentView, SessionView } from "@/lib/queries";
import { attending, lineup, openSlots, playingErsatz } from "@/lib/vacancy";

export function sessionToIcsEvent(
  session: SessionView,
  player: { id: number; token: string },
  baseUrl: string,
): IcsEvent {
  const ersatzPlays = playingErsatz(session);
  const withCoach = session.withCoach ? "mit Trainer" : "ohne Trainer";
  const summary = `Tennis · ${session.hallName} (${withCoach})`;
  // Who cancelled must not read as "Mit dabei": the calendar entry is often all a player looks at before driving to the hall.
  const names = (list: SessionAssignmentView[]) => list.map((a) => a.displayName).join(", ");
  // The Ersatz on standby stays unnamed, as everywhere in the app; only their answer is shown.
  const ersatzAnswer = { ja: "steht bereit", offen: "Antwort offen", nein: "abgesagt" } as const;
  const cancelled = lineup(session).filter((a) => a.rsvpStatus === "nein");
  const open = openSlots(session);
  const descriptionParts = [
    `Mit dabei: ${names(attending(session)) || "niemand"}`,
    cancelled.length > 0 ? `Abgesagt: ${names(cancelled)}` : null,
    session.trainer
      ? `Trainer: ${session.trainer.displayName}${session.trainer.rsvpStatus === "nein" ? " (abgesagt)" : ""}`
      : null,
    session.ersatz && !ersatzPlays ? `Ersatz: ${ersatzAnswer[session.ersatz.rsvpStatus]}` : null,
    open > 0 ? `Noch frei: ${open === 1 ? "1 Platz" : `${open} Plätze`}` : null,
    session.note ? `Hinweis: ${session.note}` : null,
    `Rückmeldung: ${baseUrl}/spieler/${player.token}`,
  ].filter((x): x is string => Boolean(x));

  const mySelf = [
    ...session.starters,
    ...session.einspringer,
    ...(session.ersatz ? [session.ersatz] : []),
    ...(session.trainer ? [session.trainer] : []),
  ].find((a) => a.playerId === player.id);
  const iCancelled = mySelf?.rsvpStatus === "nein";

  return {
    uid: `session-${session.id}-player-${player.id}@rotationsplan-tennis`,
    summary,
    // A real newline here (not "\\n") so escapeText's \n -> "\\n" pass produces the correct single-backslash ICS escape.
    description: descriptionParts.join("\n"),
    location: session.address ? `${session.hallName}, ${session.address}` : session.hallName,
    start: session.startsAt,
    end: session.endsAt,
    sequence: 0,
    status: iCancelled ? "CANCELLED" : "CONFIRMED",
  };
}

import type { MatchView } from "@/lib/matches";
import type { LineupEntry } from "@/lib/lineups";

/** A 4er-Punktspiel (4 Einzel, 2 Doppel) takes about four hours. */
const MATCH_DURATION_MS = 4 * 60 * 60 * 1000;

export function matchToIcsEvent(
  match: MatchView,
  lineup: LineupEntry[],
  player: { id: number; token: string },
  baseUrl: string,
): IcsEvent {
  const me = lineup.find((e) => e.playerId === player.id);
  const stamm = lineup.filter((e) => e.role === "stamm" && e.response !== "nein").map((e) => e.name);
  const doppel = lineup.filter((e) => e.role === "doppel" && e.response !== "nein").map((e) => e.name);
  const venue = match.venue;
  return {
    uid: `match-${match.id}-player-${player.id}@rotationsplan-tennis`,
    summary: `Punktspiel ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}`,
    description: [
      `Aufstellung: ${stamm.join(", ")}`,
      ...(doppel.length ? [`Nur Doppel: ${doppel.join(", ")}`] : []),
      `Route, Zu-/Absage und Fahrgemeinschaft: ${baseUrl}/spieler/${player.token}/punktspiele#spiel-${match.id}`,
    ].join("\n"),
    location: venue ? (venue.address ? `${venue.name}, ${venue.address}` : venue.name) : "",
    start: match.startsAt,
    end: new Date(match.startsAt.getTime() + MATCH_DURATION_MS),
    // Bumped when the WTB moves the match, so calendar apps replace the old time instead of keeping it.
    sequence: match.scheduleVersion,
    status: me?.response === "nein" ? "CANCELLED" : "CONFIRMED",
  };
}
