import { Resend } from "resend";
import type { SessionView } from "@/lib/queries";
import { formatTimeRange, formatDate } from "@/lib/format";

let resendInstance: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendInstance) resendInstance = new Resend(apiKey);
  return resendInstance;
}

export type ReminderEmailInput = {
  to: string;
  playerName: string;
  role: "starter" | "ersatz";
  session: SessionView;
  token: string;
  baseUrl: string;
};

function renderReminder(input: ReminderEmailInput): { subject: string; html: string; text: string } {
  const { playerName, role, session, token, baseUrl } = input;
  const withCoach = session.withCoach ? "mit Trainer" : "ohne Trainer";
  const others = session.starters.map((a) => a.displayName).join(", ");
  const time = formatTimeRange(session.startsAt, session.endsAt);
  const date = formatDate(session.startsAt);

  const subject =
    role === "ersatz"
      ? `Ersatz heute ${formatTimeRangeStart(session)} ${session.hallName} – hältst du dich bereit?`
      : `Heute ${formatTimeRangeStart(session)} ${session.hallName} – bist du dabei?`;

  const yesUrl = `${baseUrl}/spieler/${token}?termin=${session.id}&antwort=ja`;
  const noUrl = `${baseUrl}/spieler/${token}?termin=${session.id}&antwort=nein`;
  const overviewUrl = `${baseUrl}/`;
  const personalUrl = `${baseUrl}/spieler/${token}`;

  const roleLine =
    role === "ersatz"
      ? `Du bist heute als <strong>Ersatz</strong> eingetragen.`
      : `Mit dabei: ${others}`;

  const ersatzHint =
    role === "starter" && session.ersatz
      ? `<p style="margin:16px 0 0;color:#444;">Wenn du nicht kannst, kannst du <strong>${session.ersatz.displayName}</strong> direkt fragen.</p>`
      : "";

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111;">
    <p style="display:none;max-height:0;overflow:hidden;">Bitte kurz abstimmen: Ja oder Nein.</p>
    <p>Hallo ${playerName},</p>
    <p>heute ist Wintertraining:</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;background:#f6f8f7;border-radius:8px;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 4px;font-weight:600;">${date} · ${time}</p>
        <p style="margin:0 0 4px;">Halle: ${session.hallName} (${withCoach})</p>
        <p style="margin:0;">${roleLine}</p>
      </td></tr>
    </table>
    <p>Bist du heute dabei? Bitte abstimmen:</p>
    <table role="presentation" style="margin:16px 0;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${yesUrl}" style="display:inline-block;background:#1a7f37;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Ja, ich bin dabei</a>
        </td>
        <td>
          <a href="${noUrl}" style="display:inline-block;background:#b42318;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Nein, ich kann nicht</a>
        </td>
      </tr>
    </table>
    <p style="color:#444;">Deine Antwort sehen alle im gemeinsamen Plan – so weiß die Runde früh genug, ob jemand fehlt.</p>
    ${ersatzHint}
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />
    <p style="font-size:13px;color:#666;">
      Ganzer Plan: <a href="${overviewUrl}">${overviewUrl}</a><br/>
      Dein persönlicher Link: <a href="${personalUrl}">${personalUrl}</a><br/>
      Diesen Link nicht weitergeben.
    </p>
  </div>`;

  const text = [
    `Hallo ${playerName},`,
    ``,
    `heute ist Wintertraining:`,
    `${date} · ${time}`,
    `Halle: ${session.hallName} (${withCoach})`,
    role === "ersatz" ? `Du bist heute als Ersatz eingetragen.` : `Mit dabei: ${others}`,
    ``,
    `Bist du heute dabei? Bitte abstimmen:`,
    `Ja: ${yesUrl}`,
    `Nein: ${noUrl}`,
    ``,
    role === "starter" && session.ersatz ? `Wenn du nicht kannst, frag direkt ${session.ersatz.displayName}.` : ``,
    `Ganzer Plan: ${overviewUrl}`,
    `Dein persönlicher Link: ${personalUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

function formatTimeRangeStart(session: SessionView): string {
  return formatTimeRange(session.startsAt, session.endsAt).split(" – ")[0];
}

export type SendResult = { to: string; id?: string; error?: string };

export async function sendReminderBatch(
  inputs: ReminderEmailInput[],
  opts: { from: string; replyTo?: string },
): Promise<SendResult[]> {
  const resend = getResend();
  const messages = inputs.map((input) => {
    const { subject, html, text } = renderReminder(input);
    return {
      from: opts.from,
      to: input.to,
      replyTo: opts.replyTo,
      subject,
      html,
      text,
    };
  });

  if (!resend) {
    console.warn(
      `⚠️  RESEND_API_KEY nicht gesetzt – E-Mails werden NICHT verschickt, nur geloggt (${messages.length} Empfänger).`,
    );
    for (const m of messages) console.log(`[DEV EMAIL] an ${m.to}: ${m.subject}`);
    return messages.map((m) => ({ to: m.to as string }));
  }

  const { data, error } = await resend.batch.send(messages);
  if (error) {
    return messages.map((m) => ({ to: m.to as string, error: error.message }));
  }
  return (data?.data ?? []).map((d, i) => ({ to: messages[i].to as string, id: d.id }));
}
