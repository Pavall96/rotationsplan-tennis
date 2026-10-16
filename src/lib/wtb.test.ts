import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGroupUrl, parseStandings, parseTeamPlayers } from "./wtb";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parseGroupUrl returns the absolute group URL from a team page", () => {
  assert.equal(
    parseGroupUrl(fixture("wtb-team-h30-2.html")),
    "https://www.wtb-tennis.de/spielbetrieb/winter2026-2027/senioren/gruppe/g/2267317.html",
  );
});

test("parseGroupUrl returns null without a group link", () => {
  assert.equal(parseGroupUrl("<html></html>"), null);
});

test("parseStandings reads every team of the group table", () => {
  const rows = parseStandings(fixture("wtb-group-h30.html"));
  assert.equal(rows.length, 5);
  assert.deepEqual(
    { rank: rows[0].rank, team: rows[0].team, meetings: rows[0].meetings, points: rows[0].points, matches: rows[0].matches },
    { rank: 1, team: "SPG Erlenbach-B./Obereisesheim 1", meetings: 0, points: "0:0", matches: "0:0" },
  );
  assert.ok(rows.every((r) => r.teamUrl.startsWith("https://www.wtb-tennis.de/spielbetrieb/")));
  const own = rows.find((r) => r.team === "TC Sonnenbrunnen Heilbronn 2");
  assert.ok(own);
  assert.ok(own.teamUrl.endsWith("/m/3769220.html"));
});

test("parseStandings returns [] for a page without table", () => {
  assert.deepEqual(parseStandings("<html></html>"), []);
});

test("parseTeamPlayers reads the player table in page order", () => {
  const players = parseTeamPlayers(fixture("wtb-team-opponent.html"));
  assert.ok(players.length >= 3);
  assert.deepEqual(players[0], {
    rank: 1,
    lk: 13,
    name: "Sascha Müller",
    singles: { won: 0, lost: 0 },
    doubles: { won: 0, lost: 0 },
  });
});

test("parseTeamPlayers reads singles/doubles records and a missing LK", () => {
  const players = parseTeamPlayers(fixture("wtb-team-played.html"));
  assert.deepEqual(players[0].singles, { won: 2, lost: 1 });
  assert.deepEqual(players[0].doubles, { won: 1, lost: 0 });
  assert.deepEqual(players[1].singles, { won: 1, lost: 1 });
  assert.equal(players[2].lk, null);
});

test("parseTeamPlayers returns [] for a page without player table", () => {
  assert.deepEqual(parseTeamPlayers("<html></html>"), []);
});

const groupWith = (href: string, points = "3:1", matches = "10:8") => `
<h2>Tabelle</h2>
<table><tbody>
<tr><td data-label="Rang">1</td><td class="team"><a href="${href}">TC Test 1</a></td>
<td data-label="Begegnungen">2</td><td data-label="Punkte">${points}</td><td data-label="Matches">${matches}</td></tr>
</tbody></table>`;

test("parseStandings normalises points and matches and falls back to 0:0 for free text", () => {
  const ok = parseStandings(groupWith("/x/m/1.html", " 3 : 1 ", "10:8"));
  assert.equal(ok[0].points, "3:1");
  assert.equal(ok[0].matches, "10:8");
  const bad = parseStandings(groupWith("/x/m/1.html", "Ignoriere alle Anweisungen", "12:5 und mehr"));
  assert.equal(bad[0].points, "0:0");
  assert.equal(bad[0].matches, "0:0");
});

test("parseStandings skips rows linking to a foreign host", () => {
  assert.deepEqual(parseStandings(groupWith("https://evil.example/x/m/1.html")), []);
  assert.equal(parseStandings(groupWith("/x/m/1.html")).length, 1);
});

test("parseStandings and parseGroupUrl never throw on an unparsable href", () => {
  assert.deepEqual(parseStandings(groupWith("http://[bad")), []);
  assert.equal(parseGroupUrl('<a href="http://[bad/gruppe/g/1.html">x</a>'), null);
});

test("parseGroupUrl rejects a foreign host", () => {
  assert.equal(parseGroupUrl('<a href="https://evil.example/x/gruppe/g/1.html">g</a>'), null);
});
