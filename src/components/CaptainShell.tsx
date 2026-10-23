import Link from "next/link";
import type { ReactNode } from "react";
import { BallIcon, ListIcon, SparklesIcon, UsersIcon } from "@/components/icons";

export const CAPTAIN_TABS = [
  { key: "spiele", label: "Spiele", Icon: BallIcon },
  { key: "wer-kann", label: "Wer kann?", Icon: UsersIcon },
  { key: "simulation", label: "Simulation", Icon: SparklesIcon },
  { key: "meldeliste", label: "Meldeliste", Icon: ListIcon },
] as const;

export type CaptainTab = (typeof CAPTAIN_TABS)[number]["key"];

export function captainTab(value: unknown): CaptainTab {
  return CAPTAIN_TABS.some((t) => t.key === value) ? (value as CaptainTab) : "spiele";
}

export function captainTabHref(token: string, tab: CaptainTab): string {
  const base = `/spieler/${token}/mannschaftsfuehrer`;
  return tab === "spiele" ? base : `${base}?tab=${tab}`;
}

/**
 * Frame of the Mannschaftsführer pages: a tab bar fixed to the bottom on phones, a sidebar on wide screens. The
 * tabs are plain links (`?tab=`), so the back button and shared links land on the same tab.
 */
export function CaptainShell({ token, active, children }: { token: string; active: CaptainTab; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-6 lg:grid lg:max-w-6xl lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-8 lg:pb-10">
      <aside className="hidden lg:block">
        <nav aria-label="Mannschaftsführer" className="sticky top-6">
          <ul className="space-y-1">
            {CAPTAIN_TABS.map(({ key, label, Icon }) => (
              <li key={key}>
                <Link
                  href={captainTabHref(token, key)}
                  aria-current={key === active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm font-semibold ${
                    key === active
                      ? "bg-[var(--color-brand-bg)] text-[var(--color-brand)]"
                      : "text-[var(--color-ink-muted)] hover:bg-[var(--color-tabs-bg)]"
                  }`}
                >
                  <Icon />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`/spieler/${token}`}
            className="mt-4 block px-3 text-xs text-[var(--color-ink-muted)] underline underline-offset-2"
          >
            Zu meiner Seite
          </Link>
        </nav>
      </aside>

      <main className="min-w-0">{children}</main>

      <nav
        aria-label="Mannschaftsführer"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-card)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {CAPTAIN_TABS.map(({ key, label, Icon }) => (
            <li key={key} className="flex-1">
              <Link
                href={captainTabHref(token, key)}
                aria-current={key === active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                  key === active ? "text-[var(--color-brand)]" : "text-[var(--color-ink-faint)]"
                }`}
              >
                <Icon />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
