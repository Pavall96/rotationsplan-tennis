import Link from "next/link";

export default function NotFound() {
  return (
    <main className="max-w-md mx-auto w-full px-4 py-16 flex-1 text-center">
      <h1 className="text-lg font-semibold mb-2">Link nicht gültig</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Dieser Link ist nicht gültig – bitte bei Pablo nachfragen.
      </p>
      <Link href="/" className="text-sm underline">
        Zur Gesamtübersicht
      </Link>
    </main>
  );
}
