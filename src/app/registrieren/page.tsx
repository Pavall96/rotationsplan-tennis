import Link from "next/link";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { RegisterForm } from "@/components/RegisterForm";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const db = getDb();
  const rows = await db.select().from(players).orderBy(players.displayName);
  const playerOptions = rows.map((p) => ({ id: p.id, displayName: p.displayName, hasEmail: Boolean(p.email) }));

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zur Gesamtübersicht
      </Link>

      <header className="my-4">
        <h1 className="font-display text-xl font-bold">Deinen Link holen</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Wähle deinen Namen und trag deine E-Mail ein – du bekommst sofort deinen persönlichen Link, mit
          dem du Termine siehst und zu-/absagst.
        </p>
      </header>

      <RegisterForm playerOptions={playerOptions} />
    </main>
  );
}
