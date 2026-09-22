"use client";

import { useState, useTransition } from "react";
import { registerEmail, type RegisterResult } from "@/app/registrieren/actions";
import { CopyLinkButton } from "@/components/CopyLinkButton";

type PlayerOption = { id: number; displayName: string; hasEmail: boolean };

export function RegisterForm({ playerOptions }: { playerOptions: PlayerOption[] }) {
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.status === "ok") {
    return (
      <div className="rounded-lg border border-black/10 dark:border-white/15 p-4">
        <p className="font-semibold mb-2">Fertig, {result.displayName}!</p>
        <p className="text-sm text-black/60 dark:text-white/60 mb-3">
          Das ist dein persönlicher Link – speichere ihn dir (Lesezeichen oder zum Home-Bildschirm hinzufügen).
        </p>
        <div className="flex flex-col gap-2 items-start">
          <a
            href={result.link}
            className="inline-block bg-black text-white dark:bg-white dark:text-black rounded-md px-4 py-2 text-sm font-semibold break-all"
          >
            Zu meiner Seite
          </a>
          <CopyLinkButton value={result.link} label="Link kopieren" />
        </div>
      </div>
    );
  }

  return (
    <form
      className="rounded-lg border border-black/10 dark:border-white/15 p-4 space-y-3"
      action={(formData) =>
        startTransition(async () => {
          setResult(await registerEmail(formData));
        })
      }
    >
      <div>
        <label htmlFor="playerId" className="block text-sm font-medium mb-1">
          Wer bist du?
        </label>
        <select
          id="playerId"
          name="playerId"
          required
          className="w-full rounded-md border border-black/20 dark:border-white/20 bg-transparent px-3 py-2 text-sm"
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
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Deine E-Mail-Adresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="du@beispiel.de"
          className="w-full rounded-md border border-black/20 dark:border-white/20 bg-transparent px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-black text-white dark:bg-white dark:text-black rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
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
  );
}
