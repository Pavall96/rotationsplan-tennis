"use client";

import { useState, useTransition } from "react";
import { registerEmail, type RegisterResult } from "@/app/registrieren/actions";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { AlertIcon, MailIcon } from "@/components/icons";
import { isAppleRelayEmail } from "@/lib/format";

type PlayerOption = { id: number; displayName: string; hasEmail: boolean };

export function RegisterForm({ playerOptions }: { playerOptions: PlayerOption[] }) {
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const appleRelay = isAppleRelayEmail(email);

  if (result?.status === "ok") {
    return (
      <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px]">
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
        className="space-y-3.5 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px]"
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
            className="w-full rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-3 py-2.5 text-sm"
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
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={appleRelay || undefined}
            aria-describedby={appleRelay ? "email-relay-hint" : undefined}
            className={`w-full rounded-[10px] border bg-transparent px-3 py-2.5 text-sm ${
              appleRelay ? "border-[var(--color-nein)]" : "border-[var(--color-border-strong)]"
            }`}
          />
          {appleRelay && <AppleRelayHint />}
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
            className="w-full rounded-[10px] border border-[var(--color-border-strong)] bg-transparent px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            Leer lassen, um deinen Namen aus der Liste zu behalten.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending || appleRelay}
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
        {result?.status === "email-taken" && (
          <p className="text-sm text-[var(--color-nein)]">
            Diese E-Mail-Adresse ist schon bei einem anderen Spieler hinterlegt. Bitte nimm eine andere oder melde
            dich bei einem Mannschaftsführer.
          </p>
        )}
        {result?.status === "apple-relay" && !appleRelay && <AppleRelayHint />}
        {result?.status === "invalid" && (
          <p className="text-sm text-[var(--color-nein)]">Bitte Namen und eine gültige E-Mail-Adresse angeben.</p>
        )}
      </form>

      <div className="mt-3 flex items-start gap-2.5 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3">
        <MailIcon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--color-brand)]" />
        <p className="text-xs text-[var(--color-ink-muted)]">
          Warum die E-Mail? Du bekommst darüber eine Erinnerung vor jedem Termin.
        </p>
      </div>
    </>
  );
}

function AppleRelayHint() {
  return (
    <p
      id="email-relay-hint"
      className="mt-1.5 flex gap-1.5 rounded-lg bg-[var(--color-nein-bg)] px-2.5 py-2 text-xs text-[var(--color-nein)]"
    >
      <AlertIcon className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Das ist eine Apple-„E-Mail-Adresse verbergen“. Dorthin kommen unsere Erinnerungen nicht an – bitte gib deine
        echte Adresse ein (z.B. Gmail, Outlook, iCloud, GMX).
      </span>
    </p>
  );
}
