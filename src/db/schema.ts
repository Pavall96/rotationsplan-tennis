import {
  pgTable,
  serial,
  text,
  boolean,
  numeric,
  timestamp,
  date,
  time,
  smallint,
  integer,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  // Stable key back to the source spreadsheet — never edited by users, so a re-import can still match rows.
  displayName: text("display_name").notNull().unique(),
  // User-chosen display name (e.g. a preferred nickname); shown everywhere instead of displayName when set.
  nickname: text("nickname"),
  lk: numeric("lk", { precision: 4, scale: 1 }),
  wantsCoach: boolean("wants_coach").notNull(),
  email: text("email").unique(),
  token: text("token").notNull().unique(),
  // WTB "ID-Nummer" from the namentliche Mannschaftsmeldung — links a player to the Meldeliste across re-imports.
  wtbId: text("wtb_id").unique(),
  // False for players who stay on the Meldeliste (their position matters) but won't play — not polled or shown.
  playsMatches: boolean("plays_matches").notNull().default(true),
  // Last "Wann kannst du?" reminder email — several captains pressing the button the same day send it only once.
  availabilityRemindedAt: timestamp("availability_reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courts = pgTable("courts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  hallName: text("hall_name").notNull(),
  withCoach: boolean("with_coach").notNull(),
  startLocal: time("start_local").notNull(),
  endLocal: time("end_local").notNull(),
  address: text("address"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    courtId: integer("court_id")
      .notNull()
      .references(() => courts.id),
    sessionNo: integer("session_no").notNull(),
    sessionDate: date("session_date").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    lkRange: text("lk_range"),
    note: text("note"),
  },
  (table) => [
    unique("sessions_court_date_unique").on(table.courtId, table.sessionDate),
    unique("sessions_court_no_unique").on(table.courtId, table.sessionNo),
  ],
);

export const sessionAssignments = pgTable(
  "session_assignments",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    role: text("role").notNull(),
    slot: smallint("slot"),
  },
  (table) => [
    unique("session_assignments_session_player_unique").on(table.sessionId, table.playerId),
    // 'einspringer': a rotation player who took a place a starter cancelled (always paired with an rsvps 'ja').
    check("session_assignments_role_check", sql`${table.role} in ('starter', 'ersatz', 'trainer', 'einspringer')`),
  ],
);

export const rsvps = pgTable(
  "rsvps",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    status: text("status").notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("web"),
  },
  (table) => [
    unique("rsvps_session_player_unique").on(table.sessionId, table.playerId),
    check("rsvps_status_check", sql`${table.status} in ('ja', 'nein')`),
  ],
);

export const reminderLog = pgTable(
  "reminder_log",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
  },
  (table) => [unique("reminder_log_session_player_unique").on(table.sessionId, table.playerId)],
);

// ---- Mannschaften / Winterspiele ----

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    // 'herren' or 'h30' — H30 players may also play for Herren teams, not the other way round.
    ageClass: text("age_class").notNull(),
    // 1 = first team, 2 = second team within the age class.
    rank: smallint("rank").notNull(),
    // WTB/nuLiga team id from the team page URL (…/mannschaft/v/20019/m/<id>.html).
    wtbTeamId: text("wtb_team_id").notNull().unique(),
    league: text("league"),
    captainPlayerId: integer("captain_player_id").references(() => players.id),
  },
  (table) => [check("teams_age_class_check", sql`${table.ageClass} in ('herren', 'h30')`)],
);

