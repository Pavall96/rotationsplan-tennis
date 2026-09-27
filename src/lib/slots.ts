import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Namespace for pg_advisory_xact_lock(namespace, session_id), so these locks never collide with other advisory locks.
const SLOT_LOCK = 3011;

type Source = "web" | "email";

/** Same count as openSlots() in vacancy.ts, evaluated inside the locked transaction. */
function openSlotsSql(sessionId: number) {
  return sql`(
    (select count(*) from session_assignments a
       join rsvps r on r.session_id = a.session_id and r.player_id = a.player_id
      where a.session_id = ${sessionId} and a.role = 'starter' and r.status = 'nein')
    - (select count(*) from session_assignments where session_id = ${sessionId} and role = 'einspringer')
    - (select count(*) from session_assignments a
         join rsvps r on r.session_id = a.session_id and r.player_id = a.player_id
        where a.session_id = ${sessionId} and a.role = 'ersatz' and r.status = 'ja')
  )`;
}

// Each write below runs as one transaction (neon-http batch). The advisory lock makes two clicks on the same session
// run one after the other, and every statement after it sees what the earlier transaction committed.

/** The statements behind claimSlot, exported so scripts/check-slots-sql.ts can run them and roll back. */
export function claimSlotStatements(sessionId: number, playerId: number, source: Source) {
  const db = getDb();
  return [
    db.execute(sql`select pg_advisory_xact_lock(${SLOT_LOCK}, ${sessionId})`),
    db.execute(sql`
      insert into session_assignments (session_id, player_id, role)
      select ${sessionId}, ${playerId}, 'einspringer'
      where ${openSlotsSql(sessionId)} > 0
      on conflict do nothing
      returning id`),
    db.execute(sql`
      insert into rsvps (session_id, player_id, status, source)
      select ${sessionId}, ${playerId}, 'ja', ${source}
      where exists (select 1 from session_assignments
                     where session_id = ${sessionId} and player_id = ${playerId} and role = 'einspringer')
      on conflict (session_id, player_id) do update set status = 'ja', responded_at = now(), source = excluded.source`),
  ] as const;
}

/** The statements behind retractCancellation, exported for scripts/check-slots-sql.ts. */
export function retractCancellationStatements(sessionId: number, playerId: number, source: Source) {
  const db = getDb();
  return [
    db.execute(sql`select pg_advisory_xact_lock(${SLOT_LOCK}, ${sessionId})`),
    db.execute(sql`
      update rsvps set status = 'ja', responded_at = now(), source = ${source}
      where session_id = ${sessionId} and player_id = ${playerId} and status = 'nein'
        and ${openSlotsSql(sessionId)} > 0
      returning id`),
  ] as const;
}

/** Takes a free place for the player. False when no place was left (someone else was quicker). */
export async function claimSlot(sessionId: number, playerId: number, source: Source): Promise<boolean> {
  const [, inserted] = await getDb().batch(claimSlotStatements(sessionId, playerId, source));
  return inserted.rows.length > 0;
}

/** A starter takes their cancellation back. False when their place has been taken in the meantime. */
export async function retractCancellation(sessionId: number, playerId: number, source: Source): Promise<boolean> {
  const [, updated] = await getDb().batch(retractCancellationStatements(sessionId, playerId, source));
  return updated.rows.length > 0;
}

/** Someone who jumped in can't come after all: the place is free again. */
export async function leaveSlot(sessionId: number, playerId: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db.execute(sql`delete from rsvps where session_id = ${sessionId} and player_id = ${playerId}`),
    db.execute(sql`
      delete from session_assignments
      where session_id = ${sessionId} and player_id = ${playerId} and role = 'einspringer'`),
  ]);
}
