# Absprache zwischen Mannschaftsführern – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mannschaftsführer können Spieler für ihr Spiel vormerken, sehen auf der Aufstellungsseite die anderen Teams desselben Tages, Konflikte und Einsatzzahlen, und können per WhatsApp-Knopf den anderen Mannschaftsführer anschreiben.

**Architecture:** Neue Tabelle `lineup_marks`, bewusst getrennt von `lineups` (an `lineups` hängen Sperre, Veröffentlichen, Mails, Spielerseiten). Reine Regeln (`sameDayClaims`, `appearances`, `canMark`, `conflictTeams`) in `src/lib/marks.ts` mit Unit-Tests; Server-Actions `markPlayer`/`unmarkPlayer` neben den bestehenden Aufstellungs-Actions; die Aufstellungsseite bekommt einen Block „Am selben Tag“, einen Abschnitt „Vorgemerkt“, einen „Vormerken“-Knopf, Einsatzzeilen und „Absprechen ›“-Links.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle ORM auf Neon (`drizzle-orm/neon-http`), Tailwind v4, Tests mit `node:test` über `tsx` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-29-mannschaftsfuehrer-absprache-design.md`

## Global Constraints

- Die lokale `.env.local` zeigt auf die **Produktionsdatenbank**. Lokal im Browser nur Seiten laden, **keine Buttons drücken**, die schreiben.
- Schemaänderungen **nicht** mit `npm run db:push`. Die Tabelle wird in Produktion von Hand angelegt – **erst nach Pablos ausdrücklichem OK** (Task 6), und in `drizzle/manual-migrations.sql` festgehalten.
- Vormerkungen sind für Spieler unsichtbar: `getMarks` nur in Dateien unter `src/app/spieler/[token]/mannschaftsfuehrer/` verwenden – nie in Spielerseiten, `punktspiele`, ICS-Routen, Cron oder Mails.
- Keine feste Rangfolge zwischen Mannschaften; Sperre am selben Tag, Festspiel-Regel, Veröffentlichen und Mails bleiben unverändert.
- Alle Texte in der Oberfläche auf Deutsch, Stil wie bestehende Seiten (Farben nur über `var(--color-…)`).
- Typecheck: `npx next typegen && npx tsc --noEmit -p .` (ohne `typegen` fehlen `PageProps` & Co.).
- Tests: `npm test` (heute 35 grün).
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy nur manuell mit `npx --yes vercel deploy --prod --yes --scope pav12`, nur mit Pablos OK, erst **nachdem** die Tabelle in Produktion existiert.

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/db/schema.ts` (ändern) | Tabelle `lineupMarks` |
| `drizzle/manual-migrations.sql` (ändern) | `CREATE TABLE lineup_marks` als Protokoll |
| `src/lib/marks.ts` (neu) | Vormerkungen lesen/schreiben (`getMarks`, `markStatement`, `unmarkStatement`) und reine Regeln |
| `src/lib/marks.test.ts` (neu) | Tests der reinen Regeln |
| `src/lib/invite.ts` (ändern) | WhatsApp-Texte `coordinationText`, `sameDayText` |
| `src/lib/invite.test.ts` (neu) | Tests der Texte |
| `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts` (ändern) | `markPlayer`, `unmarkPlayer`; `addToLineup` löscht die eigene Vormerkung |
| `scripts/check-marks-sql.ts` (neu) | SQL der Actions gegen Produktion mit erzwungenem Rollback prüfen |
| `src/components/SameDayBlock.tsx` (neu) | Block „Am selben Tag“ |
| `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx` (ändern) | Aufstellungsseite |
| `src/app/spieler/[token]/mannschaftsfuehrer/page.tsx` (ändern) | Hinweis „Absprache mit … offen“ auf der Spielkarte |

---

### Task 1: Reine Regeln für Vormerkungen und Konflikte

**Files:**
- Modify: `src/db/schema.ts` (neue Tabelle, wird von `marks.ts` importiert)
- Create: `src/lib/marks.ts`
- Test: `src/lib/marks.test.ts`

**Interfaces:**
- Consumes: `MatchView`, `TeamView` aus `src/lib/matches.ts`; `LineupEntry` aus `src/lib/lineups.ts`; `lineupCheck`, `LineupCheck`, `LineupContext`, `PlayerRoster`, `TeamRef` aus `src/lib/eligibility.ts`.
- Produces (in `src/lib/marks.ts`):
  - `type Mark = { playerId: number; name: string; playsMatches: boolean }`
  - `type Claim = { match: MatchView; kind: "aufgestellt" | "vorgemerkt"; captainName: string | null; captainPlayerId: number | null }`
  - `type Appearance = { teamName: string; count: number }`
  - `type CaptainRef = Pick<TeamView, "id" | "captainName" | "captainPlayerId">`
  - `sameDayClaims(playerId: number, match: MatchView, allMatches: MatchView[], lineupsByMatch: Map<number, LineupEntry[]>, marksByMatch: Map<number, Mark[]>, teams: readonly CaptainRef[]): Claim[]`
  - `appearances(playerId: number, allMatches: MatchView[], lineupsByMatch: Map<number, LineupEntry[]>): Appearance[]`
  - `canMark(roster: PlayerRoster, team: TeamRef, ctx: LineupContext): LineupCheck`
  - `conflictTeams(match: MatchView, allMatches: MatchView[], lineupsByMatch: Map<number, LineupEntry[]>, marksByMatch: Map<number, Mark[]>): string[]`
  - Schema: `lineupMarks` in `src/db/schema.ts`

- [ ] **Step 1: Tabelle im Schema ergänzen**

In `src/db/schema.ts` direkt nach der Definition von `lineups` einfügen:

```ts
// Vormerkungen: a Mannschaftsführer's "I'd like this player" for one match. Deliberately separate from `lineups` —
// a mark blocks nobody, is never published and players never see it.
export const lineupMarks = pgTable(
  "lineup_marks",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("lineup_marks_match_player_unique").on(table.matchId, table.playerId)],
);
```

- [ ] **Step 2: Failing tests schreiben**

