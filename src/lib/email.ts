import { Resend } from "resend";
import type { SessionView } from "@/lib/queries";
import { formatTimeRange, formatDate, mapsUrl, rsvpLabels } from "@/lib/format";
import { cancelledStarters, ersatzNeeded, lineup, openSlots } from "@/lib/vacancy";

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
  /** Already said yes (or jumped in): then there's nothing to ask, the email only tells them about tonight. */
  confirmed: boolean;
  session: SessionView;
  token: string;
  baseUrl: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A "nein" button is optional: the Platz-frei email only offers to jump in. */
type Buttons = { yesUrl: string; ja: string; noUrl?: string; nein?: string };

/** Header, greeting, session card, optional Ja/Nein buttons and footer — shared by every email we send. */
function renderShell(opts: {
  preheader: string;
  playerName: string;
  intro: string;
  session: SessionView;
  cardBody: string;
  buttons: Buttons | null;
  /** A small text link in place of the buttons, e.g. to cancel after having said yes. */
  textLink?: { url: string; label: string };
  note: string;
  token: string;
  baseUrl: string;
}): string {
  const { session, buttons, textLink, baseUrl, token } = opts;
  const withCoach = session.withCoach ? "mit Trainer" : "ohne Trainer";
  const routeLine = session.address
    ? `<p style="margin:10px 0 0;"><a href="${mapsUrl(session.address)}" style="color:#11324e;font-size:13px;">Route öffnen →</a></p>`
    : "";
  const yesButton = (b: Buttons) =>
    `<a href="${b.yesUrl}" style="display:block;text-align:center;background:#0e3b2e;color:#fff;text-decoration:none;padding:13px 0;border-radius:6px;font-weight:600;font-size:14px;">${b.ja}</a>`;
  const buttonRow = !buttons
    ? textLink
      ? `
      <p style="margin:0 0 20px;font-size:13px;"><a href="${textLink.url}" style="color:#b42318;">${escapeHtml(textLink.label)}</a></p>`
      : ""
    : buttons.noUrl && buttons.nein
      ? `
      <table role="presentation" width="100%" style="margin-bottom:20px;">
        <tr>
          <td style="padding-right:6px;width:50%;">
            ${yesButton(buttons)}
          </td>
          <td style="padding-left:6px;width:50%;">
            <a href="${buttons.noUrl}" style="display:block;text-align:center;background:#ffffff;color:#b42318;border:1.5px solid #b42318;text-decoration:none;padding:11.5px 0;border-radius:6px;font-weight:600;font-size:14px;">${buttons.nein}</a>
          </td>
        </tr>
      </table>`
      : `
      <div style="margin-bottom:20px;">${yesButton(buttons)}</div>`;

  return `
  <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:8px;overflow:hidden;">
    <p style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.preheader)}</p>

    <table role="presentation" width="100%" style="background:#11324e;">
      <tr>
        <td style="padding:18px 32px;" valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;"><img src="${baseUrl}/logo.png" width="36" height="36" alt="TC Sonnenbrunnen" style="display:block;border-radius:50%;"></td>
            <td style="color:#ffffff;font-weight:700;font-size:15px;letter-spacing:0.02em;">TC SONNENBRUNNEN</td>
          </tr></table>
        </td>
        <td style="padding:18px 32px;color:#a9c9bb;font-size:12px;text-align:right;" valign="middle">Wintertraining 2026/27</td>
      </tr>
    </table>

    <div style="padding:32px;">
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Hallo ${escapeHtml(opts.playerName)}!</p>
      <p style="margin:0 0 24px;font-size:15px;color:#4b5563;">${escapeHtml(opts.intro)}</p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
        <table role="presentation" width="100%">
          <tr>
            <td style="font-size:16px;font-weight:700;color:#111827;">${formatDate(session.startsAt)}</td>
            <td style="font-size:13px;color:#6b7280;text-align:right;">${formatTimeRange(session.startsAt, session.endsAt)}</td>
          </tr>
        </table>
        <p style="margin:6px 0 12px;font-size:13px;color:#6b7280;">${escapeHtml(session.hallName)} · ${withCoach}</p>
        ${opts.cardBody}
        ${routeLine}
      </div>
${buttonRow}
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">${escapeHtml(opts.note)}</p>
    </div>

    <div style="background:#fafaf9;border-top:1px solid #f0f0ef;padding:20px 32px;">
      <p style="margin:0 0 4px;font-size:12px;"><a href="${baseUrl}/" style="color:#6b7280;">Ganzer Plan</a></p>
      <p style="margin:0 0 4px;font-size:12px;"><a href="${baseUrl}/spieler/${token}" style="color:#6b7280;">Dein persönlicher Link</a></p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">Diesen Link nicht weitergeben.</p>
    </div>
  </div>`;
}

