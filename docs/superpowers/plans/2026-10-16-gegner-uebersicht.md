# Gegner-Übersicht auf der Spielkarte – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Karte des nächsten Punktspiels jeder Mannschaft zeigt Tabelle, bisherige Aufstellung des Gegners und eine aufbauende, leicht schwäbische Einschätzung von Claude.

**Architecture:** Ein täglicher Cron holt Gruppenseiten und Mannschaftsseiten beim WTB, parst sie mit reinen Funktionen (`wtb.ts`) und speichert pro eigener Mannschaft einen Schnappschuss als JSONB. Reine Funktionen (`scouting.ts`) bauen daraus die Fakten pro Spiel samt Hash. Nur bei neuem Hash schreibt Claude (`scouting-ai.ts`) die Einschätzung, die in `match_previews` landet. Die Seite liest nur Gespeichertes und zeigt die Einschätzung nur, wenn ihr Hash zu den aktuellen Fakten passt.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions, `after()`), Drizzle ORM auf Neon (`drizzle-orm/neon-http`), `@anthropic-ai/sdk` (wie `src/lib/lineup-ai.ts`), Tailwind v4, Tests mit `node:test` über `tsx` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-16-gegner-uebersicht-design.md`

## Global Constraints

- **Arbeitsverzeichnis:** ein Worktree von Branch `docs/gegner-uebersicht` (enthält Spec und Plan). Nur dort Dateien ändern.
- **Erst `npm install`:** `@anthropic-ai/sdk` steht in `package.json`, fehlt aber evtl. in `node_modules`.
- **Keine Datenbank:** `.env.local` ist die **Produktions**-Datenbank. Nie `npm run db:push`, nie `npm run dev`, kein Skript aus `scripts/` gegen die DB, kein `CREATE`/`ALTER`. Die Tabellen legt Pablo bzw. die Hauptsession nach Pablos OK an (Task 7).
- **Kein `npm run build` lokal** (vom Rechte-Check schon einmal abgelehnt). Prüfen nach jedem Task: `npx next typegen && npx tsc --noEmit -p .`, `npm test` (vorher 100 grün), `npm run lint` (vorher ohne Meldungen). Den Build macht die Vercel-Preview des PRs.
- Dies ist **nicht** das Next.js aus dem Trainingswissen (siehe `AGENTS.md`). Nur Muster aus den Nachbardateien verwenden (`after` aus `next/server` wie in `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts`).
- Texte in der Oberfläche auf Deutsch, Farben nur über `var(--color-…)`, Code-Kommentare englisch wie im Rest des Projekts.
- Ton der Einschätzung (aus der Spec, wörtlich): „Aufbauend: zuerst, wo wir gute Chancen haben, dann, wo es schwer wird, formuliert als Herausforderung“, „Gegner nur über Positionen, nie mit Namen“, unsere Spieler auch nicht namentlich, „Ein bisschen Schwäbisch, dezent und nicht als Karikatur … Höchstens ein, zwei Ausdrücke pro Text“, „Keine Prozentzahlen. Eine Tendenz ist erlaubt“, zwei bis drei Sätze.
- LK-Vergleich: Differenz **≥ 2** → `vorne`/`hinten`, sonst `offen`; niedrigere LK ist stärker; LK aus `roster_entries` vorher mit `Math.floor` auf eine ganze Zahl.
- Nur das **nächste** Spiel jeder Mannschaft (`matchDate >= heute`, frühestes pro Team) bekommt den Gegner-Teil, nur mit Viewer (persönlicher Link).
- Commits mit Autor-Mail des Repos (nicht ändern) und der Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Gegnername passt nicht zur Tabelle** (Leerzeichen, `&amp;`, umbenannt): Karte zeigt keinen Gegner-Teil statt eines Fehlers; der Cron meldet `opponentNotFound`. → Test in Task 2 (`findStanding`).
2. **Spieltag selbst:** Am Tag des Spiels ist es noch „das nächste Spiel“ und behält die Übersicht. → Test in Task 2 (`nextMatchIds`).
3. **LK fehlt oder ist kein „LK<n>“** (leere Zelle, „-“): `lk: null`, Vergleich `null`, nichts stürzt ab. → Tests in Task 1 und Task 2.
4. **Claude nennt trotz Anweisung einen Namen, zweimal:** Es wird `text: null` mit dem Hash gespeichert, damit nicht jeden Tag neu gefragt wird; ein API-Fehler speichert dagegen nichts, damit der nächste Lauf es erneut versucht. → Test in Task 3 (`mentionsName`) und Ablauf in Task 4.
5. **Eine Mannschaftsseite beim WTB hat keinen Gruppen-Link oder ändert das Layout:** Nur diese Mannschaft scheitert, die anderen drei laufen weiter, der alte Schnappschuss bleibt. → Test in Task 1 (`parseGroupUrl` → `null`), `Promise.allSettled` in Task 4.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/lib/wtb.ts` (ändern) | neue Parser: Gruppen-Link, Tabelle, Spielerliste |
| `src/lib/fixtures/wtb-*.html` (neu) | gespeicherte WTB-Seiten für Tests |
| `src/lib/wtb.test.ts` (neu) | Parser-Tests |
| `src/lib/scouting.ts` (neu) | reine Logik: Einsätze, wahrscheinliche Aufstellung, LK-Vergleich, Fakten, Hash, Anzeige-Daten |
| `src/lib/scouting.test.ts` (neu) | Tests dazu |
| `src/lib/scouting-ai.ts` (neu) | Claude-Aufruf + Namensprüfung |
| `src/lib/scouting-ai.test.ts` (neu) | Tests für Prompt-Eingabe und Namensprüfung |
| `src/db/schema.ts`, `drizzle/manual-migrations.sql` (ändern) | Tabellen `wtb_group_snapshots`, `match_previews` |
| `src/lib/scouting-store.ts` (neu) | DB + Netz: Schnappschüsse holen/speichern, Einschätzung erneuern, Daten für die Karte laden |
| `src/app/api/cron/gegner/route.ts` (neu), `vercel.json` (ändern) | täglicher Cron |
| `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts` (ändern) | nach dem Veröffentlichen Einschätzung erneuern |
| `src/components/OpponentSection.tsx` (neu), `src/components/MatchList.tsx`, `src/components/MatchCard.tsx` (ändern) | Anzeige auf der Karte |