`src/lib/marks.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchView } from "./matches";
import type { LineupEntry } from "./lineups";
import { appearances, canMark, conflictTeams, sameDayClaims, type Mark } from "./marks";

const match = (id: number, date: string, ageClass: "herren" | "h30", rank: number): MatchView => ({
  id,
  matchDate: date,
  startsAt: new Date(`${date}T18:00:00+01:00`),
  isHome: true,
  opponent: "X",
  playersNeeded: 4,
  lineupPublishedAt: null,
  scheduleVersion: 0,
  team: {
    id: rank + (ageClass === "h30" ? 10 : 0),
    slug: "",
    name: `${ageClass === "h30" ? "Herren 30" : "Herren"} ${rank === 1 ? "I" : "II"}`,
    ageClass,
    rank,
  },
  venue: null,
});

const entry = (playerId: number, role: "stamm" | "ersatz", response: "ja" | "nein" | null = null): LineupEntry => ({
  playerId,
  name: `P${playerId}`,
  role,
  published: false,
  notified: false,
  hasEmail: true,
  response,
});

const mark = (playerId: number, playsMatches = true): Mark => ({ playerId, name: `P${playerId}`, playsMatches });

const h30Second = match(1, "2027-01-16", "h30", 2); // team id 12
const herrenFirst = match(2, "2027-01-16", "herren", 1); // team id 1, same day
const herrenSecond = match(3, "2027-01-16", "herren", 2); // team id 2, same day
const otherDay = match(4, "2027-01-23", "herren", 1);
const all = [h30Second, herrenFirst, herrenSecond, otherDay];
const teams = [
  { id: 1, captainName: "Marco", captainPlayerId: 100 },
  { id: 2, captainName: null, captainPlayerId: null },
  { id: 12, captainName: "Pablo", captainPlayerId: 200 },
];

test("sameDayClaims: nobody else wants the player", () => {
  assert.deepEqual(sameDayClaims(7, h30Second, all, new Map(), new Map(), teams), []);
});

test("sameDayClaims: lined up elsewhere that day, as Stamm or Ersatz, with that team's captain", () => {
  const lineups = new Map([
    [2, [entry(7, "stamm")]],
    [3, [entry(8, "ersatz")]],
  ]);
  const seven = sameDayClaims(7, h30Second, all, lineups, new Map(), teams);
  assert.equal(seven.length, 1);
  assert.equal(seven[0].match.id, 2);
  assert.equal(seven[0].kind, "aufgestellt");
  assert.equal(seven[0].captainName, "Marco");
  assert.equal(seven[0].captainPlayerId, 100);

  const eight = sameDayClaims(8, h30Second, all, lineups, new Map(), teams);
  assert.equal(eight[0].kind, "aufgestellt");
  assert.equal(eight[0].captainName, null);
});

test("sameDayClaims: marked elsewhere counts, marks of players who don't play don't", () => {
  const marks = new Map([
    [2, [mark(7)]],
    [3, [mark(9, false)]],
  ]);
  assert.equal(sameDayClaims(7, h30Second, all, new Map(), marks, teams)[0].kind, "vorgemerkt");
  assert.deepEqual(sameDayClaims(9, h30Second, all, new Map(), marks, teams), []);
});

test("sameDayClaims: lined up beats marked for the same match", () => {
  const lineups = new Map([[2, [entry(7, "stamm")]]]);
  const marks = new Map([[2, [mark(7)]]]);
  assert.equal(sameDayClaims(7, h30Second, all, lineups, marks, teams)[0].kind, "aufgestellt");
});

test("sameDayClaims: ignores the match itself and other days", () => {
  const lineups = new Map([
    [1, [entry(7, "stamm")]],
    [4, [entry(7, "stamm")]],
  ]);
  const marks = new Map([[1, [mark(7)]]]);
  assert.deepEqual(sameDayClaims(7, h30Second, all, lineups, marks, teams), []);
});

test("appearances: Stamm counts per team, Ersatz and Absagen don't", () => {
  const lineups = new Map([
    [1, [entry(7, "stamm", "ja")]],
    [2, [entry(7, "stamm")]],
    [3, [entry(7, "ersatz")]],
    [4, [entry(7, "stamm", null)]],
  ]);
  assert.deepEqual(appearances(7, all, lineups), [
    { teamName: "Herren I", count: 2 },
    { teamName: "Herren 30 II", count: 1 },
  ]);
  const cancelled = new Map([[2, [entry(7, "stamm", "nein")]]]);
  assert.deepEqual(appearances(7, all, cancelled), []);
});

test("canMark: allowed although the player plays for another team that day", () => {
  const roster = { h30: { position: 8, countsAsGerman: true } };
  const ctx = { playsMatches: true, firstTeamAppearances: 0, sameDayTeam: "Herren I" };
  assert.equal(canMark(roster, { ageClass: "h30", rank: 2 }, ctx).ok, true);
});

test("canMark: refused when the player may not play for the team at all", () => {
  const free = { playsMatches: true, firstTeamAppearances: 0, sameDayTeam: null };
  const team = { ageClass: "h30" as const, rank: 2 };
  assert.equal(canMark({ h30: { position: 2, countsAsGerman: true } }, team, free).ok, false); // fest in der 1.
  assert.equal(canMark({}, team, free).ok, false); // nicht auf der Meldeliste
  assert.equal(canMark({ h30: { position: 8, countsAsGerman: true } }, team, { ...free, firstTeamAppearances: 3 }).ok, false);
  assert.equal(canMark({ h30: { position: 8, countsAsGerman: true } }, team, { ...free, playsMatches: false }).ok, false);
});

test("conflictTeams: via a lineup entry or a mark of this match; nothing without a claim elsewhere", () => {
  const lineups = new Map([
    [1, [entry(7, "stamm")]],
    [2, [entry(8, "stamm")]],
  ]);
  const marks = new Map([
    [1, [mark(8)]],
    [2, [mark(7)]],
    [3, [mark(8)]],
  ]);
  assert.deepEqual(conflictTeams(h30Second, all, lineups, marks), ["Herren I", "Herren II"]);
  assert.deepEqual(conflictTeams(h30Second, all, new Map([[1, [entry(7, "stamm")]]]), new Map()), []);
});
```

- [ ] **Step 3: Tests laufen lassen – müssen scheitern**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL – `Cannot find module './marks'` bzw. `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: `src/lib/marks.ts` schreiben**

```ts
// Vormerkungen: a Mannschaftsführer's "I'd like this player" for one match, and what follows from them. Captain pages
// only — players never see marks. The pure functions take everything as arguments so the rules can be tested.

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lineupMarks, players } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { MatchView, TeamView } from "@/lib/matches";
import type { LineupEntry } from "@/lib/lineups";
import { lineupCheck, type LineupCheck, type LineupContext, type PlayerRoster, type TeamRef } from "@/lib/eligibility";

export type Mark = { playerId: number; name: string; playsMatches: boolean };

/** Marks keyed by match id, oldest first. Only for Mannschaftsführer pages and actions. */
export async function getMarks(): Promise<Map<number, Mark[]>> {
  const rows = await getDb()
    .select({
      matchId: lineupMarks.matchId,
      playerId: players.id,
      displayName: players.displayName,
      nickname: players.nickname,
      playsMatches: players.playsMatches,
    })
    .from(lineupMarks)
    .innerJoin(players, eq(lineupMarks.playerId, players.id))
    .orderBy(asc(lineupMarks.createdAt));

  const byMatch = new Map<number, Mark[]>();
  for (const r of rows) {
    if (!byMatch.has(r.matchId)) byMatch.set(r.matchId, []);
    byMatch.get(r.matchId)!.push({ playerId: r.playerId, name: playerLabel(r), playsMatches: r.playsMatches });
  }
  return byMatch;
}

export type CaptainRef = Pick<TeamView, "id" | "captainName" | "captainPlayerId">;

