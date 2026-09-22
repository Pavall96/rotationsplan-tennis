import Link from "next/link";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { RegisterForm } from "@/components/RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const db = getDb();
  const rows = await db.select().from(players).orderBy(players.displayName);
  const playerOptions = rows.map((p) => ({ id: p.id, displayName: p.displayName, hasEmail: Boolean(p.email) }));

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link href="/" className="text-sm underline text-black/60 dark:text-white/60">
        ← Zur Gesamtübersicht
      </Link>

      <header className="my-4">
        <h1 className="text-xl font-bold">Deinen Link holen</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Wähle deinen Namen und trag deine E-Mail ein – du bekommst sofort deinen persönlichen Link, mit
          dem du Termine siehst und zu-/absagst.
        </p>
      </header>

      <RegisterForm playerOptions={playerOptions} />
    </main>
  );
}
