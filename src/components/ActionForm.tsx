"use client";

import { useActionState } from "react";

type Result = { error?: string } | void;

/** A form for a server action that may answer with `{ error }`; shows the error right under the form. */
export function ActionForm({
  action,
  hidden,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<Result>;
  hidden: Record<string, string | number>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(async (_prev: Result, formData: FormData) => action(formData), undefined);

  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state?.error && <p className="mt-1.5 w-full text-xs text-[var(--color-nein)]">{state.error}</p>}
    </form>
  );
}
