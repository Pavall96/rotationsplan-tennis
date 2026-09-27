import { SubmitButton } from "@/components/SubmitButton";
import { CheckIcon } from "@/components/icons";

export function JumpInForm({
  token,
  sessionId,
  action,
}: {
  token: string;
  sessionId: number;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton className="flex w-full items-center justify-center gap-1.5 rounded-[14px] bg-[var(--color-ja)] px-4 py-3 text-sm font-semibold text-white">
        <CheckIcon className="h-3.5 w-3.5" />
        Ich springe ein
      </SubmitButton>
    </form>
  );
}
