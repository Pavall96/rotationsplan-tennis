"use client";

import { useState, useTransition } from "react";
import { testReminderDryRun } from "@/app/admin/actions";
import type { ReminderRunResult } from "@/lib/reminders";

export function TestReminderButton() {
  const [result, setResult] = useState<ReminderRunResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mb-6">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await testReminderDryRun()))}
        className="text-sm underline text-black/70 dark:text-white/70 disabled:opacity-50"
      >
        {pending ? "Prüfe …" : "Testerinnerung anzeigen (dryRun, kein Versand)"}
      </button>
      {result && (
        <pre className="mt-2 text-xs bg-black/5 dark:bg-white/10 rounded p-3 overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
