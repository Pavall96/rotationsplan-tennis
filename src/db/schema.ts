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
  displayName: text("display_name").notNull().unique(),
  lk: numeric("lk", { precision: 4, scale: 1 }),
  wantsCoach: boolean("wants_coach").notNull(),
  email: text("email").unique(),
  token: text("token").notNull().unique(),
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
    check("session_assignments_role_check", sql`${table.role} in ('starter', 'ersatz')`),
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
