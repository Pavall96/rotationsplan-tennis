import Link from "next/link";

export default function NotFound() {
  return (
    <main className="max-w-md mx-auto w-full flex-1 px-4 py-16 text-center">
      <h1 className="font-display mb-2 text-lg font-bold">Link nicht gültig</h1>
      <p className="mb-6 text-sm text-[var(--color-ink-muted)]">
        Dieser Link ist nicht gültig – bitte bei Pablo nachfragen.
      </p>
      <Link href="/" className="text-sm underline">
        Zur Gesamtübersicht
      </Link>
    </main>
  );
}
