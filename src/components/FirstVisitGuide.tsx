"use client";

import { useEffect, useState } from "react";
import { InfoIcon } from "@/components/icons";

export function FirstVisitGuide({ token }: { token: string }) {
  const storageKey = `rotationsplan-anleitung-gesehen-${token}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read localStorage only after mount, so the server and first client render both start hidden
    // (localStorage isn't available during SSR) and there's no hydration mismatch.
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(storageKey);
    } catch {
      // localStorage unavailable (e.g. private browsing) — fall through and show the guide.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, only readable after mount
    if (!seen) setVisible(true);
  }, [storageKey]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore — worst case the guide reappears next visit.
    }
  }

  return (
    <section className="mb-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-brand-bg)] text-[var(--color-brand)]">
          <InfoIcon />
        </span>
        <h2 className="font-display font-bold">Willkommen!</h2>
      </div>
      <ul className="mb-3 space-y-1.5 text-xs text-[var(--color-ink-muted)]">
        <li>Hier siehst du deine Trainingstermine und wer sonst dabei ist.</li>
        <li>Sag bei jedem Termin kurz zu oder ab – so weiß die Runde früh genug Bescheid.</li>
        <li>Abonniere den Kalender, dann erscheinen neue oder geänderte Termine automatisch.</li>
        <li>Dieser Link ist persönlich – speichere ihn als Lesezeichen, um jederzeit zurückzufinden.</li>
      </ul>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
      >
        Alles klar
      </button>
    </section>
  );
}
