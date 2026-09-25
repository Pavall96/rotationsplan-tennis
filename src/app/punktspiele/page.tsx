import Link from "next/link";
import { MatchList } from "@/components/MatchList";
import { MyMatchesLink } from "@/components/MyPageLink";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MatchesPage({ searchParams }: PageProps<"/punktspiele">) {
  const { team } = await searchParams;

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zur Gesamtübersicht
      </Link>

      <header className="my-4">
        <h1 className="font-display text-2xl font-bold">Winterspiele 2026/27</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Alle Punktspiele unserer Mannschaften. Tipp auf „Route starten“, um dich direkt zur Halle führen zu lassen.
        </p>
      </header>

      <MyMatchesLink />

      <MatchList basePath="/punktspiele" teamSlug={typeof team === "string" ? team : undefined} viewer={null} />
    </main>
  );
}