---

### Task 1: WTB-Parser für Tabelle, Gruppen-Link und Spielerliste

**Files:**
- Modify: `src/lib/wtb.ts`
- Create: `src/lib/fixtures/wtb-team-h30-2.html`, `src/lib/fixtures/wtb-team-opponent.html`, `src/lib/fixtures/wtb-group-h30.html`, `src/lib/fixtures/wtb-team-played.html`
- Create: `src/lib/wtb.test.ts`
- Modify: `.gitignore` (Zeile `.superpowers/` ergänzen)

**Interfaces:**
- Produces (in `src/lib/wtb.ts`):
  ```ts
  export type StandingRow = { rank: number; team: string; teamUrl: string; meetings: number; points: string; matches: string };
  export type WinLoss = { won: number; lost: number };
  export type WtbPlayer = { rank: number; lk: number | null; name: string; singles: WinLoss; doubles: WinLoss };
  export function parseGroupUrl(teamHtml: string): string | null;        // absolute URL
  export function parseStandings(groupHtml: string): StandingRow[];       // teamUrl absolute
  export function parseTeamPlayers(teamHtml: string): WtbPlayer[];        // in page order
  ```

- [ ] **Step 1: Fixtures speichern** (öffentliche Seiten, nur lesen):
  ```bash
  curl -s -A "Mozilla/5.0" https://www.wtb-tennis.de/spielbetrieb/vereine/verein/mannschaften/mannschaft/v/20019/m/3769220.html -o src/lib/fixtures/wtb-team-h30-2.html
  curl -s -A "Mozilla/5.0" https://www.wtb-tennis.de/spielbetrieb/vereine/verein/mannschaften/mannschaft/v/20030/m/3771092.html -o src/lib/fixtures/wtb-team-opponent.html
  curl -s -A "Mozilla/5.0" https://www.wtb-tennis.de/spielbetrieb/winter2026-2027/senioren/gruppe/g/2267317.html -o src/lib/fixtures/wtb-group-h30.html
  ```
  `wtb-team-played.html` ist eine Kopie von `wtb-team-opponent.html`, in der von Hand die Bilanz geändert ist: Spieler 1 Einzel `2:1` Doppel `1:0`, Spieler 2 Einzel `1:1`, bei Spieler 3 die LK-Zelle leer (`<td></td>`). Kurzer Kommentar oben in der Datei, dass sie verändert ist.

