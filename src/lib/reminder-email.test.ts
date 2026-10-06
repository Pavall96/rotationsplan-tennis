import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReminder, type ReminderEmailInput } from "./email";
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
  assert.match(text, /P1 hat abgesagt/);
  assert.match(text, /Mit dabei: P2, P3, P4, P5/);
});

test("a starter who cancelled isn't listed as playing, in neither version of the email", () => {
  const session = makeSession({ starters: [assignment(1), assignment(2, "nein"), assignment(3), assignment(4)] });
  for (const confirmed of [false, true]) {
    const { html, text } = render({ session, confirmed });
    assert.match(text, /Mit dabei: P1, P3, P4/);
    assert.doesNotMatch(html, />P2</);
  }
});