export type Claim = {
  match: MatchView;
  kind: "aufgestellt" | "vorgemerkt";
  captainName: string | null;
  captainPlayerId: number | null;
};

/** Other matches on the same day that have this player lined up (Stamm or Ersatz) or marked. */
export function sameDayClaims(
  playerId: number,
  match: MatchView,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
  marksByMatch: Map<number, Mark[]>,
  teams: readonly CaptainRef[],
): Claim[] {
  const claims: Claim[] = [];
  for (const m of allMatches) {
    if (m.id === match.id || m.matchDate !== match.matchDate) continue;
    const linedUp = (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId);
    const marked = (marksByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId && e.playsMatches);
    if (!linedUp && !marked) continue;
    const team = teams.find((t) => t.id === m.team.id);
    claims.push({
      match: m,
      kind: linedUp ? "aufgestellt" : "vorgemerkt",
      captainName: team?.captainName ?? null,
      captainPlayerId: team?.captainPlayerId ?? null,
    });
  }
  return claims;
}

export type Appearance = { teamName: string; count: number };

/** Stammplätze over the whole season per team, played or planned; Ersatz and Absagen don't count. Herren first. */
export function appearances(
  playerId: number,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
): Appearance[] {
  const byTeam = new Map<number, { team: MatchView["team"]; count: number }>();
  for (const m of allMatches) {
    const plays = (lineupsByMatch.get(m.id) ?? []).some(
      (e) => e.playerId === playerId && e.role === "stamm" && e.response !== "nein",
    );
    if (!plays) continue;
    const current = byTeam.get(m.team.id) ?? { team: m.team, count: 0 };
    current.count++;
    byTeam.set(m.team.id, current);
  }
  return [...byTeam.values()]
    .sort(
      (a, b) =>
        (a.team.ageClass === "herren" ? 0 : 1) - (b.team.ageClass === "herren" ? 0 : 1) || a.team.rank - b.team.rank,
    )
    .map(({ team, count }) => ({ teamName: team.name, count }));
}

/** Whether a player may be marked: like lining up, except that playing for another team that day is fine. */
export function canMark(roster: PlayerRoster, team: TeamRef, ctx: LineupContext): LineupCheck {
  return lineupCheck(roster, team, { ...ctx, sameDayTeam: null });
}

/** Teams that claim, on the same day, a player this match has lined up or marked. */
export function conflictTeams(
  match: MatchView,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
  marksByMatch: Map<number, Mark[]>,
): string[] {
  const here = [
    ...(lineupsByMatch.get(match.id) ?? []).map((e) => e.playerId),
    ...(marksByMatch.get(match.id) ?? []).filter((m) => m.playsMatches).map((m) => m.playerId),
  ];
  const names = new Set<string>();
  for (const playerId of here) {
    for (const c of sameDayClaims(playerId, match, allMatches, lineupsByMatch, marksByMatch, [])) {
      names.add(c.match.team.name);
    }
  }
  return [...names];
}
```

Hinweis zu `conflictTeams`-Test: Erwartet ist `["Herren I", "Herren II"]` – Spieler 7 (aufgestellt hier) ist bei Herren I vorgemerkt, Spieler 8 (vorgemerkt hier) ist bei Herren I aufgestellt und bei Herren II vorgemerkt. Reihenfolge = Reihenfolge von `allMatches`.

- [ ] **Step 5: Tests laufen lassen – müssen grün sein**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ pass 44`, `ℹ fail 0`.

- [ ] **Step 6: Typecheck**

Run: `npx next typegen && npx tsc --noEmit -p .`
Expected: keine Ausgabe, Exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/lib/marks.ts src/lib/marks.test.ts
git commit -m "Add Vormerkungen: table, query and the rules for same-day claims, appearances and conflicts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: WhatsApp-Texte

**Files:**
- Modify: `src/lib/invite.ts`
- Test: `src/lib/invite.test.ts`

**Interfaces:**
- Produces:
  - `coordinationText(o: { captainName: string; day: string; player: string; myTeam: string; theirTeam: string; kind: "aufgestellt" | "vorgemerkt" }): string`
  - `sameDayText(o: { captainName: string; day: string; teams: string[] }): string`
  - (bestehend) `whatsappUrl(text: string): string`

- [ ] **Step 1: Failing tests schreiben**

`src/lib/invite.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { coordinationText, sameDayText } from "./invite";

test("coordinationText names the player, both teams and the kind of claim", () => {
  assert.equal(
    coordinationText({
      captainName: "Marco",
      day: "Sa., 16.01.",
      player: "Seb",
      myTeam: "Herren 30 II",
      theirTeam: "Herren I",
      kind: "aufgestellt",
    }),
    "Hi Marco, wegen Sa., 16.01.: Ich würde Seb gern bei Herren 30 II einsetzen – du hast ihn bei Herren I aufgestellt. Wie machen wir's?",
  );
  assert.match(
    coordinationText({ captainName: "Marco", day: "Sa., 16.01.", player: "Seb", myTeam: "A", theirTeam: "B", kind: "vorgemerkt" }),
    /du hast ihn bei B vorgemerkt\./,
  );
});

test("sameDayText lists the teams of the day", () => {
  assert.equal(
    sameDayText({ captainName: "Marco", day: "Sa., 16.01.", teams: ["Herren I", "Herren 30 II"] }),
    "Hi Marco, wegen Sa., 16.01. (Herren I und Herren 30 II): Lass uns kurz abstimmen, wer wo spielt.",
  );
});
```

- [ ] **Step 2: Tests laufen lassen – müssen scheitern**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL – `coordinationText` / `sameDayText` ist kein Export (`SyntaxError: The requested module './invite' does not provide an export named 'coordinationText'`).

- [ ] **Step 3: Implementieren**

An `src/lib/invite.ts` anhängen:

```ts
/** WhatsApp message from one Mannschaftsführer to another about a player both want on the same day. */
export function coordinationText(o: {
  captainName: string;
  day: string;
  player: string;
  myTeam: string;
  theirTeam: string;
  kind: "aufgestellt" | "vorgemerkt";
}): string {
  return (
    `Hi ${o.captainName}, wegen ${o.day}: Ich würde ${o.player} gern bei ${o.myTeam} einsetzen – ` +
    `du hast ihn bei ${o.theirTeam} ${o.kind}. Wie machen wir's?`
  );
}

/** WhatsApp message to the Mannschaftsführer of another team playing the same day. */
export function sameDayText(o: { captainName: string; day: string; teams: string[] }): string {
  return `Hi ${o.captainName}, wegen ${o.day} (${o.teams.join(" und ")}): Lass uns kurz abstimmen, wer wo spielt.`;
}
```

- [ ] **Step 4: Tests laufen lassen – grün**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ pass 46`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invite.ts src/lib/invite.test.ts
git commit -m "Add the WhatsApp texts captains send each other

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server-Actions und SQL-Prüfskript

**Files:**
- Modify: `src/lib/marks.ts` (Statement-Builder)
- Modify: `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts`
- Modify: `drizzle/manual-migrations.sql`
- Create: `scripts/check-marks-sql.ts`

