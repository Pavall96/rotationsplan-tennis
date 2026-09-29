// Runs the real Vormerkungs-SQL against the configured database inside a transaction that is forced to fail at the
// end, so Postgres rolls everything back and nothing is kept. Proves the statements run against the live schema.
// Usage: node --env-file=<path to .env.local> --import tsx scripts/check-marks-sql.ts <matchId> <playerId>
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { markStatement, unmarkStatement } from "../src/lib/marks";

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
  const matchId = Number(process.argv[2]);
  const playerId = Number(process.argv[3]);
  if (!matchId || !playerId) throw new Error("Usage: check-marks-sql.ts <matchId> <playerId>");
  await runAndRollBack("mark twice + unmark", [
    markStatement(matchId, playerId),
    markStatement(matchId, playerId),
    unmarkStatement(matchId, playerId),
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
