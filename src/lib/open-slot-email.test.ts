import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOpenSlot } from "./email";
import { assignment, makeSession } from "./test-fixtures";

test("the Platz-frei email says what's free and when, without naming who cancelled, and links straight to the jump-in page", () => {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const { subject, html, text } = renderOpenSlot({
    kind: "platz-frei",
    to: "p6@example.com",
    playerName: "P6",
    session,
    token: "tok6",
    baseUrl: "https://example.com",
  });
  assert.match(subject, /^Platz frei heute 20:30 Uhr in Happy Match – kannst du einspringen\?$/);
  assert.match(text, /Es gibt einen Platz frei in Happy Match, um 20:30 Uhr\. Kannst du einspringen\?/);
  assert.doesNotMatch(text, /P1/);
  assert.match(text, /https:\/\/example\.com\/spieler\/tok6\/antwort\?termin=1&antwort=ja/);
  assert.match(html, /Ja, ich springe ein/);
  assert.doesNotMatch(html, /antwort=nein/);
});

test("two free places are counted in the Platz-frei email", () => {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2, "nein"), assignment(3), assignment(4)] });
  const { subject, text } = renderOpenSlot({
    kind: "platz-frei",
    to: "p6@example.com",
    playerName: "P6",
    session,
    token: "tok6",
    baseUrl: "https://example.com",
  });
  assert.equal(subject, "2 Plätze frei heute 20:30 Uhr in Happy Match – kannst du einspringen?");
  assert.match(text, /Es gibt 2 freie Plätze in Happy Match, um 20:30 Uhr\. Kannst du einspringen\?/);
  assert.doesNotMatch(text, /P1|P2/);
});