- [ ] **Step 2: Tests schreiben** in `src/lib/wtb.test.ts` (Fixtures mit `readFileSync(new URL("./fixtures/…", import.meta.url))`):
  - `parseGroupUrl` auf `wtb-team-h30-2.html` → `"https://www.wtb-tennis.de/spielbetrieb/winter2026-2027/senioren/gruppe/g/2267317.html"`; auf `"<html></html>"` → `null`.
  - `parseStandings` auf `wtb-group-h30.html`: Länge = Anzahl Teams auf der Seite (vor dem Schreiben nachzählen), Zeile 1 `{ rank: 1, team: "SPG Erlenbach-B./Obereisesheim 1", meetings: 0, points: "0:0", matches: "0:0" }`, eine Zeile mit `team: "TC Sonnenbrunnen Heilbronn 2"` und `teamUrl` endet auf `/m/3769220.html`.
  - `parseTeamPlayers` auf `wtb-team-opponent.html`: erster Eintrag `{ rank: 1, lk: 13, name: "Sascha Müller", singles: { won: 0, lost: 0 }, doubles: { won: 0, lost: 0 } }`.
  - `parseTeamPlayers` auf `wtb-team-played.html`: Spieler 1 `singles {2,1}`, `doubles {1,0}`; Spieler 3 `lk: null`.
  - `parseStandings("<html></html>")` → `[]` und `parseTeamPlayers("<html></html>")` → `[]` (kein Throw).

- [ ] **Step 3: Test laufen lassen** – `npm test` → die neuen Tests FAIL (Funktionen fehlen).

- [ ] **Step 4: Parser implementieren** in `src/lib/wtb.ts` mit den vorhandenen Helfern `textOf`/`decodeEntities`. Tabelle: die `<tr>` unter `<h2 …>Tabelle</h2>`, Zellen über `data-label` bzw. `class="team"`. Spieler: die Tabelle nach `<h3>Spieler`, Zellen in Reihenfolge Rang, LK, Name, Nation, Einzel, Doppel, Gesamt. LK: `/LK\s*(\d+)/` → Zahl, sonst `null`. Bilanz `"a:b"` → `{won: a, lost: b}`, unlesbar → `{0,0}`. Gruppen-Link: erster `href` mit `/gruppe/g/` → mit `WTB_BASE_URL` absolut machen.

- [ ] **Step 5: Prüfen** – `npm test` (alle grün), `npx tsc --noEmit -p .`, `npm run lint`.

- [ ] **Step 6: Commit** – `git add src/lib/wtb.ts src/lib/wtb.test.ts src/lib/fixtures .gitignore && git commit -m "WTB: Tabelle, Gruppen-Link und Spielerliste parsen"`

---

### Task 2: Fakten und Anzeige-Daten berechnen (reine Logik)

**Files:**
- Create: `src/lib/scouting.ts`, `src/lib/scouting.test.ts`

