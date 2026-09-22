import { Resend } from "resend";
import type { SessionView } from "@/lib/queries";
import { formatTimeRange, formatDate, mapsUrl } from "@/lib/format";

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
  role: "starter" | "ersatz" | "trainer";
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
      : role === "trainer"
        ? `Training heute ${formatTimeRangeStart(session)} ${session.hallName} – bist du dabei?`
        : `Heute ${formatTimeRangeStart(session)} ${session.hallName} – bist du dabei?`;

  const yesUrl = `${baseUrl}/spieler/${token}?termin=${session.id}&antwort=ja`;
  const noUrl = `${baseUrl}/spieler/${token}?termin=${session.id}&antwort=nein`;
  const overviewUrl = `${baseUrl}/`;
  const personalUrl = `${baseUrl}/spieler/${token}`;

  const roleBody =
    role === "ersatz"
      ? `<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Du bist heute als Ersatz eingetragen.</p>`
      : role === "trainer"
        ? `<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Du bist heute als Trainer eingeteilt.</p>`
        : `<div style="display:flex;flex-wrap:wrap;gap:6px;">${session.starters
            .map(
              (a) =>
                `<span style="background:#f3f4f2;color:#374151;font-size:12px;padding:4px 10px;border-radius:999px;">${a.displayName}</span>`,
            )
            .join("")}</div>`;

  const routeLine = session.address
    ? `<p style="margin:10px 0 0;"><a href="${mapsUrl(session.address)}" style="color:#0e3b2e;font-size:13px;">Route öffnen →</a></p>`
    : "";

  const html = `
  <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:8px;overflow:hidden;">
    <p style="display:none;max-height:0;overflow:hidden;">Bitte kurz abstimmen: Ja oder Nein.</p>

    <table role="presentation" width="100%" style="background:#0e3b2e;">
      <tr>
        <td style="padding:22px 32px;color:#ffffff;font-weight:700;font-size:15px;letter-spacing:0.02em;">ROTATIONSPLAN TENNIS</td>
        <td style="padding:22px 32px;color:#a9c9bb;font-size:12px;text-align:right;">Wintertraining 2026/27</td>
      </tr>
    </table>

    <div style="padding:32px;">
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Hallo ${playerName}!</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">Heute ist Wintertraining – bitte kurz abstimmen.</p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
        <table role="presentation" width="100%">
          <tr>
            <td style="font-size:16px;font-weight:700;color:#111827;">${date}</td>
            <td style="font-size:13px;color:#6b7280;text-align:right;">${time}</td>
          </tr>
        </table>
        <p style="margin:6px 0 12px;font-size:13px;color:#6b7280;">${session.hallName} · ${withCoach}</p>
        ${roleBody}
        ${routeLine}
      </div>

      <table role="presentation" width="100%" style="margin-bottom:20px;">
        <tr>
          <td style="padding-right:6px;width:50%;">
            <a href="${yesUrl}" style="display:block;text-align:center;background:#0e3b2e;color:#fff;text-decoration:none;padding:13px 0;border-radius:6px;font-weight:600;font-size:14px;">Ja, ich bin dabei</a>
          </td>
          <td style="padding-left:6px;width:50%;">
            <a href="${noUrl}" style="display:block;text-align:center;background:#ffffff;color:#b42318;border:1.5px solid #b42318;text-decoration:none;padding:11.5px 0;border-radius:6px;font-weight:600;font-size:14px;">Nein, ich kann nicht</a>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Deine Antwort sehen alle im gemeinsamen Plan – so weiß die Runde früh genug, ob jemand fehlt.</p>
    </div>

    <div style="background:#fafaf9;border-top:1px solid #f0f0ef;padding:20px 32px;">
      <p style="margin:0 0 4px;font-size:12px;"><a href="${overviewUrl}" style="color:#6b7280;">Ganzer Plan</a></p>
      <p style="margin:0 0 4px;font-size:12px;"><a href="${personalUrl}" style="color:#6b7280;">Dein persönlicher Link</a></p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">Diesen Link nicht weitergeben.</p>
    </div>
  </div>`;

  const text = [
    `Hallo ${playerName},`,
    ``,
    `heute ist Wintertraining:`,
    `${date} · ${time}`,
    `Halle: ${session.hallName} (${withCoach})`,
    role === "ersatz"
      ? `Du bist heute als Ersatz eingetragen.`
      : role === "trainer"
        ? `Du bist heute als Trainer eingeteilt.`
        : `Mit dabei: ${others}`,
    session.address ? `Route: ${mapsUrl(session.address)}` : ``,
    ``,
    `Bist du heute dabei? Bitte abstimmen:`,
    `Ja: ${yesUrl}`,
    `Nein: ${noUrl}`,
    ``,
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
