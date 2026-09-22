"use client";

import { useState, useTransition } from "react";
import { registerEmail, type RegisterResult } from "@/app/registrieren/actions";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { MailIcon } from "@/components/icons";

type PlayerOption = { id: number; displayName: string; hasEmail: boolean };

export function RegisterForm({ playerOptions }: { playerOptions: PlayerOption[] }) {
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.status === "ok") {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <p className="mb-2 font-display font-bold">Fertig, {result.displayName}!</p>
        <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
          Das ist dein persönlicher Link – speichere ihn dir (Lesezeichen oder zum Home-Bildschirm hinzufügen).
        </p>
        <div className="flex flex-col items-start gap-2">
          <a
            href={result.link}
            className="inline-block break-all rounded-full bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Zu meiner Seite
          </a>
          <CopyLinkButton value={result.link} label="Link kopieren" />
        </div>
      </div>
    );
  }

  return (
    <>
      <form
        className="space-y-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
        action={(formData) =>
          startTransition(async () => {
            setResult(await registerEmail(formData));
          })
        }
      >
        <div>
          <label htmlFor="playerId" className="mb-1.5 block text-xs font-semibold">
            Wer bist du?
          </label>
          <select
            id="playerId"
            name="playerId"
            required
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card)] px-3 py-2.5 text-sm"
          >
            <option value="">– auswählen –</option>
            {playerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
                {p.hasEmail ? " (schon registriert)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold">
            Deine E-Mail-Adresse
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="du@beispiel.de"
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="nickname" className="mb-1.5 block text-xs font-semibold">
            Wie sollen wir dich anzeigen? (optional)
          </label>
          <input
            id="nickname"
            name="nickname"
            type="text"
            placeholder="z.B. dein Spitzname"
            className="w-full rounded-xl border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            Leer lassen, um deinen Namen aus der Liste zu behalten.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "…" : "Meinen Link holen"}
        </button>

        {result?.status === "already-registered" && (
          <p className="text-sm text-[var(--color-nein)]">
            {result.displayName} ist schon registriert. Falls das nicht stimmt oder du deinen Link verloren
            hast, melde dich bei einem Mannschaftsführer.
          </p>
        )}
        {result?.status === "invalid" && (
          <p className="text-sm text-[var(--color-nein)]">Bitte Namen und eine gültige E-Mail-Adresse angeben.</p>
        )}
      </form>

      <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5">
        <MailIcon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--color-brand)]" />
        <p className="text-xs text-[var(--color-ink-muted)]">
          Warum die E-Mail? Du bekommst darüber eine Erinnerung vor jedem Termin.
        </p>
      </div>
    </>
  );
}