**Interfaces:**
- Consumes: `StandingRow`, `WtbPlayer` aus Task 1; `MatchView` aus `src/lib/matches.ts`.
- Produces (in `src/lib/scouting.ts`):
  ```ts
  export type Verdict = "vorne" | "offen" | "hinten";
  export type GroupSnapshot = { groupUrl: string; standings: StandingRow[]; teamPlayers: Record<string, WtbPlayer[]>; fetchedAt: Date }; // key = StandingRow.teamUrl
  export type PositionFact = { position: number; theirLk: number | null; theirAppearances: number; theirSingles: string; ourLk: number | null; verdict: Verdict | null };
  export type ScoutingFacts = {
    isHome: boolean; groupSize: number;
    opponent: { rank: number; points: string; matches: string; meetings: number };
    us: { rank: number; points: string; matches: string; meetings: number };
    opponentHasPlayed: boolean; ourLineupPublished: boolean; positions: PositionFact[];
  };
  export type OpponentPlayerView = { position: number; name: string; lk: number | null; appearances: number; singles: string; doubles: string };
  export type OpponentView = {
    standings: StandingRow[]; opponentTeamUrl: string; ourTeamUrl: string; players: OpponentPlayerView[];
    hasPlayed: boolean; assessment: string | null; fetchedAt: Date; groupUrl: string;
  };
  export function appearances(p: WtbPlayer): number;                         // singles.won + singles.lost
  export function likelyLineup(players: WtbPlayer[], needed: number): { position: number; player: WtbPlayer }[];
  export function compareLk(ours: number | null, theirs: number | null): Verdict | null;
  export function shortName(name: string): string;                           // "Sascha Müller" → "S. Müller"
  export function surnames(players: WtbPlayer[]): string[];                  // last word of each name
  export function findStanding(standings: StandingRow[], teamName: string): StandingRow | null;
  export function ourStanding(standings: StandingRow[], wtbTeamId: string): StandingRow | null;
  export function nextMatchIds(all: MatchView[], today: string): Set<number>;
  export function buildFacts(input: {
    match: MatchView; snapshot: GroupSnapshot; wtbTeamId: string;
    ourPublishedLks: (number | null)[] | null;   // Stamm in Meldelisten-Reihenfolge, schon Math.floor; null = nicht veröffentlicht
  }): ScoutingFacts | null;                       // null wenn Gegner oder wir nicht in der Tabelle
  export function factsHash(facts: ScoutingFacts): string;                   // sha256 hex von JSON.stringify
  export function opponentView(snapshot: GroupSnapshot, match: MatchView, wtbTeamId: string, assessment: string | null): OpponentView | null;
  ```

**Regeln, die die Tests festhalten:**
- `likelyLineup`: die `needed` Spieler mit den meisten Einzel-Einsätzen, bei Gleichstand der kleinere `rank`; haben weniger als `needed` gespielt, mit den nächsten nach `rank` auffüllen; Ergebnis nach `rank` sortiert, `position` = 1…n.
- `findStanding`: Vergleich nach `trim()` und zusammengezogenen Leerzeichen, sonst exakt.
- `buildFacts`: `positions` = `likelyLineup(gegner, match.playersNeeded)` gepaart mit unserer Seite: `ourPublishedLks` wenn nicht `null`, sonst `likelyLineup(eigene WTB-Spieler, playersNeeded)` mit deren `lk`. Gepaart wird nach Index; fehlt auf einer Seite ein Spieler (z. B. nur 3 veröffentlichte Stammspieler), ist dessen LK `null` und `verdict` `null`. `theirSingles` als `"won:lost"`. `opponentHasPlayed` = ein Gegner-Spieler hat `appearances > 0`.
- `opponentView.players`: Spieler mit `appearances + doubles.won + doubles.lost > 0`, nach `rank`; gibt es keine, die ersten `playersNeeded + 2` nach `rank`. `position` jeweils neu 1…n, `name` = `shortName`.