**Interfaces:**
- Consumes: `canMark`, `lineupMarks` (Task 1); bestehend in `actions.ts`: `captainMatch`, `refresh`, `Result`, `getPlayerRoster`, `getLineups`, `lineupContext`, `playerLabel`.
- Produces:
  - `markStatement(matchId: number, playerId: number)` und `unmarkStatement(matchId: number, playerId: number)` in `src/lib/marks.ts` (Drizzle-Queries, nicht ausgeführt)
  - Server-Actions `markPlayer(formData: FormData): Promise<Result>` und `unmarkPlayer(formData: FormData): Promise<Result>`; FormData-Felder `token`, `matchId`, `playerId`

- [ ] **Step 1: Statement-Builder in `src/lib/marks.ts` ergänzen**

Import-Zeile `import { asc, eq } from "drizzle-orm";` ersetzen durch `import { and, asc, eq } from "drizzle-orm";` und am Dateiende anhängen:

```ts
/** Marking twice is a no-op. Returned unexecuted so scripts/check-marks-sql.ts can run it inside a rollback. */
export function markStatement(matchId: number, playerId: number) {
  return getDb().insert(lineupMarks).values({ matchId, playerId }).onConflictDoNothing();
}

export function unmarkStatement(matchId: number, playerId: number) {
  return getDb()
    .delete(lineupMarks)
    .where(and(eq(lineupMarks.matchId, matchId), eq(lineupMarks.playerId, playerId)));
}
```

- [ ] **Step 2: Actions ergänzen**

In `actions.ts` den Import `import { lineupCheck, isNonGerman, tooManyNonGermans } from "@/lib/eligibility";` so lassen und darunter ergänzen:

```ts
import { canMark, markStatement, unmarkStatement } from "@/lib/marks";
```

In `addToLineup` direkt **nach** dem `await db.insert(lineups)…onConflictDoUpdate(…);` und **vor** `refresh();` einfügen:

```ts
  // Lining up replaces this team's own mark; other teams' marks for the day stay, so the conflict stays visible.
  await unmarkStatement(matchId, playerId);
```

Nach `removeFromLineup` (vor `export type PublishPreview`) einfügen:

```ts
export async function markPlayer(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const playerId = Number(formData.get("playerId"));

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann vormerken." };
  const { match, all } = ctx;

  const [player] = await getDb().select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) return { error: "Spieler nicht gefunden." };

  const [roster, lineupsByMatch] = await Promise.all([getPlayerRoster(playerId), getLineups()]);
  if ((lineupsByMatch.get(matchId) ?? []).some((e) => e.playerId === playerId)) {
    return { error: `${playerLabel(player)} steht schon in der Aufstellung.` };
  }
  const check = canMark(roster, match.team, lineupContext(playerId, player.playsMatches, match, all, lineupsByMatch));
  if (!check.ok) return { error: `${playerLabel(player)}: ${check.reason}` };

  await markStatement(matchId, playerId);
  refresh();
}

export async function unmarkPlayer(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const playerId = Number(formData.get("playerId"));

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann Vormerkungen entfernen." };

  await unmarkStatement(matchId, playerId);
  refresh();
}
```

- [ ] **Step 3: Migrationsprotokoll ergänzen**

An `drizzle/manual-migrations.sql` anhängen:

```sql

-- 2026-09-29: Vormerkungen der Mannschaftsführer. Additive — new table only.
CREATE TABLE IF NOT EXISTS lineup_marks (
  id serial PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lineup_marks_match_player_unique UNIQUE (match_id, player_id)
);
```

- [ ] **Step 4: Prüfskript schreiben**

`scripts/check-marks-sql.ts`:

```ts
// Runs the real Vormerkungs-SQL against the configured database inside a transaction that is forced to fail at the
// end, so Postgres rolls everything back and nothing is kept. Proves the statements run against the live schema.
// Usage: node --env-file=<path to .env.local> --import tsx scripts/check-marks-sql.ts <matchId> <playerId>
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { markStatement, unmarkStatement } from "../src/lib/marks";

async function runAndRollBack(name: string, statements: readonly unknown[]) {
  const db = getDb();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch([...(statements as any[]), db.execute(sql`select 1 / 0 as force_rollback`)] as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("division by zero")) {
      console.log(`OK ${name} – statements ran and were rolled back.`);
      return;
    }
    throw err;
  }
  throw new Error(`${name}: expected the forced rollback error.`);
}

async function main() {
  const matchId = Number(process.argv[2]);
  const playerId = Number(process.argv[3]);
  if (!matchId || !playerId) throw new Error("Usage: check-marks-sql.ts <matchId> <playerId>");
  await runAndRollBack("mark twice + unmark", [
    markStatement(matchId, playerId),
    markStatement(matchId, playerId),
    unmarkStatement(matchId, playerId),
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

(Ausführen erst in Task 6, wenn die Tabelle existiert.)

- [ ] **Step 5: Typecheck, Lint, Tests**

Run: `npx next typegen && npx tsc --noEmit -p . && npx eslint src/lib/marks.ts "src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts" scripts/check-marks-sql.ts && npm test 2>&1 | tail -3`
Expected: keine Fehler; `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/marks.ts "src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts" drizzle/manual-migrations.sql scripts/check-marks-sql.ts
git commit -m "Let captains mark and unmark players; lining up replaces the own mark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Aufstellungsseite – Block „Am selben Tag“, Vorgemerkt, Vormerken, Einsätze, Absprechen

**Files:**
- Create: `src/components/SameDayBlock.tsx`
- Modify (komplett ersetzen): `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx`

**Interfaces:**
- Consumes: `getMarks`, `sameDayClaims`, `appearances`, `canMark`, `Claim`, `Appearance` (Task 1); `coordinationText`, `sameDayText`, `whatsappUrl` (Task 2); `markPlayer`, `unmarkPlayer` (Task 3).
- Produces: `SameDayBlock({ matches }: { matches: SameDayMatch[] })`, `type SameDayMatch = { match: MatchView; stamm: string[]; ersatz: string[]; marked: string[]; captainName: string | null; whatsapp: string | null; own: boolean }`.

- [ ] **Step 1: `src/components/SameDayBlock.tsx` anlegen**

