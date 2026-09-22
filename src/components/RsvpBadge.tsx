import type { RsvpStatus } from "@/lib/queries";

const LABEL: Record<RsvpStatus, string> = {
  ja: "✓ Ja",
  nein: "✗ Nein",
  offen: "– keine Antwort",
};

const CLASSES: Record<RsvpStatus, string> = {
  ja: "bg-[var(--color-ja-bg)] text-[var(--color-ja)]",
  nein: "bg-[var(--color-nein-bg)] text-[var(--color-nein)]",
  offen: "bg-[var(--color-offen-bg)] text-[var(--color-offen)]",
};

export function RsvpBadge({ status }: { status: RsvpStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[status]}`}>
      {LABEL[status]}
    </span>
  );
}