- [ ] **Step 1: Tests schreiben** in `src/lib/scouting.test.ts` (Spieler-Fabrik wie `row()` in `lineup-sim.test.ts`, `match()` wie dort):
  - `compareLk(13, 15)` → `"vorne"`; `compareLk(15, 13)` → `"hinten"`; `compareLk(14, 15)` → `"offen"`; `compareLk(null, 13)` → `null`.
  - `likelyLineup`: 6 Spieler mit Rang 5–10 (2. Mannschaft!), Einsätze `[0,3,3,1,0,2]`, `needed 4` → Ränge `[6,7,8,10]` mit `position [1,2,3,4]`.
  - `likelyLineup` ohne Einsätze → die ersten 4 Ränge.
  - `shortName("Sascha Müller")` → `"S. Müller"`; `shortName("Hans-Peter von Berg")` → `"H. von Berg"`; `shortName("Cher")` → `"Cher"`.
  - `findStanding` findet `"TC Musterstadt 1"` auch bei `"  TC  Musterstadt 1 "`, liefert `null` für `"TC Anderswo 1"`.
  - `nextMatchIds`: Team A Spiele am `2026-11-14` und `2026-11-28`, Team B am `2026-11-14`, `today = "2026-11-14"` → `{A1, B1}`; `today = "2026-11-15"` → `{A2}`.
  - `buildFacts` mit veröffentlichter Aufstellung `[11, 13, 16, 18]` gegen Gegner-LKs `[10, 13, 14, 20]` → Verdicts `["offen","offen","hinten","vorne"]`, `ourLineupPublished: true`.
  - `buildFacts` gibt `null`, wenn `match.opponent` nicht in `standings` steht.
  - `factsHash` gleich für gleiche Fakten, anders, wenn sich ein `ourLk` ändert.
  - `opponentView` vor dem ersten Spiel: `hasPlayed false`, `players.length === playersNeeded + 2`.

- [ ] **Step 2: Laufen lassen** – `npm test` → neue Tests FAIL.
- [ ] **Step 3: Implementieren** in `src/lib/scouting.ts` (nur reine Funktionen, kein DB-Import; Hash mit `createHash` aus `node:crypto`).
- [ ] **Step 4: Prüfen** – `npm test`, `npx tsc --noEmit -p .`, `npm run lint`.
- [ ] **Step 5: Commit** – `git add src/lib/scouting.ts src/lib/scouting.test.ts && git commit -m "Gegner-Übersicht: Fakten, wahrscheinliche Aufstellung, LK-Vergleich"`

---

### Task 3: Einschätzung von Claude

**Files:**
- Create: `src/lib/scouting-ai.ts`, `src/lib/scouting-ai.test.ts`

**Interfaces:**
- Consumes: `ScoutingFacts` aus Task 2.
- Produces:
  ```ts
  export function mentionsName(text: string, names: string[]): string | null;  // first hit, whole word, case-sensitive
  export class AssessmentError extends Error {}                                 // API/key problems — caller retries next run
  export async function writeAssessment(facts: ScoutingFacts, forbiddenNames: string[]): Promise<string | null>;
  // string = fertiger Text; null = zweimal einen Namen genannt (nicht erneut versuchen); throws AssessmentError bei API-Fehler / fehlendem Key
  ```

- [ ] **Step 1: Tests schreiben** – `mentionsName("Eher knapp, do isch was drin.", ["Knapp"])` → `null`; `mentionsName("Gegen Müller wird's schwer", ["Müller"])` → `"Müller"`; `mentionsName("Müllerstraße", ["Müller"])` → `null`.
- [ ] **Step 2: Laufen lassen** – FAIL.
- [ ] **Step 3: Implementieren** nach dem Muster von `src/lib/lineup-ai.ts`: `MODEL = "claude-sonnet-5-5"`, `client.beta.messages.create` mit `output_config: { effort: "medium", format: { type: "json_schema", schema } }` und Schema `{ text: string }` (required, `additionalProperties: false`), `max_tokens: 2000`, dieselben `betas`/`fallbacks` und dieselbe Fehlerbehandlung (Meldungen sinngemäß, Klasse `AssessmentError`). Kein Key → `AssessmentError`. Nachricht an Claude: `Fakten (JSON):\n${JSON.stringify(facts)}`. Nach der Antwort `mentionsName(text, forbiddenNames)`; bei Treffer ein zweiter Versuch mit Assistant-Antwort plus `"Bitte ohne Namen – nenne Spieler nur über ihre Position."`; nennt auch der einen Namen → `null`.

  Der `SYSTEM`-Prompt (deutsch) muss enthalten: Rolle (Einschätzung des nächsten Punktspiels für die eigene Mannschaft, Winterrunde); Erklärung der Felder von `ScoutingFacts` (niedrigere LK = stärker; `verdict` aus unserer Sicht; `opponentHasPlayed: false` → nur nach LK/Meldeliste, das offen sagen; `ourLineupPublished: false` → unsere Seite ist geschätzt); alle Ton-Regeln aus „Global Constraints“; „Nur Aussagen, die aus den Fakten folgen – nichts erfinden.“; Doppel nur allgemein erwähnen, es gibt dazu keine Daten.

