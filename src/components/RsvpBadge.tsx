import type { RsvpStatus } from "@/lib/queries";
import { CheckIcon, XIcon, DashIcon } from "@/components/icons";

const LABEL: Record<RsvpStatus, string> = {
  ja: "Ja",
  nein: "Nein",
  offen: "Offen",
};

const CLASSES: Record<RsvpStatus, string> = {
  ja: "bg-[var(--color-ja-bg)] text-[var(--color-ja)]",
  nein: "bg-[var(--color-nein-bg)] text-[var(--color-nein)]",
  offen: "bg-[var(--color-offen-bg)] text-[var(--color-offen)]",
};

const ICON: Record<RsvpStatus, React.ReactNode> = {
  ja: <CheckIcon className="h-2.5 w-2.5" />,
  nein: <XIcon className="h-2.5 w-2.5" />,
  offen: <DashIcon className="h-2.5 w-2.5" />,
};

export function RsvpBadge({ status }: { status: RsvpStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${CLASSES[status]}`}
    >
      {ICON[status]}
      {LABEL[status]}
    </span>
  );
}