export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  // Hall name exactly as WTB shows it under "Spielort" — the import matches on it.
  name: text("name").notNull().unique(),
  address: text("address"),
  notes: text("notes"),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  // nuLiga meeting id (from the "Spielbericht" link) — stable key so re-imports update instead of duplicating.
  wtbMeetingId: text("wtb_meeting_id").notNull().unique(),
  matchDate: date("match_date").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  isHome: boolean("is_home").notNull(),
  opponent: text("opponent").notNull(),
  venueId: integer("venue_id").references(() => venues.id),
  playersNeeded: smallint("players_needed").notNull().default(4),
  // Set when the Mannschaftsführer publishes the lineup; players only see it (and get emailed) from then on.
  lineupPublishedAt: timestamp("lineup_published_at", { withTimezone: true }),
  // Bumped by the WTB import whenever date, time or hall change — used as the calendar event's SEQUENCE.
  scheduleVersion: smallint("schedule_version").notNull().default(0),
});

// Namentliche Mannschaftsmeldung: one ranked list per age class. Positions 1–4 are fixed to the first team.
export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: serial("id").primaryKey(),
    ageClass: text("age_class").notNull(),
    position: smallint("position").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    lk: numeric("lk", { precision: 4, scale: 1 }),
    nationality: text("nationality"),
    // False only for non-Germans without the "D" status (WSPO § 10) — at most one of them per match (§ 33a.1).
    countsAsGerman: boolean("counts_as_german").notNull().default(true),
  },
  (table) => [
    unique("roster_entries_class_position_unique").on(table.ageClass, table.position),
    unique("roster_entries_class_player_unique").on(table.ageClass, table.playerId),
    check("roster_entries_age_class_check", sql`${table.ageClass} in ('herren', 'h30')`),
  ],
);

// Fahrgemeinschaften: a driver offers seats for one match; passengers take them.
export const rides = pgTable(
  "rides",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    driverPlayerId: integer("driver_player_id")
      .notNull()
      .references(() => players.id),
    seats: smallint("seats").notNull(),
    // Seats taken, kept in step with ride_passengers. Incremented with "where taken < seats" and guarded by a CHECK,
    // so two players grabbing the last seat at once can't both get it.
    taken: smallint("taken").notNull().default(0),
    meetingPoint: text("meeting_point").notNull(),
    departureTime: time("departure_time").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rides_match_driver_unique").on(table.matchId, table.driverPlayerId),
    check("rides_seats_check", sql`${table.seats} between 1 and 8`),
    check("rides_taken_check", sql`${table.taken} >= 0 and ${table.taken} <= ${table.seats}`),
  ],
);

export const ridePassengers = pgTable(
  "ride_passengers",
  {
    id: serial("id").primaryKey(),
    rideId: integer("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("ride_passengers_ride_player_unique").on(table.rideId, table.playerId)],
);

// "Ich suche eine Mitfahrt" — visible to drivers of that match until the player takes a seat.
export const rideRequests = pgTable(
  "ride_requests",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("ride_requests_match_player_unique").on(table.matchId, table.playerId)],
);

// Verfügbarkeit für Punktspiele — per Spieltag, not per match: players say whether they can play that Saturday,
// the Mannschaftsführer decide which team they play for.
export const availability = pgTable(
  "availability",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    matchDate: date("match_date").notNull(),
    status: text("status").notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("availability_player_date_unique").on(table.playerId, table.matchDate),
    check("availability_status_check", sql`${table.status} in ('ja', 'vielleicht', 'nein')`),
  ],
);

// Aufstellung: who plays a match. 'stamm' play the singles (in Meldeliste order) and doubles; 'ersatz' stand by.
export const lineups = pgTable(
  "lineups",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    role: text("role").notNull(),
    // When this entry became visible to the players. Entries added after a publish stay private until the next one.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // When this player was emailed about the published lineup.
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    // The player's answer to the published lineup: 'ja' (dabei / bereit) or 'nein' (Absage); null = no answer yet.
    response: text("response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    // When the match-day reminder went out, so the cron never sends it twice.
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("lineups_match_player_unique").on(table.matchId, table.playerId),
    check("lineups_role_check", sql`${table.role} in ('stamm', 'ersatz')`),
    check("lineups_response_check", sql`${table.response} in ('ja', 'nein')`),
  ],
);
