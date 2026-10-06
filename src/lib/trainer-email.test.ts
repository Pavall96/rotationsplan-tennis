import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTrainerEmail, trainerStand, type TrainerEmailInput } from "./trainer-email";
import { trainerUpdateDue } from "./trainer-update";
import { assignment, makeSession } from "./test-fixtures";

const trainer = assignment(20, "offen", "trainer");

/** Two starters said yes, two cancelled, P6 jumped in, the Ersatz hasn't answered: one place is still free. */
function shortSession() {
  return makeSession({
    starters: [assignment(1, "ja"), assignment(2, "ja"), assignment(3, "nein"), assignment(4, "nein")],
    einspringer: [assignment(6, "ja", "einspringer")],
    trainer,
  });
}

function render(overrides: Partial<TrainerEmailInput>) {
  return renderTrainerEmail({
    to: "coach@example.com",
    playerName: "Coach",
    confirmed: false,
    lauf: "morgen",
    session: shortSession(),
    token: "tok20",
    baseUrl: "https://example.com",
    ...overrides,
  });
}

test("the stand counts who jumped in and leaves out an Ersatz who isn't playing", () => {
  const stand = trainerStand(shortSession());
  assert.equal(stand.places, 4);
  assert.deepEqual(stand.zugesagt.map((a) => a.displayName), ["P1", "P2", "P6"]);
  assert.deepEqual(stand.abgesagt.map((a) => a.displayName), ["P3", "P4"]);
  assert.deepEqual(stand.offen, []);
  assert.equal(stand.frei, 1);
});

test("a trainer who hasn't answered gets the stand of the group and is asked", () => {
  const { subject, html, text } = render({});
  assert.match(subject, /^Training heute 20:30 Happy Match – bist du dabei\?$/);
  assert.match(html, /antwort=ja/);
  assert.match(html, /antwort=nein/);
  assert.match(text, /3 von 4 Spielern haben zugesagt/);
  assert.match(text, /Zugesagt: P1, P2, P6 \(springt ein\)/);
  assert.match(text, /Abgesagt: P3, P4/);
  assert.match(text, /1 Platz ist noch frei/);
  assert.doesNotMatch(text, /Noch keine Antwort/);
  assert.match(text, /Happy Match · Platz 1/);
  assert.doesNotMatch(html, /mit Trainer/);
});

test("the Ersatz stays unnamed until they really play", () => {
  const { html, text } = render({});
  assert.doesNotMatch(html, /P5/);
  assert.doesNotMatch(text, /P5/);
});

test("a trainer who already said yes isn't asked again, but can still cancel", () => {
  const { subject, html } = render({ confirmed: true });
  assert.match(subject, /^Training heute 20:30 Happy Match – 3 von 4 Spielern dabei$/);
  assert.doesNotMatch(html, /antwort=ja/);
  assert.match(html, /Doch nicht dabei\? Hier absagen/);
});

test("an Ersatz filling a cancelled place counts as playing", () => {
  const session = makeSession({
    starters: [assignment(1, "nein"), assignment(2, "ja"), assignment(3, "ja"), assignment(4, "ja")],
    ersatz: assignment(5, "ja", "ersatz"),
    trainer,
  });
  const { text } = render({ session });
  assert.match(text, /Alle 4 Spieler haben zugesagt/);
  assert.match(text, /Zugesagt: P2, P3, P4, P5 \(Ersatz\)/);
  assert.doesNotMatch(text, /noch frei/);
});

test("players who haven't answered are listed on their own line", () => {
  const { text } = render({ session: makeSession({ trainer }) });
  assert.match(text, /Noch hat niemand zugesagt/);
  assert.match(text, /Noch keine Antwort: P1, P2, P3, P4/);
  assert.doesNotMatch(text, /Zugesagt:/);
});

test("the session note is passed on", () => {
  const { html, text } = render({ session: makeSession({ trainer, note: "Saisonstart" }) });
  assert.match(text, /Hinweis: Saisonstart/);
  assert.match(html, /Hinweis: Saisonstart/);
});

test("the afternoon email says how few have said yes so far", () => {
  const session = makeSession({
    starters: [assignment(1, "ja"), assignment(2, "ja"), assignment(3), assignment(4)],
    trainer,
  });
  const { subject, html, text } = render({ session, lauf: "nachmittag", confirmed: true });
  assert.match(subject, /^Heute 20:30 Happy Match – bislang nur 2 von 4 Zusagen$/);
  assert.match(text, /Bislang haben nur 2 von 4 Spielern zugesagt/);
  assert.match(text, /Noch keine Antwort: P3, P4/);
  assert.doesNotMatch(html, /antwort=ja/);
});

test("the afternoon email asks again when the trainer still hasn't answered", () => {
  const { html } = render({ lauf: "nachmittag" });
  assert.match(html, /antwort=ja/);
  assert.match(html, /antwort=nein/);
});

test("the afternoon email is due only while the round is short of confirmed players", () => {
  const before = new Date("2026-11-03T15:00:00Z");
  assert.equal(trainerUpdateDue(shortSession(), before), true);
  assert.equal(trainerUpdateDue(makeSession({ trainer }), before), true);

  const full = makeSession({
    starters: [assignment(1, "ja"), assignment(2, "ja"), assignment(3, "ja"), assignment(4, "ja")],
    trainer,
  });
  assert.equal(trainerUpdateDue(full, before), false);
});

test("no afternoon email without a trainer, after a trainer's no, or once the session started", () => {
  const before = new Date("2026-11-03T15:00:00Z");
  assert.equal(trainerUpdateDue(makeSession(), before), false);
  assert.equal(trainerUpdateDue(makeSession({ trainer: assignment(20, "nein", "trainer") }), before), false);
  assert.equal(trainerUpdateDue(shortSession(), new Date("2026-11-03T19:30:00Z")), false);
});
