import { test } from "node:test";
import assert from "node:assert/strict";
import { sameDayCancellationMails, type Cancellation } from "./same-day-cancellation";
import { renderCancellationNotice } from "./email";
import { assignment, makeSession } from "./test-fixtures";

const morning = new Date("2026-11-03T08:00:00Z");

// 03.11: Platz 1 (starters 1–4, Ersatz 5, Trainer 20) and Platz 2 (starters 11–14, Ersatz 15).
// 10.11: Platz 1 with starters 6–9 and Ersatz 10 — that puts 6–10 on the rotation, free on the 3rd.
const platz2 = makeSession({
  id: 2,
  courtSlug: "frankenbach",
  hallName: "Sportivo",
  starters: [assignment(11), assignment(12), assignment(13), assignment(14)],
  ersatz: assignment(15, "offen", "ersatz"),
});
const nextWeek = makeSession({
  id: 3,
  sessionDate: "2026-11-10",
  startsAt: new Date("2026-11-10T19:30:00Z"),
  endsAt: new Date("2026-11-10T21:00:00Z"),
  starters: [assignment(6), assignment(7), assignment(8), assignment(9)],
  ersatz: assignment(10, "offen", "ersatz"),
});
const trainer = assignment(20, "ja", "trainer");

function mails(platz1: ReturnType<typeof makeSession>, cancelled: Cancellation, now = morning) {
  const { freePlayers, court } = sameDayCancellationMails([platz1, platz2, nextWeek], platz1, cancelled, now);
  return { freePlayers: freePlayers.sort((a, b) => a - b), court: court.sort((a, b) => a - b) };
}

const starterCancelled = makeSession({
  starters: [assignment(1, "nein"), assignment(2, "ja"), assignment(3), assignment(4)],
  trainer,
});

test("a starter cancelling on the day: free players are asked, the rest of the court is told", () => {
  assert.deepEqual(mails(starterCancelled, { playerId: 1, role: "starter", previous: "ja" }), {
    freePlayers: [6, 7, 8, 9, 10, 15],
    court: [2, 3, 4, 20],
  });
});

test("a cancellation before the day sends nothing — the morning email covers it", () => {
  const dayBefore = new Date("2026-11-02T21:00:00Z");
  assert.deepEqual(mails(starterCancelled, { playerId: 1, role: "starter", previous: null }, dayBefore), {
    freePlayers: [],
    court: [],
  });
  // 23:30 UTC the evening before is already the 3rd in Berlin.
  const afterMidnight = new Date("2026-11-02T23:30:00Z");
  assert.equal(mails(starterCancelled, { playerId: 1, role: "starter", previous: null }, afterMidnight).court.length, 4);
});

test("nothing once the session is over, or when a no is only repeated", () => {
  const over = new Date("2026-11-03T21:00:00Z");
  assert.deepEqual(mails(starterCancelled, { playerId: 1, role: "starter", previous: "ja" }, over).court, []);
  assert.deepEqual(mails(starterCancelled, { playerId: 1, role: "starter", previous: "nein" }), { freePlayers: [], court: [] });
});

test("a playing Ersatz taking back their yes frees the place again", () => {
  // Uli's case: the Ersatz had said yes for a cancelled starter, then cancelled after the morning email.
  const session = makeSession({
    starters: [assignment(1, "nein"), assignment(2, "nein"), assignment(3, "ja"), assignment(4, "ja")],
    einspringer: [assignment(9, "ja", "einspringer")],
    ersatz: assignment(5, "nein", "ersatz"),
    trainer,
  });
  assert.deepEqual(mails(session, { playerId: 5, role: "ersatz", previous: "ja" }), {
    freePlayers: [6, 7, 8, 10, 15],
    court: [3, 4, 9, 20],
  });
});

test("an Ersatz who was only standing by, or never said yes, cancels without any email", () => {
  const standingBy = makeSession({ ersatz: assignment(5, "nein", "ersatz"), trainer });
  assert.deepEqual(mails(standingBy, { playerId: 5, role: "ersatz", previous: "ja" }), { freePlayers: [], court: [] });
  const neverYes = makeSession({ starters: starterCancelled.starters, ersatz: assignment(5, "nein", "ersatz") });
  assert.deepEqual(mails(neverYes, { playerId: 5, role: "ersatz", previous: null }), { freePlayers: [], court: [] });
});

test("someone who jumped in and hands the place back isn't asked to take it again", () => {
  // Player 6 has already left the session by the time the emails are planned.
  const result = mails(starterCancelled, { playerId: 6, role: "einspringer", previous: "ja" });
  assert.deepEqual(result.freePlayers, [7, 8, 9, 10, 15]);
  assert.deepEqual(result.court, [2, 3, 4, 20]);
});

test("the coach cancelling is news for the court, but frees no place", () => {
  const session = makeSession({ trainer: assignment(20, "nein", "trainer") });
  assert.deepEqual(mails(session, { playerId: 20, role: "trainer", previous: "ja" }), { freePlayers: [], court: [1, 2, 3, 4] });
});

test("an Ersatz on standby who now plays gets the Ersatz email instead of the notice", () => {
  const session = makeSession({ starters: starterCancelled.starters, ersatz: assignment(5, "ja", "ersatz") });
  const result = mails(session, { playerId: 1, role: "starter", previous: null });
  assert.deepEqual(result, { freePlayers: [], court: [2, 3, 4] });
});

test("an Ersatz who was already playing hears about a further cancellation", () => {
  const session = makeSession({
    starters: [assignment(1, "nein"), assignment(2, "nein"), assignment(3), assignment(4)],
    ersatz: assignment(5, "ja", "ersatz"),
  });
  assert.deepEqual(mails(session, { playerId: 2, role: "starter", previous: null }).court, [3, 4, 5]);
});

function notice(session: ReturnType<typeof makeSession>, coachCancelled = false) {
  return renderCancellationNotice({
    kind: "absage",
    to: "p2@example.com",
    playerName: "P2",
    session,
    coachCancelled,
    token: "tok2",
    baseUrl: "https://example.com",
  });
}

test("the notice says a place is free and who is still coming, without naming who cancelled", () => {
  const { subject, html, text } = notice(starterCancelled);
  assert.match(subject, /^Heute .* Happy Match: 1 Platz frei$/);
  assert.match(text, /Für heute Abend ist ein Platz frei geworden/);
  assert.match(text, /Noch dabei: P2, P3, P4/);
  assert.doesNotMatch(text + html + subject, /P1|abgesagt/);
  assert.doesNotMatch(html, /antwort=/);
});

test("the notice names the Ersatz who steps in, and says when the coach is missing", () => {
  const covered = makeSession({ starters: starterCancelled.starters, ersatz: assignment(5, "ja", "ersatz") });
  assert.match(notice(covered).text, /P5 springt als Ersatz ein/);
  const noCoach = notice(makeSession({ trainer: assignment(20, "nein", "trainer") }), true);
  assert.match(noCoach.subject, /ohne Trainer$/);
  assert.match(noCoach.text, /Heute Abend ist das Training ohne Trainer\./);
  assert.doesNotMatch(noCoach.text, /Platz frei|vollständig|P20/);
});
