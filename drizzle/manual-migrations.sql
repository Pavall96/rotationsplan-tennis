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
