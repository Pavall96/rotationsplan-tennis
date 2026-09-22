"use client";

import { useState, useTransition } from "react";
import { testReminderDryRun } from "@/app/admin/actions";
import type { ReminderRunResult } from "@/lib/reminders";

export function TestReminderButton({ adminKey }: { adminKey: string }) {
  const [result, setResult] = useState<ReminderRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mb-6">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              setResult(await testReminderDryRun(adminKey));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Fehler beim Prüfen.");
            }
          })
        }
        className="text-sm text-[var(--color-ink-muted)] underline disabled:opacity-50"
      >
        {pending ? "Prüfe …" : "Testerinnerung anzeigen (dryRun, kein Versand)"}
      </button>
      {error && <p className="mt-2 text-sm text-[var(--color-nein)]">{error}</p>}
      {result && (
        <pre className="mt-2 overflow-auto rounded-xl bg-black/5 p-3 text-xs dark:bg-white/10">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
