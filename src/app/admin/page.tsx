import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { players } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { playerLabel } from "@/lib/format";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { TestReminderButton } from "@/components/TestReminderButton";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { key } = await searchParams;
  if (!process.env.ADMIN_TOKEN || key !== process.env.ADMIN_TOKEN) notFound();

  const db = getDb();
  const rows = await db.select().from(players).orderBy(players.displayName);
  const baseUrl = await getBaseUrl();
  const missingEmail = rows.filter((p) => !p.email);

  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-6 flex-1">
      <h1 className="font-display mb-1 text-xl font-bold">Admin – Rotationsplan</h1>
      <p className="mb-6 text-sm text-[var(--color-ink-muted)]">
        Persönliche Links zum Weitergeben. Diese Seite nicht verlinken oder teilen.
      </p>

      {missingEmail.length > 0 && (
        <p className="mb-4 text-sm text-[var(--color-nein)]">
          {missingEmail.length} Spieler ohne E-Mail: {missingEmail.map((p) => playerLabel(p)).join(", ")}
        </p>
      )}

      <TestReminderButton adminKey={String(key)} />

      <p className="mb-6">
        <a
          href={`/api/admin/abstimmungen?key=${encodeURIComponent(String(key))}`}
          className="inline-block rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Abstimmungen Winterspiele als Excel herunterladen
        </a>
      </p>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-tabs-bg)] text-left">
              <th className="py-2.5 pl-3 pr-2 font-semibold">Spieler</th>
              <th className="py-2.5 pr-2 font-semibold">LK</th>
              <th className="py-2.5 pr-2 font-semibold">Trainer</th>
              <th className="py-2.5 pr-2 font-semibold">E-Mail</th>
              <th className="py-2.5 pr-3 font-semibold">Link</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const link = `${baseUrl}/spieler/${p.token}`;
              return (
                <tr key={p.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="py-2.5 pl-3 pr-2">
                    {playerLabel(p)}
                    {p.nickname && (
                      <span className="text-[var(--color-ink-faint)]"> ({p.displayName})</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2">{p.lk ?? "–"}</td>
                  <td className="py-2.5 pr-2">{p.wantsCoach ? "ja" : "nein"}</td>
                  <td className="py-2.5 pr-2">
                    {p.email ?? <span className="text-[var(--color-nein)]">E-Mail fehlt</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <CopyLinkButton value={link} label="Link kopieren" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
