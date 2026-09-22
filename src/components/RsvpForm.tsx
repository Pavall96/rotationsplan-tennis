import { setRsvp } from "@/app/spieler/[token]/actions";
import { SubmitButton } from "@/components/SubmitButton";
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
    <div className="flex gap-2 mt-2">
      <form action={setRsvp}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="status" value="ja" />
        <SubmitButton
          className={`px-4 py-2 rounded-md text-sm font-semibold ${
            current === "ja"
              ? "bg-[var(--color-ja)] text-white"
              : "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
          }`}
        >
          Ja, ich bin dabei
        </SubmitButton>
      </form>
      <form action={setRsvp}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="status" value="nein" />
        <SubmitButton
          className={`px-4 py-2 rounded-md text-sm font-semibold ${
            current === "nein"
              ? "bg-[var(--color-nein)] text-white"
              : "bg-[var(--color-nein-bg)] text-[var(--color-nein)]"
          }`}
        >
          Nein, ich kann nicht
        </SubmitButton>
      </form>
    </div>
  );
}
