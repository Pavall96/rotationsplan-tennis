// Runs the real slot SQL against the configured database inside a transaction that is forced to fail at the end,
// so Postgres rolls everything back and nothing is kept. Proves the statements parse and run against the live schema.
// Usage: node --env-file=<path to .env.local> --import tsx scripts/check-slots-sql.ts <sessionId> <playerId>
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { claimSlotStatements, retractCancellationStatements } from "../src/lib/slots";

async function runAndRollBack(name: string, statements: readonly unknown[]) {
  const db = getDb();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch([...(statements as any[]), db.execute(sql`select 1 / 0 as force_rollback`)] as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("division by zero")) {
      console.log(`OK ${name} – statements ran and were rolled back.`);
      return;
    }
    throw err;
  }
  throw new Error(`${name}: expected the forced rollback error.`);
}

async function main() {
  const sessionId = Number(process.argv[2]);
  const playerId = Number(process.argv[3]);
  if (!sessionId || !playerId) throw new Error("Usage: check-slots-sql.ts <sessionId> <playerId>");
  await runAndRollBack("retractCancellation", retractCancellationStatements(sessionId, playerId, "web"));
  await runAndRollBack("claimSlot", claimSlotStatements(sessionId, playerId, "web"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
