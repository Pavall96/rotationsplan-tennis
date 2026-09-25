"use client";

import { useRef, useState, useTransition } from "react";
import { addPlayer, type AddPlayerResult } from "@/app/spieler/[token]/mannschaftsfuehrer/actions";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { inviteText, whatsappUrl } from "@/lib/invite";

export function AddPlayerForm({ token, registerUrl }: { token: string; registerUrl: string }) {
  const [result, setResult] = useState<AddPlayerResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="space-y-3"
      action={(formData) =>
        startTransition(async () => {
          const res = await addPlayer(formData);
          setResult(res);
          if (res.status === "ok") formRef.current?.reset();
        })
      }
    >
      <input type="hidden" name="token" value={token} />
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="displayName" className="mb-1.5 block text-xs font-semibold">
            Name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            maxLength={60}
            placeholder="Vor- und Nachname"
            className="w-full rounded-[10px] border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm"
          />
        </div>
        <div className="w-20 shrink-0">
          <label htmlFor="lk" className="mb-1.5 block text-xs font-semibold">
            LK
          </label>
          <input
            id="lk"
            name="lk"
            type="text"
            inputMode="decimal"
            placeholder="z.B. 18"
            className="w-full rounded-[10px] border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "…" : "Spieler hinzufügen"}
      </button>

      {result?.status === "ok" && (
        <div className="rounded-[14px] bg-[var(--color-ja-bg)] px-3 py-2.5 text-sm">
          <p className="mb-2 font-semibold text-[var(--color-ja)]">{result.displayName} ist jetzt in der App.</p>
          <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
            Schick ihm den Link zum Eintragen – dort wählt er seinen Namen und bekommt seinen persönlichen Link.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={whatsappUrl(inviteText(result.displayName, registerUrl))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white"
            >
              Per WhatsApp schicken
            </a>
            <CopyLinkButton value={inviteText(result.displayName, registerUrl)} label="Text kopieren" />
          </div>
        </div>
      )}
      {result?.status === "name-taken" && (
        <p className="text-sm text-[var(--color-nein)]">
          „{result.displayName}“ gibt es schon in der App – er kann sich direkt eintragen.
        </p>
      )}
      {result?.status === "invalid" && (
        <p className="text-sm text-[var(--color-nein)]">Bitte einen Namen und – falls angegeben – eine LK zwischen 1 und 25.</p>
      )}
      {result?.status === "forbidden" && (
        <p className="text-sm text-[var(--color-nein)]">Nur Mannschaftsführer können Spieler hinzufügen.</p>
      )}
    </form>
  );
}
