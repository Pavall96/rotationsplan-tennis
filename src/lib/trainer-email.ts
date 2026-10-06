import type { SessionAssignmentView, SessionView } from "@/lib/queries";
import { answerButtons, escapeHtml, formatTimeRangeStart, renderShell, strongLine } from "@/lib/email";
import { formatDate, formatTimeRange, mapsUrl } from "@/lib/format";
import { openSlots, playingErsatz } from "@/lib/vacancy";

/** How the group stands for the coach: who is coming, who hasn't answered, who cancelled. */
export type TrainerStand = {
  /** Places on court, i.e. how many players the session is planned for. */
  places: number;
  /** Starters who said yes, who jumped in, and the Ersatz once they really play. */
  zugesagt: SessionAssignmentView[];
  offen: SessionAssignmentView[];
  abgesagt: SessionAssignmentView[];
  /** Cancelled places nobody has taken yet. */
  frei: number;
};

export function trainerStand(session: SessionView): TrainerStand {
  const ersatz = playingErsatz(session);
  return {
    places: session.starters.length,
    zugesagt: [
      ...session.starters.filter((a) => a.rsvpStatus === "ja"),
      ...session.einspringer,
      ...(ersatz ? [ersatz] : []),
    ],
    offen: session.starters.filter((a) => a.rsvpStatus === "offen"),
    abgesagt: session.starters.filter((a) => a.rsvpStatus === "nein"),
    frei: openSlots(session),
  };
}

export type TrainerEmailInput = {
  to: string;
  playerName: string;
  /** The trainer already said yes: then there's nothing to ask. */
  confirmed: boolean;
  /** "morgen": the daily email. "nachmittag": the follow-up while the round is still short of confirmed players. */
  lauf: "morgen" | "nachmittag";
  session: SessionView;
  token: string;
  baseUrl: string;
};

/** "Anna (LK 20,1, springt ein)": the level tells the coach what kind of group to expect. */
function nameWithLk(a: SessionAssignmentView): string {
  const details = [
    a.lk ? `LK ${a.lk.replace(".", ",")}` : "",
    a.role === "einspringer" ? "springt ein" : a.role === "ersatz" ? "Ersatz" : "",
  ].filter(Boolean);
  return details.length ? `${a.displayName} (${details.join(", ")})` : a.displayName;
}

function headline(stand: TrainerStand, lauf: TrainerEmailInput["lauf"]): string {
  const yes = stand.zugesagt.length;
  if (yes >= stand.places) return `Alle ${stand.places} Spieler haben zugesagt.`;
  if (lauf === "nachmittag") {
    if (yes === 0) return "Bislang hat noch niemand zugesagt.";
    return `Bislang ${yes === 1 ? "hat" : "haben"} nur ${yes} von ${stand.places} Spielern zugesagt.`;
  }
  if (yes === 0) return "Noch hat niemand zugesagt.";
  return `${yes} von ${stand.places} Spielern ${yes === 1 ? "hat" : "haben"} zugesagt.`;
}

/** The coach's email: instead of the players' "bist du dabei?", it tells them how their group stands. */
export function renderTrainerEmail(input: TrainerEmailInput): { subject: string; html: string; text: string } {
  const { playerName, confirmed, lauf, session, token, baseUrl } = input;
  const stand = trainerStand(session);
  const start = formatTimeRangeStart(session);
  const yes = stand.zugesagt.length;

  const subject =
    lauf === "nachmittag"
      ? `Heute ${start} ${session.hallName} – bislang nur ${yes} von ${stand.places} Zusagen`
      : confirmed
        ? `Training heute ${start} ${session.hallName} – ${yes} von ${stand.places} Spielern dabei`
        : `Training heute ${start} ${session.hallName} – bist du dabei?`;

  const title = headline(stand, lauf);
  const groups = [
    { label: "Zugesagt", names: stand.zugesagt.map(nameWithLk) },
    { label: "Noch keine Antwort", names: stand.offen.map(nameWithLk) },
    { label: "Abgesagt", names: stand.abgesagt.map((a) => a.displayName) },
  ].filter((g) => g.names.length > 0);
  const freeLine = stand.frei === 0 ? "" : stand.frei === 1 ? "1 Platz ist noch frei." : `${stand.frei} Plätze sind noch frei.`;
  const noteLine = session.note ? `Hinweis: ${session.note}` : "";
  const sessionLine = `${session.hallName} · ${session.courtLabel}`;

  const smallLine = (html: string) => `<p style="margin:8px 0 0;font-size:13px;color:#374151;">${html}</p>`;
  const cardBody = [
    noteLine ? `<p style="margin:0 0 10px;font-size:13px;color:#6b7280;">${escapeHtml(noteLine)}</p>` : "",
    strongLine(title),
    ...groups.map((g) => smallLine(`<span style="color:#6b7280;">${g.label}:</span> ${escapeHtml(g.names.join(", "))}`)),
    freeLine ? smallLine(escapeHtml(freeLine)) : "",
  ].join("");

  const cancel = {
    url: `${baseUrl}/spieler/${token}/antwort?termin=${session.id}&antwort=nein`,
    label: "Doch nicht dabei? Hier absagen",
  };
  const buttons = confirmed ? null : answerButtons(session, "trainer", token, baseUrl);
  const ask = confirmed ? "" : " Bitte stimm kurz ab, ob du dabei bist.";

  const html = renderShell({
    preheader: title,
    playerName,
    intro:
      lauf === "nachmittag"
        ? `Kurzer Zwischenstand vor dem Training heute Abend.${ask}`
        : `Heute ist Training – hier der aktuelle Stand deiner Gruppe.${ask}`,
    session,
    sessionLine,
    cardBody,
    buttons,
    textLink: confirmed ? cancel : undefined,
    note:
      lauf === "nachmittag"
        ? "Den aktuellen Stand siehst du jederzeit im ganzen Plan."
        : "Der Stand kann sich im Lauf des Tages noch ändern. Fehlen am Nachmittag noch Zusagen, bekommst du eine zweite Mail.",
    token,
    baseUrl,
  });

  const text = [
    `Hallo ${playerName},`,
    ``,
    lauf === "nachmittag" ? `kurzer Zwischenstand vor dem Training heute Abend:` : `heute ist Training, hier der aktuelle Stand deiner Gruppe:`,
    `${formatDate(session.startsAt)} · ${formatTimeRange(session.startsAt, session.endsAt)}`,
    sessionLine,
    noteLine,
    session.address ? `Route: ${mapsUrl(session.address)}` : ``,
    ``,
    title,
    ...groups.map((g) => `${g.label}: ${g.names.join(", ")}`),
    freeLine,
    ``,
    ...(buttons
      ? [`Bist du dabei? Bitte abstimmen:`, `Ja: ${buttons.yesUrl}`, `Nein: ${buttons.noUrl}`]
      : [`${cancel.label}: ${cancel.url}`]),
    ``,
    `Ganzer Plan: ${baseUrl}/`,
    `Dein persönlicher Link: ${baseUrl}/spieler/${token}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}
