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
      <h1 className="text-xl font-bold mb-1">Admin – Rotationsplan</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Persönliche Links zum Weitergeben. Diese Seite nicht verlinken oder teilen.
      </p>

      {missingEmail.length > 0 && (
        <p className="text-sm text-[var(--color-nein)] mb-4">
          {missingEmail.length} Spieler ohne E-Mail: {missingEmail.map((p) => playerLabel(p)).join(", ")}
        </p>
      )}

      <TestReminderButton />

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/15">
            <th className="py-2 pr-2">Spieler</th>
            <th className="py-2 pr-2">LK</th>
            <th className="py-2 pr-2">Trainer</th>
            <th className="py-2 pr-2">E-Mail</th>
            <th className="py-2">Link</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const link = `${baseUrl}/spieler/${p.token}`;
            return (
              <tr key={p.id} className="border-b border-black/5 dark:border-white/10">
                <td className="py-2 pr-2">
                  {playerLabel(p)}
                  {p.nickname && (
                    <span className="text-black/40 dark:text-white/40"> ({p.displayName})</span>
                  )}
                </td>
                <td className="py-2 pr-2">{p.lk ?? "–"}</td>
                <td className="py-2 pr-2">{p.wantsCoach ? "ja" : "nein"}</td>
                <td className="py-2 pr-2">
                  {p.email ?? <span className="text-[var(--color-nein)]">E-Mail fehlt</span>}
                </td>
                <td className="py-2">
                  <CopyLinkButton value={link} label="Link kopieren" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