- [ ] **Step 4: Prüfen** – `npm test`, `npx tsc --noEmit -p .`, `npm run lint`. (Kein echter API-Aufruf in Tests.)
- [ ] **Step 5: Commit** – `git add src/lib/scouting-ai.ts src/lib/scouting-ai.test.ts && git commit -m "Gegner-Übersicht: Einschätzung von Claude mit Namensprüfung"`

---

### Task 4: Tabellen und Speicher-Schicht

**Files:**
- Modify: `src/db/schema.ts`, `drizzle/manual-migrations.sql`
- Create: `src/lib/scouting-store.ts`

**Interfaces:**
- Consumes: Task 1–3; `getAllMatches` (`src/lib/matches.ts`), `getLineups` (`src/lib/lineups.ts`), `getRoster` (`src/lib/roster.ts`), `fetchWtb` + `WTB_BASE_URL` (`src/lib/wtb.ts`).
- Produces:
  ```ts
  export type RefreshResult = { team: string; ok: boolean; error?: string; opponentNotFound?: boolean; assessment?: "neu" | "unverändert" | "ohne Text" | "fehlgeschlagen" };
  export async function refreshAllScouting(opts: { dryRun: boolean }): Promise<RefreshResult[]>;
  export async function refreshMatchPreview(matchId: number): Promise<void>;   // after publish; swallow + log errors
  export async function getOpponentViews(matchIds: number[]): Promise<Map<number, OpponentView>>;
  ```

- [ ] **Step 1: Schema** in `src/db/schema.ts` (Abschnitt „Mannschaften / Winterspiele“), `jsonb` aus `drizzle-orm/pg-core` importieren:
  ```ts
  // Daily WTB snapshot per own team: the group table and every team's player list (keyed by team URL).
  export const wtbGroupSnapshots = pgTable("wtb_group_snapshots", {
    teamId: integer("team_id").primaryKey().references(() => teams.id),
    groupUrl: text("group_url").notNull(),
    standings: jsonb("standings").$type<StandingRow[]>().notNull(),
    teamPlayers: jsonb("team_players").$type<Record<string, WtbPlayer[]>>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  });
  // Claude's Einschätzung for a match, valid only while input_hash equals the hash of the current facts.
  export const matchPreviews = pgTable("match_previews", {
    matchId: integer("match_id").primaryKey().references(() => matches.id, { onDelete: "cascade" }),
    inputHash: text("input_hash").notNull(),
    text: text("text"), // null: Claude named a player twice — don't ask again for these facts
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```
  Dazu in `drizzle/manual-migrations.sql` ein Block `-- 2026-10-16: Gegner-Übersicht. Additive — two new tables only.` mit den passenden `CREATE TABLE IF NOT EXISTS` (Spalten, Typen, `REFERENCES`, `ON DELETE CASCADE` genau wie oben). **Nicht ausführen.**

