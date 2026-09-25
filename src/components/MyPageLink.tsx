"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ChevronRightIcon } from "@/components/icons";

// The home page has no token, so it can't know who is looking. Remember the last opened
// player page on this device so the home page can link back to it.
const STORAGE_KEY = "rotationsplan-mein-token";

export function RememberMyPage({ token }: { token: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // localStorage unavailable (e.g. private browsing) — the home page falls back to the sign-up link.
    }
  }, [token]);
  return null;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot() {
  return null;
}

export function MyPageLink() {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <Link
      href={token ? `/spieler/${encodeURIComponent(token)}` : "/registrieren"}
      className="mb-6 flex items-center justify-between gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3 text-sm font-medium"
    >
      {token ? "Zu meinen Terminen" : "Noch keinen persönlichen Link? Hier eintragen"}
      <ChevronRightIcon className="shrink-0 text-[var(--color-ink-faint)]" />
    </Link>
  );
}

/** On the public match page: jump to the personal version (with Fahrgemeinschaft) if this device knows the player. */
export function MyMatchesLink() {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <Link
      href={token ? `/spieler/${encodeURIComponent(token)}/punktspiele` : "/registrieren"}
      className="mb-5 flex items-center justify-between gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-card)] px-[14px] py-3 text-sm font-medium"
    >
      {token ? "Eintragen, wann du kannst · Fahrgemeinschaft" : "Zum Eintragen: persönlichen Link holen"}
      <ChevronRightIcon className="shrink-0 text-[var(--color-ink-faint)]" />
    </Link>
  );
}
