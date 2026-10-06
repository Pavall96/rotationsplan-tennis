import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOpenSlot } from "./email";
import { assignment, makeSession } from "./test-fixtures";

test("the Platz-frei email says a place is free without naming who cancelled, and links to the jump-in page", () => {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const { subject, html, text } = renderOpenSlot({
    kind: "platz-frei",
    to: "p6@example.com",
    playerName: "P6",
    session,
    token: "tok6",
    baseUrl: "https://example.com",
  });
  assert.match(subject, /1 Platz frei – springst du ein\?$/);
  assert.match(text, /Heute Abend ist ein Platz frei\. Wer zuerst zusagt, spielt\./);
  assert.doesNotMatch(text + html, /P1|abgesagt/);
  assert.match(text, /https:\/\/example\.com\/spieler\/tok6\/antwort\?termin=1&antwort=ja/);
  assert.match(html, /Ja, ich springe ein/);
  assert.doesNotMatch(html, /antwort=nein/);
});

test("the Platz-frei email counts two free places in the plural", () => {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2, "nein"), assignment(3), assignment(4)] });
  const { subject, text } = renderOpenSlot({
    kind: "platz-frei",
    to: "p6@example.com",
    playerName: "P6",
    session,
    token: "tok6",
    baseUrl: "https://example.com",
  });
  assert.match(subject, /2 Plätze frei/);
  assert.match(text, /Heute Abend sind 2 Plätze frei\./);
});
