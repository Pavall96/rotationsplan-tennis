import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOpenSlot } from "./email";
import { assignment, makeSession } from "./test-fixtures";

test("the Platz-frei email names who cancelled and links straight to the jump-in page", () => {
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
  assert.match(text, /P1 hat abgesagt/);
  assert.match(text, /https:\/\/example\.com\/spieler\/tok6\/antwort\?termin=1&antwort=ja/);
  assert.match(html, /Ja, ich springe ein/);
  assert.doesNotMatch(html, /antwort=nein/);
});
