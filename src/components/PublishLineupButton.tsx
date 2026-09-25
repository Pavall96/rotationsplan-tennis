"use client";

import { useState, useTransition } from "react";
import {
  publishLineup,
  type PublishPreview,
} from "@/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions";

/** Two steps: show who'd be emailed, then publish. Re-publishing after changes only emails newcomers. */
export function PublishLineupButton({
  token,
  matchId,
  published,
}: {
  token: string;
  matchId: number;
  published: boolean;
}) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (send: boolean) =>
    startTransition(async () => {
      setError(null);
      const res = await publishLineup(token, matchId, send);
      if ("error" in res) setError(res.error);
      else setPreview(res);
    });

  if (preview?.sent) {
    return (
      <p className="text-sm font-semibold text-[var(--color-ja)]">
        Veröffentlicht{preview.withEmail.length > 0 ? ` – E-Mail an ${preview.withEmail.join(", ")} wird verschickt.` : "."}
      </p>
    );
  }

  return (
    <div>
      {!preview && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(false)}
          className="w-full rounded-full bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "…" : published ? "Änderungen veröffentlichen" : "Aufstellung veröffentlichen"}
        </button>
      )}

      {preview && (
        <div className="rounded-[14px] bg-[var(--color-tabs-bg)] p-3 text-sm">
          {preview.stammCount < preview.playersNeeded && (
            <p className="mb-2 font-semibold text-[var(--color-nein)]">
              Erst {preview.stammCount} von {preview.playersNeeded} Spielern aufgestellt.
            </p>
          )}
          {preview.withEmail.length > 0 ? (
            <p className="mb-1">
              E-Mail an: <span className="font-semibold">{preview.withEmail.join(", ")}</span>
            </p>
          ) : (
            <p className="mb-1">Niemand Neues bekommt eine E-Mail.</p>
          )}
          {preview.withoutEmail.length > 0 && (
            <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
              Ohne E-Mail – bitte selbst Bescheid geben: {preview.withoutEmail.join(", ")}
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(true)}
              className="rounded-full bg-[var(--color-brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending ? "…" : "Jetzt veröffentlichen"}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="text-xs text-[var(--color-ink-muted)] underline">
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[var(--color-nein)]">{error}</p>}
    </div>
  );
}
