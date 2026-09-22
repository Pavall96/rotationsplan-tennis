"use client";

import { useState } from "react";

export function CopyLinkButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard API unavailable (e.g. insecure context) — user can still long-press/copy manually.
        }
      }}
      className="text-sm text-[var(--color-ink-muted)] underline underline-offset-2"
    >
      {copied ? "Kopiert!" : label}
    </button>
  );
}