function strongLine(text: string): string {
  return `<p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(text)}</p>`;
}

function namePills(players: SessionView["starters"]): string {
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;">${players
    .map(
      (a) =>
        `<span style="background:#f3f4f2;color:#374151;font-size:12px;padding:4px 10px;border-radius:999px;">${escapeHtml(a.displayName)}</span>`,
    )
    .join("")}</div>`;
}

/** Links open a confirmation page rather than saving directly: mail scanners prefetch every link in a message. */
function answerButtons(
  session: SessionView,
  role: "starter" | "ersatz" | "trainer",
  token: string,
  baseUrl: string,
): Buttons {
  const answerUrl = `${baseUrl}/spieler/${token}/antwort?termin=${session.id}&antwort=`;
  return { yesUrl: `${answerUrl}ja`, noUrl: `${answerUrl}nein`, ...rsvpLabels(role, ersatzNeeded(session)) };
}

export function renderReminder(input: ReminderEmailInput): { subject: string; html: string; text: string } {
  if (input.confirmed) return renderConfirmedReminder(input);
  const { playerName, role, session, token, baseUrl } = input;
  const withCoach = session.withCoach ? "mit Trainer" : "ohne Trainer";
  const players = lineup(session);
  const others = players.map((a) => a.displayName).join(", ");
  const time = formatTimeRange(session.startsAt, session.endsAt);
  const date = formatDate(session.startsAt);
  const needed = role === "ersatz" && ersatzNeeded(session);

  const subject =
    role === "ersatz"
      ? needed
        ? `Ersatz heute ${formatTimeRangeStart(session)} ${session.hallName} – du wirst gebraucht!`
        : `Ersatz heute ${formatTimeRangeStart(session)} ${session.hallName} – hältst du dich bereit?`
      : role === "trainer"
        ? `Training heute ${formatTimeRangeStart(session)} ${session.hallName} – bist du dabei?`
        : `Heute ${formatTimeRangeStart(session)} ${session.hallName} – bist du dabei?`;

  const buttons = answerButtons(session, role, token, baseUrl);
  const roleLine =
    role === "ersatz"
      ? needed
        ? `Du bist heute als Ersatz eingetragen – ${cancelledStarters(session)} abgesagt, du wirst gebraucht.`
        : `Du bist heute als Ersatz eingetragen.`
      : role === "trainer"
        ? `Du bist heute als Trainer eingeteilt.`
        : null;

  const cardBody = roleLine ? strongLine(roleLine) : namePills(players);

  const html = renderShell({
    preheader: "Bitte kurz abstimmen: Ja oder Nein.",
    playerName,
    intro: "Heute ist Wintertraining – bitte kurz abstimmen.",
    session,
    cardBody,
    buttons,
    note: "Deine Antwort sehen alle im gemeinsamen Plan – so weiß die Runde früh genug, ob jemand fehlt.",
    token,
    baseUrl,
  });

  const text = [
    `Hallo ${playerName},`,
    ``,
    `heute ist Wintertraining:`,
    `${date} · ${time}`,
    `Halle: ${session.hallName} (${withCoach})`,
    roleLine ?? `Mit dabei: ${others}`,
    session.address ? `Route: ${mapsUrl(session.address)}` : ``,
    ``,
    `Bist du heute dabei? Bitte abstimmen:`,
    `Ja: ${buttons.yesUrl}`,
    `Nein: ${buttons.noUrl}`,
    ``,
    `Ganzer Plan: ${baseUrl}/`,
    `Dein persönlicher Link: ${baseUrl}/spieler/${token}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

