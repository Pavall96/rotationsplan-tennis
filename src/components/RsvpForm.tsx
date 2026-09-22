import { setRsvp } from "@/app/spieler/[token]/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { CheckIcon, XIcon } from "@/components/icons";
import type { RsvpStatus } from "@/lib/queries";

export function RsvpForm({
  token,
  sessionId,
  current,
}: {
  token: string;
  sessionId: number;
  current: RsvpStatus;
}) {
  return (
    <div className="mt-3 flex gap-2">
      <form action={setRsvp} className="flex-1">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="status" value="ja" />
        <SubmitButton
          className={`flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold ${
            current === "ja"
              ? "bg-[var(--color-ja)] text-white"
              : "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
          }`}
        >
          <CheckIcon className="h-3.5 w-3.5" />
          Ja, dabei
        </SubmitButton>
      </form>
      <form action={setRsvp} className="flex-1">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="status" value="nein" />
        <SubmitButton
          className={`flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold ${
            current === "nein"
              ? "bg-[var(--color-nein)] text-white"
              : "bg-[var(--color-nein-bg)] text-[var(--color-nein)]"
          }`}
        >
          <XIcon className="h-3.5 w-3.5" />
          Nein, kann nicht
        </SubmitButton>
      </form>
    </div>
  );
}