- [ ] **Step 2: `refreshAllScouting` implementieren.** Pro Team aus `teams` (mit `wtbTeamId`), unabhängig per `Promise.allSettled`:
  1. eigene Mannschaftsseite holen (URL wie `teamUrl` in `scripts/import-wtb.ts`, `CLUB_ID = "20019"`) → `parseGroupUrl`; `null` → Fehler „Kein Gruppen-Link“;
  2. Gruppenseite holen → `parseStandings`; jede `teamUrl` der Tabelle holen → `parseTeamPlayers`, nacheinander mit 300 ms Pause;
  3. ohne `dryRun`: Schnappschuss upserten (`onConflictDoUpdate` auf `teamId`, `fetchedAt: new Date()`);
  4. für das nächste Spiel des Teams (`nextMatchIds` mit heutigem Datum über `formatDateForFile(new Date())` aus `src/lib/format.ts`) `updatePreview(match, snapshot)`.
  Schlägt Schritt 1 oder 2 fehl, bleibt der alte Schnappschuss; das Ergebnis des Teams ist `ok: false` mit Fehlermeldung.

  Interne Hilfe `updatePreview(match, snapshot, dryRun)`: `ourPublishedLks` aus `getLineups({ publishedOnly: true })` (Rolle `stamm`, `response !== "nein"`) sortiert nach Position in `getRoster()` derselben Altersklasse, `lk` → `Math.floor(Number(lk))` bzw. `null`; nur wenn `match.lineupPublishedAt` gesetzt ist, sonst `null`. `buildFacts` → `null` ⇒ `opponentNotFound`. Hash gleich dem gespeicherten ⇒ `"unverändert"`. Sonst `writeAssessment(facts, surnames(gegnerSpieler))`: String ⇒ upsert `{ inputHash, text }` (`"neu"`); `null` ⇒ upsert `{ inputHash, text: null }` (`"ohne Text"`); `AssessmentError` ⇒ nichts speichern (`"fehlgeschlagen"`). Im `dryRun` nur Fakten bauen, nichts speichern, kein Claude.

- [ ] **Step 3: `refreshMatchPreview(matchId)`** – Match + gespeicherten Schnappschuss seines Teams laden (kein WTB-Abruf), dann `updatePreview`. Fehler nur loggen.

- [ ] **Step 4: `getOpponentViews(matchIds)`** – Schnappschüsse und `match_previews` der Spiele laden; pro Spiel aktuelle Fakten bauen (wie oben) und `assessment` nur übergeben, wenn `factsHash(facts) === preview.inputHash`; dann `opponentView(...)`. Kein Schnappschuss oder Gegner nicht gefunden → Spiel fehlt in der Map.

- [ ] **Step 5: Prüfen** – `npx next typegen && npx tsc --noEmit -p .`, `npm test`, `npm run lint`.
- [ ] **Step 6: Commit** – `git add src/db/schema.ts drizzle/manual-migrations.sql src/lib/scouting-store.ts && git commit -m "Gegner-Übersicht: Tabellen und Speicher-Schicht"`

---

### Task 5: Cron und Auslöser beim Veröffentlichen

**Files:**
- Create: `src/app/api/cron/gegner/route.ts`
- Modify: `vercel.json`, `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts` (in `publishLineup`, nach dem `update(matches).set({ lineupPublishedAt … })`)

**Interfaces:**
- Consumes: `refreshAllScouting`, `refreshMatchPreview` aus Task 4.

- [ ] **Step 1: Route** nach dem Muster von `src/app/api/cron/erinnerungen/route.ts`: gleicher `CRON_SECRET`-Check, `?dryRun=1`, Antwort `{ teams: RefreshResult[] }`, Status 500 wenn ein Team `ok: false` hat.
- [ ] **Step 2: `vercel.json`** – dritter Eintrag `{ "path": "/api/cron/gegner", "schedule": "30 4 * * *" }`.
- [ ] **Step 3: `publishLineup`** – `after(() => refreshMatchPreview(matchId))` direkt nach dem Setzen von `lineupPublishedAt`, unabhängig vom E-Mail-Versand.
- [ ] **Step 4: Prüfen** – `npx next typegen && npx tsc --noEmit -p .`, `npm test`, `npm run lint`.
- [ ] **Step 5: Commit** – `git add src/app/api/cron/gegner vercel.json "src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts" && git commit -m "Gegner-Übersicht: täglicher Cron und Neuberechnung nach dem Veröffentlichen"`

---

