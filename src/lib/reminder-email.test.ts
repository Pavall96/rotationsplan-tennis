import { test } from "node:test";
import assert from "node:assert/strict";
import { renderErsatzAlert, renderReminder, type ReminderEmailInput } from "./email";
import { assignment, makeSession } from "./test-fixtures";

function render(overrides: Partial<ReminderEmailInput>) {
  return renderReminder({
    to: "p1@example.com",
    playerName: "P1",
    role: "starter",
    confirmed: false,
    session: makeSession(),
    token: "tok1",
    baseUrl: "https://example.com",
    ...overrides,
  });
}

test("a starter who hasn't answered is asked, with Ja and Nein buttons", () => {
  const { subject, html } = render({});
  assert.match(subject, /bist du dabei\?$/);
  assert.match(html, /antwort=ja/);
  assert.match(html, /antwort=nein/);
});

test("a starter who already said yes isn't asked again, but can still cancel", () => {
  const session = makeSession({ starters: [assignment(1, "ja"), assignment(2), assignment(3), assignment(4)] });
  const { subject, html, text } = render({ session, confirmed: true });
  assert.match(subject, /bis heute Abend!$/);
  assert.doesNotMatch(subject, /\?/);
  assert.doesNotMatch(html, /antwort=ja/);
  assert.match(html, /Doch nicht dabei\? Hier absagen/);
  assert.match(text, /https:\/\/example\.com\/spieler\/tok1\/antwort\?termin=1&antwort=nein/);
  assert.match(text, /Mit dabei: P1, P2, P3, P4/);
});

test("a confirmed Ersatz on standby is thanked, not told they play", () => {
  const session = makeSession({ ersatz: assignment(5, "ja", "ersatz") });
  const { subject, text } = render({ role: "ersatz", session, confirmed: true, playerName: "P5", token: "tok5" });
  assert.match(subject, /danke, dass du dich bereithältst$/);
  assert.match(text, /hältst dich heute als Ersatz bereit/);
  assert.doesNotMatch(text, /Mit dabei/);
});

test("a confirmed Ersatz filling a cancelled place hears they play and with whom", () => {
  const session = makeSession({
    starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)],
    ersatz: assignment(5, "ja", "ersatz"),
  });
  const { subject, text } = render({ role: "ersatz", session, confirmed: true, playerName: "P5", token: "tok5" });
  assert.match(subject, /du springst ein, bis heute Abend!$/);
  assert.match(text, /Du springst heute als Ersatz ein\./);
  assert.match(text, /Mit dabei: P2, P3, P4, P5/);
  assert.doesNotMatch(text, /P1|abgesagt/);
});

test("an Ersatz who is needed is asked without hearing who cancelled", () => {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const { subject, text, html } = render({ role: "ersatz", session, playerName: "P5", token: "tok5" });
  assert.match(subject, /du wirst gebraucht!$/);
  assert.match(text, /als Ersatz eingetragen und wirst gebraucht – ein Platz ist frei/);
  assert.doesNotMatch(text + html, /P1|abgesagt/);
});

function ersatzAlert(kind: "gebraucht" | "entwarnung" | "uebernommen", jumpedIn?: string) {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  return renderErsatzAlert({ to: "p5@example.com", playerName: "P5", session, token: "tok5", baseUrl: "https://example.com", kind, jumpedIn });
}

test("the Ersatz emails never say who cancelled, only who jumped in", () => {
  const gebraucht = ersatzAlert("gebraucht");
  assert.match(gebraucht.text, /Ein Platz ist frei geworden\. Du bist als Ersatz eingetragen – kannst du einspringen\?/);
  const entwarnung = ersatzAlert("entwarnung");
  assert.match(entwarnung.text, /Die Absage wurde zurückgenommen – am .* fehlt niemand mehr/);
  for (const mail of [gebraucht, entwarnung]) assert.doesNotMatch(mail.text + mail.html + mail.subject, /P1/);
  assert.match(ersatzAlert("uebernommen", "P6").text, /P6 springt ein – am .* fehlt niemand mehr/);
});
