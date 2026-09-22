import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db";
import { players } from "../src/db/schema";

function parseCsv(content: string): { displayName: string; email: string }[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [header, ...rows] = lines;
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  const nameIdx = cols.indexOf("display_name");
  const emailIdx = cols.indexOf("email");
  if (nameIdx === -1 || emailIdx === -1) {
    throw new Error('CSV muss Spalten "display_name" und "email" haben.');
  }
  return rows.map((line) => {
    const parts = line.split(",");
    return {
      displayName: (parts[nameIdx] ?? "").trim(),
      email: (parts[emailIdx] ?? "").trim(),
    };
  });
}

async function main() {
  const csvPath = path.join(process.cwd(), "data", "spieler-emails.csv");
  let content: string;
  try {
    content = await readFile(csvPath, "utf-8");
  } catch {
    console.error(`\n❌ Datei nicht gefunden: ${csvPath}`);
    console.error(`   Kopiere data/spieler-emails.example.csv dorthin und trage die E-Mails ein.\n`);
    process.exit(1);
  }

  const rows = parseCsv(content);
  const db = getDb();
  const existing = await db.select().from(players);
  const byName = new Map(existing.map((p) => [p.displayName, p]));

  const unknownNames = rows.filter((r) => !byName.has(r.displayName));
  if (unknownNames.length > 0) {
    console.error("\n❌ Unbekannte Spielernamen in der CSV (exakter Match erforderlich):");
    for (const r of unknownNames) console.error(`   - "${r.displayName}"`);
    process.exit(1);
  }

  const withEmail = rows.filter((r) => r.email.length > 0);
  const emailCounts = new Map<string, number>();
  for (const r of withEmail) {
    emailCounts.set(r.email, (emailCounts.get(r.email) ?? 0) + 1);
  }
  const duplicates = [...emailCounts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.error("\n❌ Doppelte E-Mail-Adressen in der CSV:");
    for (const [email] of duplicates) console.error(`   - ${email}`);
    process.exit(1);
  }

  let updated = 0;
  for (const r of withEmail) {
    await db.update(players).set({ email: r.email }).where(eq(players.displayName, r.displayName));
    updated++;
  }

  const missing = rows.filter((r) => r.email.length === 0);
  console.log(`✅ ${updated} E-Mail-Adressen importiert.`);
  if (missing.length > 0) {
    console.log(`⚠️  ${missing.length} Spieler ohne E-Mail:`);
    for (const r of missing) console.log(`   - ${r.displayName}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
