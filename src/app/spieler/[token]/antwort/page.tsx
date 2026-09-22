import Link from "next/link";
import { notFound } from "next/navigation";
import { getFullSchedule, getPlayerByToken, myRoleInSession } from "@/lib/queries";
import { formatDate, formatTimeRange, playerLabel, rsvpLabels } from "@/lib/format";
import { confirmRsvpFromEmail } from "@/app/spieler/[token]/actions";
import { RsvpBadge } from "@/components/RsvpBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { ArrowLeftIcon, CheckIcon, PinIcon, XIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

// Landing page for the Ja/Nein buttons in the reminder email. Rendering it never writes anything –
// mail scanners open every link in a message – the answer is only saved when the button here is pressed.
export default async function AnswerPage({ params, searchParams }: PageProps<"/spieler/[token]/antwort">) {
  const { token } = await params;
  const { termin, antwort } = await searchParams;

  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const sessionId = Number(termin);
  const requested = antwort === "ja" || antwort === "nein" ? antwort : null;

  const schedule = await getFullSchedule();
  const session = Number.isInteger(sessionId) ? schedule.find((s) => s.id === sessionId) : undefined;
  const role = session ? myRoleInSession(session, player.id) : null;

  const backLink = (
    <Link
      href={`/spieler/${token}`}
      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      Zu deinen Terminen
    </Link>
  );

  if (!session || !role) {
    return (
      <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
        {backLink}
        <h1 className="font-display my-4 text-2xl font-bold">Termin nicht gefunden</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Du bist für diesen Termin nicht (mehr) eingeteilt. Deine aktuellen Termine findest du auf deiner Seite.
        </p>
      </main>
    );
  }

  const myAssignment = [session.trainer, session.ersatz, ...session.starters].find(
    (a) => a?.playerId === player.id,
  )!;
  const labels = rsvpLabels(role);
  const question =
    role === "ersatz"
      ? "Hältst du dich als Ersatz bereit?"
      : role === "trainer"
        ? "Bist du als Trainer dabei?"
        : "Bist du dabei?";

  const options = (["ja", "nein"] as const).map((status) => {
    // The answer clicked in the email is the prominent one; the other stays available in case of a misclick.
    const emphasized = requested === null || requested === status;
    const colors =
      status === "ja"
        ? emphasized
          ? "bg-[var(--color-ja)] text-white"
          : "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
        : emphasized
          ? "bg-[var(--color-nein)] text-white"
          : "bg-[var(--color-nein-bg)] text-[var(--color-nein)]";
    return { status, colors, emphasized };
  });
  if (requested === "nein") options.reverse();

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      {backLink}

      <header className="my-4">
        <h1 className="font-display text-2xl font-bold">Hallo {playerLabel(player)}!</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">{question}</p>
      </header>

      <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[0_10px_24px_-16px_rgba(21,32,28,0.28)]">
        <p className="font-display text-lg font-bold">{formatDate(session.startsAt)}</p>
        <p className="text-sm text-[var(--color-ink-muted)]">{formatTimeRange(session.startsAt, session.endsAt)}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
          <PinIcon />
          {session.hallName}
          {session.withCoach ? " · mit Trainer" : ""}
        </p>
        {session.note && (
          <p className="mt-2 w-fit rounded-lg bg-yellow-100 px-2 py-0.5 text-xs text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">
            {session.note}
          </p>
        )}

        {role === "ersatz" ? (
          <p className="mt-2 text-sm">
            Du bist an diesem Termin <span className="font-semibold">Ersatz</span>. Mit „Ja“ sagst du, dass du
            einspringen kannst, falls jemand absagt.
          </p>
        ) : role === "trainer" ? (
          <p className="mt-2 text-sm">Du bist als Trainer eingeteilt.</p>
        ) : (
          <p className="mt-2 text-sm">
            Mit dabei:{" "}
            {session.starters
              .filter((a) => a.playerId !== player.id)
              .map((a) => a.displayName)
              .join(", ")}
          </p>
        )}

        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
          Bisherige Antwort: <RsvpBadge status={myAssignment.rsvpStatus} />
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {options.map(({ status, colors, emphasized }) => (
            <form key={status} action={confirmRsvpFromEmail}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="sessionId" value={session.id} />
              <input type="hidden" name="status" value={status} />
              <SubmitButton
                className={`flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 font-semibold ${colors} ${
                  emphasized ? "py-3.5 text-base" : "py-2.5 text-sm"
                }`}
              >
                {status === "ja" ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
                {requested === status ? `Bestätigen: ${labels[status]}` : labels[status]}
              </SubmitButton>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
