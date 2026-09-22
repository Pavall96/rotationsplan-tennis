import { getDb } from "../src/db";
import { players } from "../src/db/schema";

async function main() {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const db = getDb();
  const rows = await db.select().from(players).orderBy(players.displayName);

  console.log(`Persönliche Links (${rows.length} Spieler):\n`);
  for (const p of rows) {
    const emailNote = p.email ? p.email : "⚠️  keine E-Mail";
    console.log(`${p.displayName.padEnd(20)} ${emailNote.padEnd(30)} ${base}/spieler/${p.token}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
