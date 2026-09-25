-- Manual schema changes applied directly against the live production database.
--
-- These were run by hand instead of `npm run db:push` because drizzle-kit
-- proposed truncating `sessions` (58 real rows) to add a constraint/column —
-- see the warning in README.md. `src/db/schema.ts` reflects both changes, so
-- a fresh database via `db:push` builds these correctly from scratch; this
-- file exists only as the exact record of what was run against the existing
-- database, in case `db:push` needs to be diffed against production again.

-- 2026-09-22: allow the 'trainer' session_assignments role.
ALTER TABLE session_assignments DROP CONSTRAINT session_assignments_role_check;
ALTER TABLE session_assignments ADD CONSTRAINT session_assignments_role_check
  CHECK (role in ('starter', 'ersatz', 'trainer'));

-- 2026-09-22: add the player-chosen display-name override.
ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname text;

-- 2026-09-25: Mannschaften & Winterspiele (Phase 1). Purely additive — new tables only.
CREATE TABLE IF NOT EXISTS teams (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  age_class text NOT NULL,
  rank smallint NOT NULL,
  wtb_team_id text NOT NULL UNIQUE,
  league text,
  captain_player_id integer REFERENCES players(id),
  CONSTRAINT teams_age_class_check CHECK (age_class in ('herren', 'h30'))
);

CREATE TABLE IF NOT EXISTS venues (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  address text,
  notes text
);

CREATE TABLE IF NOT EXISTS matches (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id),
  wtb_meeting_id text NOT NULL UNIQUE,
  match_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  is_home boolean NOT NULL,
  opponent text NOT NULL,
  venue_id integer REFERENCES venues(id),
  players_needed smallint NOT NULL DEFAULT 4
);

-- 2026-09-25: Meldeliste + Fahrgemeinschaften. Additive: one nullable column on players, new tables.
ALTER TABLE players ADD COLUMN IF NOT EXISTS wtb_id text UNIQUE;

CREATE TABLE IF NOT EXISTS roster_entries (
  id serial PRIMARY KEY,
  age_class text NOT NULL,
  position smallint NOT NULL,
  player_id integer NOT NULL REFERENCES players(id),
  lk numeric(4, 1),
  nationality text,
  counts_as_german boolean NOT NULL DEFAULT true,
  CONSTRAINT roster_entries_class_position_unique UNIQUE (age_class, position),
  CONSTRAINT roster_entries_class_player_unique UNIQUE (age_class, player_id),
  CONSTRAINT roster_entries_age_class_check CHECK (age_class in ('herren', 'h30'))
);

CREATE TABLE IF NOT EXISTS rides (
  id serial PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  driver_player_id integer NOT NULL REFERENCES players(id),
  seats smallint NOT NULL,
  meeting_point text NOT NULL,
  departure_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rides_match_driver_unique UNIQUE (match_id, driver_player_id),
  CONSTRAINT rides_seats_check CHECK (seats between 1 and 8)
);

CREATE TABLE IF NOT EXISTS ride_passengers (
  id serial PRIMARY KEY,
  ride_id integer NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_passengers_ride_player_unique UNIQUE (ride_id, player_id)
);

CREATE TABLE IF NOT EXISTS ride_requests (
  id serial PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ride_requests_match_player_unique UNIQUE (match_id, player_id)
);

-- 2026-09-25: Verfügbarkeit pro Spieltag (Phase 2). Additive — new table only.
CREATE TABLE IF NOT EXISTS availability (
  id serial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES players(id),
  match_date date NOT NULL,
  status text NOT NULL,
  responded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_player_date_unique UNIQUE (player_id, match_date),
  CONSTRAINT availability_status_check CHECK (status in ('ja', 'vielleicht', 'nein'))
);

-- 2026-09-25: players who hold a Meldeliste position but won't play (e.g. moved away). Additive, defaults to true.
ALTER TABLE players ADD COLUMN IF NOT EXISTS plays_matches boolean NOT NULL DEFAULT true;

-- 2026-09-25: Aufstellung (Phase 3). Additive: one nullable column, one new table.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS lineup_published_at timestamptz;

CREATE TABLE IF NOT EXISTS lineups (
  id serial PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES players(id),
  role text NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lineups_match_player_unique UNIQUE (match_id, player_id),
  CONSTRAINT lineups_role_check CHECK (role in ('stamm', 'ersatz'))
);

-- 2026-09-25: Zu-/Absage und Spieltags-Erinnerung (Phase 4). Additive: nullable columns only.
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS response text;
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
ALTER TABLE lineups DROP CONSTRAINT IF EXISTS lineups_response_check;
ALTER TABLE lineups ADD CONSTRAINT lineups_response_check CHECK (response in ('ja', 'nein'));