/** The morning email for someone who already said yes: no question, just tonight's details and a way out. */
function renderConfirmedReminder(input: ReminderEmailInput): { subject: string; html: string; text: string } {
  const { playerName, role, session, token, baseUrl } = input;
  const start = formatTimeRangeStart(session);
  const standingBy = role === "ersatz" && !ersatzNeeded(session);
  const players = lineup(session);

  const subject =
    role === "ersatz"
      ? standingBy
        ? `Ersatz heute ${start} ${session.hallName} – danke, dass du dich bereithältst`
        : `Heute ${start} ${session.hallName} – du springst ein, bis heute Abend!`
      : role === "trainer"
        ? `Training heute ${start} ${session.hallName} – bis heute Abend!`
        : `Heute ${start} ${session.hallName} – bis heute Abend!`;
  const roleLine =
    role === "ersatz"
      ? standingBy
        ? "Du hältst dich heute als Ersatz bereit. Sagt jemand ab, bekommst du sofort eine Mail."
        : `Du springst heute als Ersatz ein – ${cancelledStarters(session)} abgesagt.`
      : role === "trainer"
        ? "Du bist heute als Trainer eingeteilt."
        : null;
  // Who's on court tonight matters to anyone playing; the Ersatz on standby and the coach just get their role.
  const cardBody =
    standingBy || role === "trainer"
      ? strongLine(roleLine!)
      : (roleLine ? `<div style="margin-bottom:10px;">${strongLine(roleLine)}</div>` : "") + namePills(players);
  const cancel = {
    url: `${baseUrl}/spieler/${token}/antwort?termin=${session.id}&antwort=nein`,
    label: standingBy ? "Kannst du doch nicht? Hier absagen" : "Doch nicht dabei? Hier absagen",
  };

  const html = renderShell({
    preheader: standingBy ? "Danke, dass du dich bereithältst." : "Du hast zugesagt – bis heute Abend!",
    playerName,
    intro: standingBy ? "Heute ist Wintertraining – du bist als Ersatz bereit." : "Heute ist Wintertraining – du hast zugesagt.",
    session,
    cardBody,
    buttons: null,
    textLink: cancel,
    note: "Falls sich etwas ändert, sag bitte so früh wie möglich ab – dann kann jemand anderes einspringen.",
    token,
    baseUrl,
  });

  const text = [
    `Hallo ${playerName},`,
    ``,
    standingBy ? `heute ist Wintertraining, du bist als Ersatz bereit:` : `heute ist Wintertraining, du hast zugesagt:`,
    `${formatDate(session.startsAt)} · ${formatTimeRange(session.startsAt, session.endsAt)}`,
    `Halle: ${session.hallName} (${session.withCoach ? "mit Trainer" : "ohne Trainer"})`,
    roleLine ?? ``,
    standingBy || role === "trainer" ? `` : `Mit dabei: ${players.map((a) => a.displayName).join(", ")}`,
    session.address ? `Route: ${mapsUrl(session.address)}` : ``,
    ``,
    `${cancel.label}: ${cancel.url}`,
    ``,
    `Ganzer Plan: ${baseUrl}/`,
    `Dein persönlicher Link: ${baseUrl}/spieler/${token}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

export type ErsatzAlertInput = {
  to: string;
  playerName: string;
  session: SessionView;
  token: string;
  baseUrl: string;
  /**
   * "gebraucht": a starter just cancelled. "entwarnung": the cancellation was taken back.
   * "uebernommen": someone else jumped in and took the last free place. Both of the latter mean nobody is missing.
   */
  kind: "gebraucht" | "entwarnung" | "uebernommen";
  /** The starter whose answer triggered this email. */
  changedBy: string;
};

export function renderErsatzAlert(input: ErsatzAlertInput): { subject: string; html: string; text: string } {
  const { playerName, session, token, baseUrl, kind, changedBy } = input;
  const date = formatDate(session.startsAt);
  const shortDate = date.replace(/\d{4}$/, "");
  const time = formatTimeRange(session.startsAt, session.endsAt);
  const personalUrl = `${baseUrl}/spieler/${token}`;

  if (kind === "entwarnung" || kind === "uebernommen") {
    const subject = `Entwarnung für ${shortDate} – du wirst doch nicht gebraucht`;
    const line =
      kind === "entwarnung"
        ? `${changedBy} kommt doch – am ${date} fehlt niemand mehr. Du musst nicht einspringen.`
        : `${changedBy} springt ein – am ${date} fehlt niemand mehr. Du musst nicht einspringen.`;
    const html = renderShell({
      preheader: line,
      playerName,
      intro: "Kurze Entwarnung zu deinem Ersatz-Termin.",
      session,
      cardBody: strongLine(line),
      buttons: null,
      note: "Du bleibst für diesen Termin als Ersatz eingetragen. Falls wieder jemand absagt, melden wir uns.",
      token,
      baseUrl,
    });
    const text = [`Hallo ${playerName},`, ``, line, `${date} · ${time} · ${session.hallName}`, ``, `Ganzer Plan: ${baseUrl}/`, `Dein persönlicher Link: ${personalUrl}`].join("\n");
    return { subject, html, text };
  }

  const buttons = answerButtons(session, "ersatz", token, baseUrl);
  const subject = `Ersatz gesucht: ${shortDate} ${formatTimeRangeStart(session)} ${session.hallName} – kannst du einspringen?`;
  const line = `${changedBy} hat abgesagt. Du bist als Ersatz eingetragen – kannst du einspringen?`;
  const html = renderShell({
    preheader: line,
    playerName,
    intro: "Für einen deiner Ersatz-Termine hat jemand abgesagt.",
    session,
    cardBody: strongLine(line),
    buttons,
    note: "Bitte antworte kurz – deine Antwort sehen alle im gemeinsamen Plan, so weiß die Runde, ob sie vollständig ist.",
    token,
    baseUrl,
  });
  const text = [
    `Hallo ${playerName},`,
    ``,
    line,
    `${date} · ${time}`,
    `Halle: ${session.hallName}`,
    session.address ? `Route: ${mapsUrl(session.address)}` : ``,
    ``,
    `${buttons.ja}: ${buttons.yesUrl}`,
    `${buttons.nein}: ${buttons.noUrl}`,
    ``,
    `Ganzer Plan: ${baseUrl}/`,
    `Dein persönlicher Link: ${personalUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { subject, html, text };
}

export async function sendErsatzAlert(input: ErsatzAlertInput, opts: { from: string; replyTo?: string }): Promise<SendResult> {
  const { subject, html, text } = renderErsatzAlert(input);
  const resend = getResend();
  if (!resend) {
    console.warn(`⚠️  RESEND_API_KEY nicht gesetzt – E-Mail wird NICHT verschickt.`);
    console.log(`[DEV EMAIL] an ${input.to}: ${subject}`);
    return { to: input.to };
  }
  const { data, error } = await resend.emails.send({ from: opts.from, to: input.to, replyTo: opts.replyTo, subject, html, text });
  return error ? { to: input.to, error: error.message } : { to: input.to, id: data?.id };
}

export type OpenSlotEmailInput = {
  kind: "platz-frei";
  to: string;
  playerName: string;
  session: SessionView;
  token: string;
  baseUrl: string;
};

/** Match-day email to every rotation player who is free: a starter cancelled and the place is still open. */
export function renderOpenSlot(input: OpenSlotEmailInput): { subject: string; html: string; text: string } {
  const { playerName, session, token, baseUrl } = input;
  const open = openSlots(session);
  const places = open === 1 ? "1 Platz frei" : `${open} Plätze frei`;
  const subject = `Heute ${formatTimeRangeStart(session)} ${session.hallName}: ${places} – springst du ein?`;
  const line = `${cancelledStarters(session)} abgesagt – heute Abend ist ${open === 1 ? "ein Platz" : `${open} Plätze`} frei. Wer zuerst zusagt, spielt.`;
  const yesUrl = `${baseUrl}/spieler/${token}/antwort?termin=${session.id}&antwort=ja`;
  const html = renderShell({
    preheader: line,
    playerName,
    intro: "Für heute Abend wird noch jemand gesucht.",
    session,
    cardBody: strongLine(line),
    buttons: { yesUrl, ja: "Ja, ich springe ein" },
    note: "Du bekommst diese Mail, weil du im Rotationsplan stehst und heute Abend frei bist. Ist der Platz schon vergeben, siehst du das nach dem Klick.",
    token,
    baseUrl,
  });
  const text = [
    `Hallo ${playerName},`,
    ``,
    line,
    `${formatDate(session.startsAt)} · ${formatTimeRange(session.startsAt, session.endsAt)}`,
    `Halle: ${session.hallName}`,
    ``,
    `Ja, ich springe ein: ${yesUrl}`,
    ``,
    `Ganzer Plan: ${baseUrl}/`,
    `Dein persönlicher Link: ${baseUrl}/spieler/${token}`,
  ].join("\n");
  return { subject, html, text };
}

function formatTimeRangeStart(session: SessionView): string {
  return formatTimeRange(session.startsAt, session.endsAt).split(" – ")[0];
}

export type SendResult = { to: string; id?: string; error?: string };

export async function sendReminderBatch(
  inputs: (ReminderEmailInput | OpenSlotEmailInput)[],
  opts: { from: string; replyTo?: string },
): Promise<SendResult[]> {
  const resend = getResend();
  const messages = inputs.map((input) => {
    const { subject, html, text } = "kind" in input ? renderOpenSlot(input) : renderReminder(input);
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

export type NoticeEmailInput = {
  to: string;
  playerName: string;
  subject: string;
  /** Main message, e.g. "Hakan fährt bei dir mit." */
  line: string;
  /** Short context under the message, e.g. "Sa., 19.12. · Herren I bei TC RW Bad Mergentheim 1". */
  detail: string;
  cta: { url: string; label: string };
  token: string;
  baseUrl: string;
};

/** A short one-message email (used for Fahrgemeinschaft updates) in the same look as the reminders. */
export function renderNotice(input: NoticeEmailInput): { html: string; text: string } {
  const { baseUrl, token } = input;
  const html = `
  <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#ffffff;border-radius:8px;overflow:hidden;">
    <p style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.line)}</p>
    <table role="presentation" width="100%" style="background:#11324e;">
      <tr>
        <td style="padding:18px 32px;" valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;"><img src="${baseUrl}/logo.png" width="36" height="36" alt="TC Sonnenbrunnen" style="display:block;border-radius:50%;"></td>
            <td style="color:#ffffff;font-weight:700;font-size:15px;letter-spacing:0.02em;">TC SONNENBRUNNEN</td>
          </tr></table>
        </td>
        <td style="padding:18px 32px;color:#a9c9bb;font-size:12px;text-align:right;" valign="middle">Winterspiele 2026/27</td>
      </tr>
    </table>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">Hallo ${escapeHtml(input.playerName)}!</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(input.line)}</p>
        <p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(input.detail)}</p>
      </div>
      <a href="${input.cta.url}" style="display:block;text-align:center;background:#11324e;color:#fff;text-decoration:none;padding:13px 0;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(input.cta.label)}</a>
    </div>
    <div style="background:#fafaf9;border-top:1px solid #f0f0ef;padding:20px 32px;">
      <p style="margin:0 0 4px;font-size:12px;"><a href="${baseUrl}/spieler/${token}" style="color:#6b7280;">Dein persönlicher Link</a></p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">Diesen Link nicht weitergeben.</p>
    </div>
  </div>`;
  const text = [`Hallo ${input.playerName},`, ``, input.line, input.detail, ``, `${input.cta.label}: ${input.cta.url}`].join("\n");
  return { html, text };
}

export async function sendNotice(input: NoticeEmailInput, opts: { from: string; replyTo?: string }): Promise<SendResult> {
  const { html, text } = renderNotice(input);
  const resend = getResend();
  if (!resend) {
    console.log(`[DEV EMAIL] an ${input.to}: ${input.subject}`);
    return { to: input.to };
  }
  const { data, error } = await resend.emails.send({
    from: opts.from,
    to: input.to,
    replyTo: opts.replyTo,
    subject: input.subject,
    html,
    text,
  });
  return error ? { to: input.to, error: error.message } : { to: input.to, id: data?.id };
}