```tsx
import type { MatchView } from "@/lib/matches";
import { formatTime } from "@/lib/format";
import { TeamChip } from "@/components/MatchCard";

export type SameDayMatch = {
  match: MatchView;
  stamm: string[];
  ersatz: string[];
  marked: string[];
  captainName: string | null;
  /** WhatsApp link to that team's Mannschaftsführer; null for the viewer's own team or without a captain. */
  whatsapp: string | null;
  /** The viewer is that team's Mannschaftsführer too. */
  own: boolean;
};

/** The other matches on the same day: who's lined up or wanted there, and a way to talk to their Mannschaftsführer. */
export function SameDayBlock({ matches }: { matches: SameDayMatch[] }) {
  return (
    <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h2 className="mb-1 font-display font-bold">Am selben Tag</h2>
      <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
        Wer dort aufgestellt ist, ist hier gesperrt. Vorgemerkte sind nur Wünsche – sprecht euch ab.
      </p>
      <ul className="space-y-2.5">
        {matches.map((s) => (
          <li key={s.match.id} className="rounded-[14px] bg-[var(--color-tabs-bg)] p-3 text-xs">
            <p className="flex items-center gap-2 text-sm">
              <TeamChip name={s.match.team.name} ageClass={s.match.team.ageClass} />
              <span className="min-w-0 truncate">
                {formatTime(s.match.startsAt)} {s.match.isHome ? "vs" : "@"} {s.match.opponent}
              </span>
            </p>
            <p className="mt-1.5">
              <span className="font-semibold">
                Aufgestellt {s.stamm.length}/{s.match.playersNeeded}:
              </span>{" "}
              {s.stamm.length ? s.stamm.join(", ") : "noch niemand"}
            </p>
            {s.ersatz.length > 0 && (
              <p>
                <span className="font-semibold">Ersatz:</span> {s.ersatz.join(", ")}
              </p>
            )}
            {s.marked.length > 0 && (
              <p className="text-[var(--color-h30)]">
                <span className="font-semibold">Vorgemerkt:</span> {s.marked.join(", ")}
              </p>
            )}
            <p className="mt-2 flex items-center justify-between gap-2 text-[var(--color-ink-muted)]">
              <span className="min-w-0 truncate">
                {s.own ? "Dein Team" : s.captainName ? `MF: ${s.captainName}` : "kein Mannschaftsführer eingetragen"}
              </span>
              {s.whatsapp && (
                <a
                  href={s.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-semibold text-[var(--color-brand)] underline underline-offset-2"
                >
                  WhatsApp ›
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: `page.tsx` komplett ersetzen**

`src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { getRoster, rosterByPlayer } from "@/lib/roster";
import { getLineups, lineupContext, singlesOrder, type LineupEntry } from "@/lib/lineups";
import { getAvailability, availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import { lineupCheck, isNonGerman, tooManyNonGermans, type LineupCheck } from "@/lib/eligibility";
import { getMarks, sameDayClaims, appearances, canMark, type Claim, type Appearance } from "@/lib/marks";
import { coordinationText, sameDayText, whatsappUrl } from "@/lib/invite";
import { formatDayShort, formatTime } from "@/lib/format";
import { addToLineup, removeFromLineup, markPlayer, unmarkPlayer } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamChip } from "@/components/MatchCard";
import { PublishLineupButton } from "@/components/PublishLineupButton";
import { SameDayBlock, type SameDayMatch } from "@/components/SameDayBlock";
import { AlertIcon, ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

type Candidate = {
  playerId: number;
  name: string;
  lists: string;
  position: number | null;
  countsAsGerman: boolean;
  status: AvailabilityStatus | "offen";
  check: LineupCheck;
  markable: boolean;
  claims: Claim[];
  appearances: Appearance[];
};

type MarkedRow = {
  playerId: number;
  name: string;
  lists: string;
  position: number | null;
  check: LineupCheck;
  /** Another team has lined this player up the same day since the mark was set. */
  linedUpElsewhere: Claim | null;
};

const GROUPS: { key: AvailabilityStatus | "offen"; label: string; color: string }[] = [
  { key: "ja", label: "Können", color: "text-[var(--color-ja)]" },
  { key: "vielleicht", label: "Vielleicht", color: "text-[var(--color-vielleicht)]" },
  { key: "offen", label: "Noch keine Antwort", color: "text-[var(--color-ink-muted)]" },
  { key: "nein", label: "Können nicht", color: "text-[var(--color-nein)]" },
];

const smallButton = "rounded-full px-2.5 py-1 text-[11px] font-semibold";
const markButton = `${smallButton} border border-dashed border-[var(--color-border-strong)] text-[var(--color-ink-muted)]`;

export default async function LineupPage({ params }: PageProps<"/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]">) {
  const { token, matchId: matchIdParam } = await params;
  const matchId = Number(matchIdParam);
  const captain = await getPlayerByToken(token);
  if (!captain) notFound();

  const [allMatches, teamList, roster, lineupsByMatch, answers, marksByMatch] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getLineups(),
    getAvailability(),
    getMarks(),
  ]);
  const match = allMatches.find((m) => m.id === matchId);
  const team = teamList.find((t) => t.id === match?.team.id);
  if (!match || !team || team.captainPlayerId !== captain.id) notFound();

  const rosters = rosterByPlayer(roster);
  const people = new Map<number, Omit<Candidate, "status" | "check" | "markable" | "claims" | "appearances"> & { playsMatches: boolean }>();
  for (const r of roster) {
    const p = people.get(r.playerId) ?? {
      playerId: r.playerId,
      name: r.name,
      lists: "",
      position: null,
      countsAsGerman: !isNonGerman(rosters.get(r.playerId) ?? {}),
      playsMatches: r.playsMatches,
    };
    const tag = `${r.ageClass === "h30" ? "H30" : "H"} ${r.position}`;
    p.lists = p.lists ? `${p.lists} · ${tag}` : tag;
    if (r.ageClass === match.team.ageClass) p.position = r.position;
    people.set(r.playerId, p);
  }

  const lineup = lineupsByMatch.get(matchId) ?? [];
  const inLineup = new Set(lineup.map((e) => e.playerId));
  const marksHere = (marksByMatch.get(matchId) ?? []).filter((m) => m.playsMatches && !inLineup.has(m.playerId));
  const markedIds = new Set(marksHere.map((m) => m.playerId));
  const day = formatDayShort(match.startsAt);

  const assess = (playerId: number) => {
    const playerRoster = rosters.get(playerId) ?? {};
    const ctx = lineupContext(playerId, people.get(playerId)?.playsMatches ?? true, match, allMatches, lineupsByMatch);
    return { check: lineupCheck(playerRoster, match.team, ctx), markable: canMark(playerRoster, match.team, ctx).ok };
  };
  const claimsOf = (playerId: number) =>
    sameDayClaims(playerId, match, allMatches, lineupsByMatch, marksByMatch, teamList);
  const talkUrl = (playerName: string, claim: Claim) =>
    claim.captainName && claim.captainPlayerId !== captain.id
      ? whatsappUrl(
          coordinationText({
            captainName: claim.captainName,
            day,
            player: playerName,
            myTeam: match.team.name,
            theirTeam: claim.match.team.name,
            kind: claim.kind,
          }),
        )
      : null;

  // Re-checked on every visit: another team's lineup can make an earlier choice invalid (same day, Festspielen).
  const withMeta = (e: LineupEntry) => {
    const check = assess(e.playerId).check;
    return {
      ...e,
      position: people.get(e.playerId)?.position ?? null,
      lists: people.get(e.playerId)?.lists ?? "",
      countsAsGerman: !isNonGerman(rosters.get(e.playerId) ?? {}),
      problem: check.ok ? null : check.reason,
    };
  };
  const stamm = singlesOrder(lineup.filter((e) => e.role === "stamm").map(withMeta));
  const ersatz = singlesOrder(lineup.filter((e) => e.role === "ersatz").map(withMeta));
  const markedRows: MarkedRow[] = singlesOrder(
    marksHere.map((m) => ({
      playerId: m.playerId,
      name: m.name,
      lists: people.get(m.playerId)?.lists ?? "",
      position: people.get(m.playerId)?.position ?? null,
      check: assess(m.playerId).check,
      linedUpElsewhere: claimsOf(m.playerId).find((c) => c.kind === "aufgestellt") ?? null,
    })),
  );

  const candidates: Candidate[] = [...people.values()]
    .filter((p) => !inLineup.has(p.playerId) && !markedIds.has(p.playerId))
    .map((p) => ({
      ...p,
      status: answers.get(availabilityKey(p.playerId, match.matchDate)) ?? "offen",
      ...assess(p.playerId),
      claims: claimsOf(p.playerId),
      appearances: appearances(p.playerId, allMatches, lineupsByMatch),
    }));
  const eligible = singlesOrder(candidates.filter((c) => c.check.ok));
  const blocked = candidates.filter((c) => !c.check.ok && c.check.reason !== "Spielt diese Saison nicht");

  const warnings: string[] = [];
  if (tooManyNonGermans(stamm)) warnings.push("Mehr als ein Nicht-Deutscher aufgestellt (WSPO § 33a Ziff. 1).");
  for (const e of [...stamm, ...ersatz]) {
    if (e.problem) warnings.push(`${e.name} ist nicht mehr spielberechtigt: ${e.problem}.`);
  }
  const nonGermanStarter = stamm.find((e) => !e.countsAsGerman && e.response !== "nein");
  if (stamm.some((e) => e.position === null)) {
    warnings.push("Nicht jeder steht auf dieser Meldeliste – die Einzel-Reihenfolge ergibt sich erst aus der Wintermeldung.");
  }
  const declined = stamm.filter((e) => e.response === "nein");
  if (declined.length > 0) {
    warnings.unshift(
      `${declined.map((e) => e.name).join(", ")} ${declined.length === 1 ? "hat" : "haben"} abgesagt – entfernen und ${
        ersatz.length ? "Ersatz hochstufen" : "jemand anderen aufstellen"
      }, dann Änderungen veröffentlichen.`,
    );
  }

  const sameDay: SameDayMatch[] = allMatches
    .filter((m) => m.matchDate === match.matchDate && m.id !== match.id)
    .map((m) => {
      const entries = lineupsByMatch.get(m.id) ?? [];
      const other = teamList.find((t) => t.id === m.team.id);
      const own = other?.captainPlayerId === captain.id;
      return {
        match: m,
        stamm: entries.filter((e) => e.role === "stamm").map((e) => e.name),
        ersatz: entries.filter((e) => e.role === "ersatz").map((e) => e.name),
        marked: (marksByMatch.get(m.id) ?? []).filter((x) => x.playsMatches).map((x) => x.name),
        captainName: other?.captainName ?? null,
        whatsapp:
          other?.captainName && !own
            ? whatsappUrl(sameDayText({ captainName: other.captainName, day, teams: [m.team.name, match.team.name] }))
            : null,
        own,
      };
    });
  const hidden = { token, matchId };

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link
        href={`/spieler/${token}/mannschaftsfuehrer`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Zum Mannschaftsführer-Bereich
      </Link>

      <header className="my-4">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight">
          {match.isHome ? "gegen" : "bei"} {match.opponent}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {day} · {formatTime(match.startsAt)} Uhr{match.venue ? ` · ${match.venue.name}` : ""}
        </p>
      </header>

      {sameDay.length > 0 && <SameDayBlock matches={sameDay} />}

      <section className="mb-6 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display font-bold">Aufstellung</h2>
          <span
            className={`text-xs font-semibold ${
              stamm.length - declined.length === match.playersNeeded ? "text-[var(--color-ja)]" : "text-[var(--color-nein)]"
            }`}
          >
            {stamm.length - declined.length} von {match.playersNeeded}
          </span>
        </div>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Sortiert nach Meldeliste – in dieser Reihenfolge werden die Einzel gespielt.
          {match.lineupPublishedAt ? " Veröffentlicht, die Spieler sehen sie auf ihrer Seite." : " Noch nicht veröffentlicht."}
        </p>

        <ol className="mb-3 space-y-1.5">
          {stamm.map((e, i) => (
            <LineupRow
              key={e.playerId}
              label={`${i + 1}`}
              entry={e}
              hidden={hidden}
              unpublished={Boolean(match.lineupPublishedAt) && !e.published}
            />
          ))}
          {stamm.length === 0 && <li className="text-sm text-[var(--color-ink-muted)]">Noch niemand aufgestellt.</li>}
        </ol>
        {ersatz.length > 0 && (
          <>
            <p className="mb-1 text-xs font-semibold text-[var(--color-ink-muted)]">Ersatz</p>
            <ul className="mb-3 space-y-1.5">
              {ersatz.map((e) => (
                <LineupRow
                  key={e.playerId}
                  label="E"
                  entry={e}
                  hidden={hidden}
                  promote
                  unpublished={Boolean(match.lineupPublishedAt) && !e.published}
                />
              ))}
            </ul>
          </>
        )}
        {markedRows.length > 0 && (
          <>
            <p className="mb-1 text-xs font-semibold text-[var(--color-ink-muted)]">
              Vorgemerkt <span className="font-normal">– nur für Mannschaftsführer sichtbar</span>
            </p>
            <ul className="mb-3 space-y-1.5">
              {markedRows.map((r) => (
                <MarkRow
                  key={r.playerId}
                  row={r}
                  hidden={hidden}
                  talk={r.linedUpElsewhere ? talkUrl(r.name, r.linedUpElsewhere) : null}
                />
              ))}
            </ul>
          </>
        )}

        {warnings.map((w) => (
          <p key={w} className="mb-2 flex gap-1.5 rounded-lg bg-[var(--color-nein-bg)] px-2.5 py-2 text-xs text-[var(--color-nein)]">
            <AlertIcon className="mt-0.5 h-3 w-3 shrink-0" />
            {w}
          </p>
        ))}

        {lineup.length > 0 && (
          <PublishLineupButton token={token} matchId={matchId} published={Boolean(match.lineupPublishedAt)} />
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-1 font-display font-bold">Spielberechtigt</h2>
        <p className="mb-3 text-xs text-[var(--color-ink-muted)]">
          Nach Antwort für den {day} gruppiert, innerhalb nach Meldeliste. „Vormerken“ heißt: hätte ich gern – es
          sperrt niemanden und die Spieler sehen es nicht.
        </p>
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const list = eligible.filter((c) => c.status === g.key);
            if (list.length === 0) return null;
            return (
              <details
                key={g.key}
                open={g.key === "ja" || g.key === "vielleicht" || undefined}
                className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2.5"
              >
                <summary className={`cursor-pointer list-none text-sm font-semibold ${g.color}`}>
                  {g.label} ({list.length})
                </summary>
                <ul className="mt-2 divide-y divide-[var(--color-border)]">
                  {list.map((c) => (
                    <li key={c.playerId} className="py-2">
                      <span className="block truncate text-sm">{c.name}</span>
                      <span className="text-[11px] text-[var(--color-ink-faint)]">{c.lists}</span>
                      <AppearanceLine appearances={c.appearances} />
                      {c.claims.map((cl) => (
                        <ClaimNote key={cl.match.id} claim={cl} url={talkUrl(c.name, cl)} />
                      ))}
                      {nonGermanStarter && !c.countsAsGerman && (
                        <p className="mt-1 text-[11px] text-[var(--color-h30)]">
                          Nur als Ersatz – {nonGermanStarter.name} ist schon als Nicht-Deutscher aufgestellt
                        </p>
                      )}
                      {c.check.ok &&
                        c.check.warnings.map((w) => (
                          <p key={w} className="mt-1 text-[11px] text-[var(--color-h30)]">
                            {w}
                          </p>
                        ))}
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "stamm" }}>
                          <SubmitButton className={`${smallButton} bg-[var(--color-brand)] text-white`}>
                            Aufstellen
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: c.playerId, role: "ersatz" }}>
                          <SubmitButton className={`${smallButton} border border-[var(--color-border-strong)]`}>
                            Ersatz
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm action={markPlayer} hidden={{ ...hidden, playerId: c.playerId }}>
                          <SubmitButton className={markButton}>Vormerken</SubmitButton>
                        </ActionForm>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>

        {blocked.length > 0 && (
          <details className="mt-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2.5">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--color-ink-muted)]">
              Nicht spielberechtigt ({blocked.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {blocked.map((c) => (
                <li key={c.playerId} className="text-sm">
                  {c.name}
                  <span className="block text-[11px] text-[var(--color-ink-faint)]">{!c.check.ok && c.check.reason}</span>
                  {c.markable && (
                    <>
                      {c.claims
                        .filter((cl) => cl.kind === "aufgestellt")
                        .map((cl) => {
                          const url = talkUrl(c.name, cl);
                          return url ? (
                            <a
                              key={cl.match.id}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mr-3 text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2"
                            >
                              Absprechen ›
                            </a>
                          ) : null;
                        })}
                      <ActionForm action={markPlayer} hidden={{ ...hidden, playerId: c.playerId }} className="mt-1 inline-block">
                        <SubmitButton className={markButton}>Vormerken</SubmitButton>
                      </ActionForm>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

function AppearanceLine({ appearances }: { appearances: Appearance[] }) {
  if (appearances.length === 0) return null;
  return (
    <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
      Einsätze: {appearances.map((a) => `${a.teamName} ${a.count}`).join(" · ")}
    </p>
  );
}

function ClaimNote({ claim, url }: { claim: Claim; url: string | null }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--color-h30)]">
      <span>
        ⚠ {claim.kind === "aufgestellt" ? "Aufgestellt bei" : "Auch vorgemerkt von"} {claim.match.team.name}
      </span>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
          Absprechen ›
        </a>
      )}
    </p>
  );
}

function MarkRow({
  row,
  hidden,
  talk,
}: {
  row: MarkedRow;
  hidden: { token: string; matchId: number };
  talk: string | null;
}) {
  const elsewhere = row.linedUpElsewhere;
  const problem = !elsewhere && !row.check.ok ? row.check.reason : null;
  return (
    <li
      className={`flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--color-border-strong)] px-3 py-2 ${
        problem ? "bg-[var(--color-nein-bg)]" : ""
      }`}
    >
      <span className="w-4 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">V</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{row.name}</span>
        <span className="text-[11px] text-[var(--color-ink-faint)]">
          {row.lists}
          {elsewhere ? (
            <span className="font-semibold text-[var(--color-h30)]"> · inzwischen bei {elsewhere.match.team.name} aufgestellt</span>
          ) : problem ? (
            <span className="font-semibold text-[var(--color-nein)]"> · {problem}</span>
          ) : null}
        </span>
      </span>
      {elsewhere
        ? talk && (
            <a
              href={talk}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2"
            >
              Absprechen ›
            </a>
          )
        : row.check.ok && (
            <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: row.playerId, role: "stamm" }}>
              <SubmitButton className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2">
                Aufstellen
              </SubmitButton>
            </ActionForm>
          )}
      <ActionForm action={unmarkPlayer} hidden={{ ...hidden, playerId: row.playerId }}>
        <SubmitButton className="text-[11px] text-[var(--color-nein)] underline underline-offset-2">Entfernen</SubmitButton>
      </ActionForm>
    </li>
  );
}

const RESPONSE_LABEL = {
  ja: { text: "zugesagt", color: "text-[var(--color-ja)]" },
  nein: { text: "abgesagt", color: "text-[var(--color-nein)]" },
};

function LineupRow({
  label,
  entry,
  hidden,
  promote = false,
  unpublished = false,
}: {
  label: string;
  entry: LineupEntry & { lists: string; problem: string | null };
  hidden: { token: string; matchId: number };
  promote?: boolean;
  /** Added or changed since the last publish — players don't see it yet. */
  unpublished?: boolean;
}) {
  const response = entry.response ? RESPONSE_LABEL[entry.response] : null;
  return (
    <li
      className={`flex items-center gap-2 rounded-[10px] px-3 py-2 ${
        entry.problem ? "bg-[var(--color-nein-bg)]" : "bg-[var(--color-tabs-bg)]"
      }`}
    >
      <span className="w-4 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">{label}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{entry.name}</span>
        <span className="text-[11px] text-[var(--color-ink-faint)]">
          {entry.lists}
          {unpublished ? (
            <span className="font-semibold text-[var(--color-h30)]"> · noch nicht veröffentlicht</span>
          ) : response ? (
            <span className={`font-semibold ${response.color}`}> · {response.text}</span>
          ) : entry.notified ? (
            " · benachrichtigt"
          ) : (
            ""
          )}
        </span>
      </span>
      {promote && (
        <ActionForm action={addToLineup} hidden={{ ...hidden, playerId: entry.playerId, role: "stamm" }}>
          <SubmitButton className="text-[11px] font-semibold text-[var(--color-brand)] underline underline-offset-2">
            Aufstellen
          </SubmitButton>
        </ActionForm>
      )}
      <ActionForm action={removeFromLineup} hidden={{ ...hidden, playerId: entry.playerId }}>
        <SubmitButton className="text-[11px] text-[var(--color-nein)] underline underline-offset-2">Entfernen</SubmitButton>
      </ActionForm>
    </li>
  );
}
```

Änderungen gegenüber heute, zur Kontrolle: rote Zeile „Am selben Tag: …“ im Header entfällt (ersetzt durch `SameDayBlock`); `withMeta` nutzt `assess`; Kandidaten ohne Vorgemerkte; Knöpfe in eigener Zeile unter dem Namen (drei Knöpfe passen sonst nicht neben den Namen); `LineupRow` und `RESPONSE_LABEL` unverändert.

- [ ] **Step 3: Typecheck, Lint, Tests**

Run: `npx next typegen && npx tsc --noEmit -p . && npx eslint "src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx" src/components/SameDayBlock.tsx && npm test 2>&1 | tail -3`
Expected: keine Fehler; `ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/components/SameDayBlock.tsx "src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx"
git commit -m "Show the other teams of the day, marks, appearances and a WhatsApp way to agree on the lineup page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hinweis „Absprache mit … offen“ in der Übersicht

**Files:**
- Modify: `src/app/spieler/[token]/mannschaftsfuehrer/page.tsx`

**Interfaces:**
- Consumes: `getMarks`, `conflictTeams` (Task 1); bestehende Komponente `OwnMatchCard` in derselben Datei.

- [ ] **Step 1: Import und Daten**

Import ergänzen:

```ts
import { getMarks, conflictTeams } from "@/lib/marks";
```

Das `Promise.all` erweitern – vorher:

```ts
  const [allMatches, allPlayers, roster, answers, lineupsByMatch, baseUrl] = await Promise.all([
    getAllMatches(),
    db.select().from(players).orderBy(players.displayName),
    getRoster(),
    getAvailability(),
    getLineups(),
    getBaseUrl(),
  ]);
```

nachher:

```ts
  const [allMatches, allPlayers, roster, answers, lineupsByMatch, baseUrl, marksByMatch] = await Promise.all([
    getAllMatches(),
    db.select().from(players).orderBy(players.displayName),
    getRoster(),
    getAvailability(),
    getLineups(),
    getBaseUrl(),
    getMarks(),
  ]);
```

- [ ] **Step 2: Prop an `OwnMatchCard` übergeben**

Im Aufruf von `<OwnMatchCard … />` die Prop ergänzen:

```tsx
              conflicts={conflictTeams(m, allMatches, lineupsByMatch, marksByMatch)}
```

- [ ] **Step 3: `OwnMatchCard` erweitern**

Signatur: in der Props-Destrukturierung `conflicts,` ergänzen und im Typ `conflicts: string[];`.

Direkt nach dem `<span …>` mit „können · vielleicht · nicht · offen“ einfügen:

```tsx
      {conflicts.length > 0 && (
        <span className="mt-1 block text-xs font-semibold text-[var(--color-h30)]">
          ⚠ Absprache mit {conflicts.join(", ")} offen
        </span>
      )}
```

- [ ] **Step 4: Typecheck, Lint**

Run: `npx next typegen && npx tsc --noEmit -p . && npx eslint "src/app/spieler/[token]/mannschaftsfuehrer/page.tsx"`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add "src/app/spieler/[token]/mannschaftsfuehrer/page.tsx"
git commit -m "Flag own matches with an open same-day conflict in the captain overview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tabelle in Produktion, SQL-Prüfung, Sichtprüfung

**Files:** keine Code-Änderungen.

- [ ] **Step 1: STOP – Pablo fragen**

Pablo das `CREATE TABLE IF NOT EXISTS lineup_marks …` aus `drizzle/manual-migrations.sql` zeigen und ausdrücklich um OK bitten, es gegen die Produktionsdatenbank auszuführen. Ohne OK hier aufhören. (Rein additiv: neue, leere Tabelle; bestehende Daten werden nicht angefasst.)

- [ ] **Step 2: Tabelle anlegen (nur mit OK)**

`scripts/.tmp-create-lineup-marks.ts` anlegen:

```ts
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

async function main() {
  await getDb().execute(sql`
    CREATE TABLE IF NOT EXISTS lineup_marks (
      id serial PRIMARY KEY,
      match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player_id integer NOT NULL REFERENCES players(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lineup_marks_match_player_unique UNIQUE (match_id, player_id)
    )`);
  console.log("lineup_marks ok");
}
main().then(() => process.exit(0));
```

Run: `node --env-file=.env.local --import tsx scripts/.tmp-create-lineup-marks.ts && rm scripts/.tmp-create-lineup-marks.ts`
Expected: `lineup_marks ok`

- [ ] **Step 3: SQL mit erzwungenem Rollback prüfen**

Eine kommende Spiel-ID nehmen (z. B. 15 = H30 II am 05.12.) und eine beliebige Spieler-ID von der H30-Meldeliste.

Run: `node --env-file=.env.local --import tsx scripts/check-marks-sql.ts 15 <playerId>`
Expected: `OK mark twice + unmark – statements ran and were rolled back.`

- [ ] **Step 4: Sichtprüfung lokal (nur lesen)**

Dev-Server über `preview_start` mit Name `dev`. Mit Pablos Mannschaftsführer-Link nur **laden**, nichts drücken:
- `/spieler/<token>/mannschaftsfuehrer/spiel/16` (16.01., mit Herren I am selben Tag): Block „Am selben Tag“ sichtbar, Knöpfe „Aufstellen / Ersatz / Vormerken“ in eigener Zeile, Einsatzzeilen nur bei Spielern mit Einsätzen.
- `/spieler/<token>/mannschaftsfuehrer/spiel/15` (05.12., allein): kein Block „Am selben Tag“.
- `/spieler/<token>/mannschaftsfuehrer`: Übersicht lädt ohne Fehler.
- Auf Handybreite (375 px) hell und dunkel Screenshots; `read_console_messages` ohne Fehler; `preview_logs` ohne Fehler.

- [ ] **Step 5: Spielerseite prüfen**

`/spieler/<token>/punktspiele` laden: keine Spur von Vormerkungen.

---

### Task 7: PR, Merge und Deploy (jeweils mit Pablos OK)

- [ ] **Step 1: Push und PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "Mannschaftsführer: Vormerken, Konflikte und Absprache am selben Tag" --body "…"
```

PR-Text: Warum (Spieler für mehrere Teams, bisher „wer zuerst kommt“), was (Vormerken, Block „Am selben Tag“, Einsätze, Absprechen per WhatsApp, Hinweis in der Übersicht), Tabelle `lineup_marks` bereits in Produktion angelegt, Tests (`npm test`, SQL-Rollback-Prüfung, Sichtprüfung), Abschluss `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Danach `mcp__ccd_pr__get_status`.

- [ ] **Step 2: Merge und Deploy nur auf Pablos Anweisung**

```bash
gh pr merge <nr> --squash
git fetch -q origin main && git checkout -q --detach origin/main
npx --yes vercel deploy --prod --yes --scope pav12
```

Voraussetzung: `.vercel/project.json` im Worktree nennt `rotationsplan-tennis`. Danach Live-Seite des Spiels vom 16.01. laden (nur lesen).

- [ ] **Step 3: Echter Test nur mit OK**

Pablo fragen, ob einmal ein Spieler vorgemerkt und wieder entfernt werden darf (schreibt echte Daten, für Spieler unsichtbar).
