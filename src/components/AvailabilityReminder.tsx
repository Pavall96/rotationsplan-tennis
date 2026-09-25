"use client";

import { useState, useTransition } from "react";
import { availabilityReminder, type ReminderPreview } from "@/app/spieler/[token]/mannschaftsfuehrer/actions";

/** Two steps on purpose: first show who'd get the email, only then send. */
export function AvailabilityReminder({ token, groupText }: { token: string; groupText: string }) {
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (send: boolean) =>
    startTransition(async () => {
      setError(null);
      const res = await availabilityReminder(token, send);
      if ("error" in res) setError(res.error);
      else setPreview(res);
    });

  return (
    <div className="space-y-3">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(groupText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white"
      >
        Abfrage in WhatsApp-Gruppe teilen
      </a>

      {!preview && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(false)}
          className="block text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2 disabled:opacity-50"
        >
          {pending ? "…" : "E-Mail-Erinnerung an alle ohne Antwort vorbereiten"}
        </button>
      )}

      {preview && !preview.sent && (
        <div className="rounded-[12px] bg-[var(--color-tabs-bg)] p-3 text-xs">
          {preview.withEmail.length === 0 ? (
            <p>Niemand mit E-Mail muss gerade erinnert werden.</p>
          ) : (
            <>
              <p className="mb-1 font-semibold">E-Mail geht an {preview.withEmail.length} Spieler:</p>
              <p className="mb-2 text-[var(--color-ink-muted)]">{preview.withEmail.join(", ")}</p>
            </>
          )}
          {preview.recentlyReminded.length > 0 && (
            <p className="mb-2 text-[var(--color-ink-muted)]">
              Heute schon erinnert (bekommen keine zweite Mail): {preview.recentlyReminded.join(", ")}
            </p>
          )}
          {preview.withoutEmail.length > 0 && (
            <p className="mb-2 text-[var(--color-ink-muted)]">
              Ohne E-Mail (bitte per WhatsApp fragen): {preview.withoutEmail.join(", ")}
            </p>
          )}
          <div className="flex gap-3">
            {preview.withEmail.length > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(true)}
                className="rounded-full bg-[var(--color-brand)] px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              >
                {pending ? "…" : "Jetzt senden"}
              </button>
            )}
            <button type="button" onClick={() => setPreview(null)} className="text-[var(--color-ink-muted)] underline">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {preview?.sent && (
        <p className="text-xs font-semibold text-[var(--color-ja)]">
          Erinnerung an {preview.withEmail.length} Spieler wird verschickt.
        </p>
      )}
      {error && <p className="text-xs text-[var(--color-nein)]">{error}</p>}
    </div>
  );
}