### Task 6: Anzeige auf der Spielkarte

**Files:**
- Create: `src/components/OpponentSection.tsx`
- Modify: `src/components/MatchList.tsx`

**Interfaces:**
- Consumes: `OpponentView` (Task 2), `getOpponentViews` (Task 4), `nextMatchIds` (Task 2), `teamChipClasses`-Farben aus `MatchCard.tsx`.
- Produces: `export function OpponentSection({ view, ageClass }: { view: OpponentView; ageClass: AgeClass })`.

- [ ] **Step 1: `OpponentSection`** – drei Boxen im Stil `rounded-[14px] bg-[var(--color-tabs-bg)] px-3 py-2.5`, Überschriften klein in Großbuchstaben wie im Entwurf:
  1. „Tabelle“: alle `standings` mit Rang, Team, Punkte; Zeile `opponentTeamUrl` in `text-[var(--color-brand)] font-bold`, Zeile `ourTeamUrl` in `--color-herren`/`--color-h30` je `ageClass`.
  2. „So haben sie aufgestellt“ bzw. bei `!hasPlayed` „Noch keine Spiele – so sind sie gemeldet“: pro Spieler `position`, `name`, `LK {lk}` (fehlt → „LK –“), bei `hasPlayed` zusätzlich `{appearances}× · Einzel {singles}`.
  3. Nur wenn `assessment`: Box `bg-[var(--color-brand-bg)]`, Text mit fettem „Einschätzung:“ in `--color-brand`.
  Darunter `text-xs text-[var(--color-ink-muted)]`: „Stand: {formatDate(fetchedAt)} · Quelle: “ + Link „nuLiga“ auf `groupUrl` (`target="_blank" rel="noopener noreferrer"`).
- [ ] **Step 2: `MatchCard`** – neue optionale Prop `opponent?: React.ReactNode`, gerendert direkt **vor** dem Hallen-Block (`{venue && …}`), wie in der Spec verlangt. Sonst nichts an der Karte ändern.
- [ ] **Step 3: `MatchList`** – nur wenn `viewer`: `nextMatchIds(allMatches, today)` und danach `getOpponentViews([...ids])` laden; an `MatchCard` `opponent={<OpponentSection …/>}` übergeben, wenn eine View existiert.
- [ ] **Step 4: Prüfen** – `npx next typegen && npx tsc --noEmit -p .`, `npm test`, `npm run lint`.
- [ ] **Step 5: Commit** – `git add src/components/OpponentSection.tsx src/components/MatchList.tsx src/components/MatchCard.tsx && git commit -m "Gegner-Übersicht auf der Karte des nächsten Spiels"`

---

### Task 7: Live bringen (Hauptsession, mit Pablo)

- [ ] **Step 1:** Pablo das SQL aus `drizzle/manual-migrations.sql` (Block 2026-10-16) zeigen und **auf sein ausdrückliches OK warten**. Dann ausführen wie am 2026-10-09: `npx dotenv -e .env.local -- node -e` mit `@neondatabase/serverless` aus dem Haupt-Checkout. Vor dem Merge, weil die Preview dieselbe DB nutzt.
- [ ] **Step 2:** Branch pushen, PR öffnen. Die Vercel-Preview muss „Ready“ sein (das ist der Build-Check).
- [ ] **Step 3:** Preview-Cron einmal als `?dryRun=1` mit `CRON_SECRET` aufrufen; erwartet: vier Teams `ok: true`, kein `opponentNotFound`.
- [ ] **Step 4:** Nach Pablos OK den Cron einmal ohne `dryRun` auslösen (schreibt Schnappschüsse und ruft Claude: ein paar Cent). Danach die Punktspiele-Seite der Preview mit Pablos Link nur **ansehen** (Handy-Breite, dunkler Modus): vier Karten mit Tabelle, „Noch keine Spiele – so sind sie gemeldet“ und Einschätzung.
- [ ] **Step 5:** Merge nach Pablos OK; Produktion deployt per Git. Der Cron läuft ab dann täglich um 04:30 UTC.
