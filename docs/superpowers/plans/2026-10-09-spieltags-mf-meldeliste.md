# Spieltags-Mannschaftsführer und Meldeliste am Spiel – Implementation Plan

**Goal:** (1) Die vier Mannschaftsführer (Seb, Patrick, Yassin, Pablo) können für ein einzelnes Spiel einen aufgestellten Spieler als „Mannschaftsführer am Spieltag“ eintragen, wenn sie selbst nicht spielen. (2) An jedem Spiel hängt die Meldeliste der Altersklasse (Inhalt der beiden WTB-PDFs „Herren“ und „Herren 30“), sichtbar für die Mannschaftsführer und den Spieltags-Mannschaftsführer dieses Spiels.

**Entscheidungen (mit Pablo geklärt, 2026-10-09):**

- Der Spieltags-MF bekommt **nur Anzeige + Infos**: Er wird am Spiel angezeigt, bekommt die Absage-Mails und sieht die Meldeliste. Aufstellen und veröffentlichen können weiterhin nur die vier Mannschaftsführer.
- Wählbar ist **nur, wer für dieses Spiel aufgestellt ist** (Stamm oder Ersatz, nicht abgesagt). Wird er aus der Aufstellung entfernt, fällt die Rolle zurück an den Mannschaftsführer des Teams.
- „Anmeldeliste“ = die namentliche Mannschaftsmeldung (Meldeliste), die beiden WTB-PDFs „Herren“ und „Herren 30“.

**Vorschlag, von Pablo noch nicht bestätigt:** Die Meldeliste wird in der App aus den vorhandenen Daten gezeigt (`roster_entries` + offizielle Namen aus `data/meldeliste.json`), nicht als PDF-Datei – die PDFs enthalten Telefonnummern und Mailadressen der Mannschaftsführer und veralten beim nächsten Import. Alternative: die Original-PDFs über eine Route ausliefern, die den persönlichen Link prüft (nie über `public/`).

**Architecture:** Eine nullable Spalte `matches.match_captain_player_id`. Lesen über `getMatchCaptains()` in `src/lib/match-captain.ts` (eigene Abfrage, `MatchView` bleibt unverändert), dazu die reine Regel `activeMatchCaptain` mit Unit-Test. Server-Action `setMatchCaptain` neben den Aufstellungs-Actions. Neue Seite `/spieler/[token]/punktspiele/meldeliste/[matchId]`. `LineupLine` zeigt den Spieltags-MF und den Link zur Meldeliste.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle ORM auf Neon (`drizzle-orm/neon-http`), Tailwind v4, Tests mit `node:test` über `tsx` (`npm test`).

## Global Constraints

- **Arbeitsverzeichnis:** `/Users/pablovallendor/Developer/rotationsplan-tennis/.claude/worktrees/spieltags-mf-meldeliste` (Branch `claude/spieltags-mf-meldeliste`). Die Shell springt nach jedem Befehl zurück – **jeden** Befehl mit `cd /Users/pablovallendor/Developer/rotationsplan-tennis/.claude/worktrees/spieltags-mf-meldeliste && …` beginnen. Dateien nur unter diesem Pfad ändern.
- **Keine Datenbank:** nie `npm run db:push`, nie `npm run dev`, nie ein Skript aus `scripts/` starten, kein `ALTER`. Die Spalte legt Pablo in Produktion von Hand an.
- **Kein Git:** nichts committen, nichts pushen, keinen Branch wechseln.
- Dies ist **nicht** das Next.js aus dem Trainingswissen (siehe `AGENTS.md`). Keine neuen Next-APIs erfinden – nur die Muster verwenden, die in diesem Plan und in den Nachbardateien stehen.
- Code genau wie im Plan übernehmen. Nichts umbenennen, nichts „aufräumen“, keine weiteren Dateien anfassen.
- Texte in der Oberfläche auf Deutsch, Farben nur über `var(--color-…)`.
- Prüfen nach jedem Task: `npx next typegen && npx tsc --noEmit -p .` (ohne `typegen` fehlen die `PageProps`-Typen), `npm test` (vorher 72 grün), `npm run lint` (vorher ohne Meldungen).

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/db/schema.ts` (ändern) | Spalte `matchCaptainPlayerId` |
| `drizzle/manual-migrations.sql` (ändern) | `ALTER TABLE` als Protokoll |
| `src/lib/match-captain.ts` (neu) | `getMatchCaptains`, `activeMatchCaptain` |
| `src/lib/match-captain.test.ts` (neu) | Tests für `activeMatchCaptain` |
| `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts` (ändern) | `setMatchCaptain`; Entfernen räumt auf; Hinweis in der Aufstellungs-Mail |
| `src/app/spieler/[token]/punktspiele/actions.ts` (ändern) | Absage-Mails auch an den Spieltags-MF |
| `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx` (ändern) | Auswahl „Mannschaftsführer am Spieltag“, Link zur Meldeliste |
| `src/lib/roster.ts` (ändern) | `wtbId` in `RosterRow` |
| `src/lib/meldeliste.ts` (neu) | offizielle Namen aus `data/meldeliste.json` |
| `src/lib/meldeliste.test.ts` (neu) | Tests für `officialName` |
| `src/app/spieler/[token]/punktspiele/meldeliste/[matchId]/page.tsx` (neu) | Meldeliste zum Spiel |
| `src/components/LineupLine.tsx` (ändern) | Spieltags-MF und Link „Meldeliste ansehen“ |
| `src/components/MatchList.tsx`, `src/app/spieler/[token]/page.tsx` (ändern) | reichen die Daten an `LineupLine` durch |

---

# Teil A – Spieltags-Mannschaftsführer (Tasks 1–5)

### Task 1: Spalte im Schema

**`src/db/schema.ts`** – in `export const matches = pgTable("matches", {…})` direkt nach der Zeile `scheduleVersion: smallint("schedule_version").notNull().default(0),` einfügen:

```ts
  // Spieltags-Mannschaftsführer: a lined-up player who stands in when the team's Mannschaftsführer doesn't play.
  // Display and alerts only — lining up and publishing stay with teams.captainPlayerId.
  matchCaptainPlayerId: integer("match_captain_player_id").references(() => players.id),
```

**`drizzle/manual-migrations.sql`** – ans Dateiende anhängen (mit einer Leerzeile davor):

```sql
-- 2026-10-09: Spieltags-Mannschaftsführer. Additive — one nullable column.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_captain_player_id integer REFERENCES players(id);
```

### Task 2: `src/lib/match-captain.ts` mit Test

**Neu: `src/lib/match-captain.ts`**

```ts
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { matches, players } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { LineupEntry } from "@/lib/lineups";

export type MatchCaptain = { playerId: number; name: string };

/** Spieltags-Mannschaftsführer keyed by match id — only for matches where one is set. */
export async function getMatchCaptains(): Promise<Map<number, MatchCaptain>> {
  const rows = await getDb()
    .select({
      matchId: matches.id,
      playerId: players.id,
      displayName: players.displayName,
      nickname: players.nickname,
    })
    .from(matches)
    .innerJoin(players, eq(matches.matchCaptainPlayerId, players.id));
  return new Map(rows.map((r) => [r.matchId, { playerId: r.playerId, name: playerLabel(r) }]));
}

/**
 * The Spieltags-Mannschaftsführer as far as `entries` show: only someone who is in that lineup and hasn't cancelled.
 * Pass the published entries for anything players see.
 */
export function activeMatchCaptain(
  captain: MatchCaptain | null | undefined,
  entries: Pick<LineupEntry, "playerId" | "response">[],
): MatchCaptain | null {
  if (!captain) return null;
  const entry = entries.find((e) => e.playerId === captain.playerId);
  return entry && entry.response !== "nein" ? captain : null;
}
```

**Neu: `src/lib/match-captain.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMatchCaptain } from "./match-captain";

const captain = { playerId: 7, name: "P7" };

test("the Spieltags-Mannschaftsführer counts while he is in the lineup", () => {
  assert.deepEqual(activeMatchCaptain(captain, [{ playerId: 7, response: null }]), captain);
  assert.deepEqual(activeMatchCaptain(captain, [{ playerId: 7, response: "ja" }]), captain);
});

test("not in the (published) lineup, or cancelled: nobody", () => {
  assert.equal(activeMatchCaptain(captain, [{ playerId: 3, response: "ja" }]), null);
  assert.equal(activeMatchCaptain(captain, [{ playerId: 7, response: "nein" }]), null);
});

test("no Spieltags-Mannschaftsführer set", () => {
  assert.equal(activeMatchCaptain(null, [{ playerId: 7, response: "ja" }]), null);
  assert.equal(activeMatchCaptain(undefined, []), null);
});
```

Prüfen: `npm test` → 75 grün.

### Task 3: Actions der Aufstellungsseite

Datei: `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts`

**3a – Import** nach der Zeile `import { canMark, markStatement, unmarkStatement } from "@/lib/marks";`:

```ts
import { getMatchCaptains } from "@/lib/match-captain";
```

**3b – `removeFromLineup`:** Direkt nach dem Block

```ts
  const [removed] = await getDb()
    .delete(lineups)
    .where(and(eq(lineups.matchId, matchId), eq(lineups.playerId, playerId)))
    .returning();
```

einfügen:

```ts
  // Out of the lineup means no longer Spieltags-Mannschaftsführer — the role falls back to the team's captain.
  await getDb()
    .update(matches)
    .set({ matchCaptainPlayerId: null })
    .where(and(eq(matches.id, matchId), eq(matches.matchCaptainPlayerId, playerId)));
```

**3c – neue Action** direkt vor `export type PublishPreview = {`:

```ts
/**
 * Sets the Spieltags-Mannschaftsführer (a lined-up player who stands in for the team's Mannschaftsführer), or clears
 * it with an empty playerId. They only see more and hear about Absagen — lining up stays with the team's captain.
 */
export async function setMatchCaptain(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const raw = String(formData.get("playerId") ?? "");
  const playerId = raw ? Number(raw) : null;

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann das ändern." };
  const { match } = ctx;

  const db = getDb();
  if (playerId === null) {
    await db.update(matches).set({ matchCaptainPlayerId: null }).where(eq(matches.id, matchId));
    refresh();
    return;
  }

  const entry = ((await getLineups()).get(matchId) ?? []).find((e) => e.playerId === playerId);
  if (!entry) return { error: "Nur wer für dieses Spiel aufgestellt ist, kann Mannschaftsführer am Spieltag sein." };
  if (entry.response === "nein") return { error: `${entry.name} hat für dieses Spiel abgesagt.` };

  // Only an actual change returns a row, so saving the same choice twice doesn't email twice.
  const changed = await db
    .update(matches)
    .set({ matchCaptainPlayerId: playerId })
    .where(and(eq(matches.id, matchId), sql`${matches.matchCaptainPlayerId} is distinct from ${playerId}`))
    .returning({ id: matches.id });
  refresh();

  // Told right away only if they already know they play; otherwise the publish email says it.
  if (changed.length > 0 && entry.published) {
    const baseUrl = await getBaseUrl();
    const from = process.env.MAIL_FROM;
    after(async () => {
      const [p] = await getDb().select().from(players).where(eq(players.id, playerId)).limit(1);
      if (!p?.email || !from) return;
      const result = await sendNotice(
        {
          to: p.email,
          playerName: playerLabel(p),
          subject: `Du bist Mannschaftsführer: ${match.team.name} am ${formatDayShort(match.startsAt)}`,
          line: `Du bist am Spieltag Mannschaftsführer für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}. Die Meldeliste findest du in der App.`,
          detail: describe(match),
          cta: { url: `${baseUrl}/spieler/${p.token}/punktspiele/meldeliste/${match.id}`, label: "Meldeliste öffnen" },
          token: p.token,
          baseUrl,
        },
        { from, replyTo: process.env.REPLY_TO },
      );
      if (result.error) console.error(`Mannschaftsführer-Mail an ${p.email} fehlgeschlagen: ${result.error}`);
    });
  }
}
```

**3d – `publishLineup`:** Die Zeile `const stammNames = entries.filter((e) => e.role === "stamm").map((e) => e.name);` bleibt; direkt danach einfügen:

```ts
  const matchCaptainId = (await getMatchCaptains()).get(matchId)?.playerId ?? null;
```

Und im `sendNotice`-Aufruf von `publishLineup` den `line:`-Wert ersetzen. Alt:

```ts
            line:
              entry.role === "stamm"
                ? `Du bist aufgestellt für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}.`
                : `Du bist Ersatz für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent} – bitte halt dir den Termin frei.`,
```

Neu:

```ts
            line:
              (entry.role === "stamm"
                ? `Du bist aufgestellt für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}.`
                : `Du bist Ersatz für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent} – bitte halt dir den Termin frei.`) +
              (p.id === matchCaptainId ? " Du bist an dem Tag auch Mannschaftsführer – die Meldeliste findest du in der App." : ""),
```

### Task 4: Absage-Mails auch an den Spieltags-MF

Datei: `src/app/spieler/[token]/punktspiele/actions.ts`, Funktion `respondToLineup`.

**4a –** In der Abfrage die Zeile

```ts
    .select({ role: lineups.role, response: lineups.response, captainId: teams.captainPlayerId, published: lineups.publishedAt })
```

ersetzen durch:

```ts
    .select({
      role: lineups.role,
      response: lineups.response,
      captainId: teams.captainPlayerId,
      matchCaptainId: matches.matchCaptainPlayerId,
      published: lineups.publishedAt,
    })
```

**4b –** Den Block

```ts
  if (alerts.captain && row.captainId && row.captainId !== player.id) {
    const line = CAPTAIN_LINES[alerts.captain](name);
    await notify([row.captainId], matchId, `${match.teamName} am ${formatDayShort(match.startsAt)}: ${line}`, () => line, detail, {
      path: (p) => `/spieler/${p.token}/mannschaftsfuehrer/spiel/${matchId}`,
      label: "Aufstellung öffnen",
    });
  }
```

ersetzen durch:

```ts
  if (alerts.captain) {
    const line = CAPTAIN_LINES[alerts.captain](name);
    const subject = `${match.teamName} am ${formatDayShort(match.startsAt)}: ${line}`;
    if (row.captainId && row.captainId !== player.id) {
      await notify([row.captainId], matchId, subject, () => line, detail, {
        path: (p) => `/spieler/${p.token}/mannschaftsfuehrer/spiel/${matchId}`,
        label: "Aufstellung öffnen",
      });
    }
    // The Spieltags-Mannschaftsführer hears it too, but can't change the lineup — the link goes to the match card.
    const dayCaptainId = row.matchCaptainId;
    if (
      dayCaptainId &&
      dayCaptainId !== player.id &&
      dayCaptainId !== row.captainId &&
      lineupNow.some((e) => e.playerId === dayCaptainId && e.response !== "nein")
    ) {
      await notify([dayCaptainId], matchId, subject, () => line, detail, {
        path: (p) => `/spieler/${p.token}/punktspiele#spiel-${matchId}`,
        label: "Spiel ansehen",
      });
    }
  }
```

### Task 5: Auswahl auf der Aufstellungsseite

Datei: `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx`

**5a – Imports.**

- `import { formatDayShort, formatTime } from "@/lib/format";` → `import { formatDayShort, formatTime, playerLabel } from "@/lib/format";`
- `import { addToLineup, removeFromLineup, markPlayer, unmarkPlayer } from "./actions";` → `import { addToLineup, removeFromLineup, markPlayer, unmarkPlayer, setMatchCaptain } from "./actions";`
- neue Zeile nach dem `@/lib/marks`-Import: `import { getMatchCaptains } from "@/lib/match-captain";`

**5b – Daten laden.** Das `Promise.all` oben in `LineupPage` bekommt einen siebten Eintrag:

```ts
  const [allMatches, teamList, roster, lineupsByMatch, answers, marksByMatch, matchCaptains] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getLineups(),
    getAvailability(),
    getMarks(),
    getMatchCaptains(),
  ]);
```

**5c – Berechnung.** Direkt vor der Zeile `const sameDay: SameDayMatch[] = allMatches` einfügen:

```ts
  // Spieltags-Mannschaftsführer: someone from the lineup who stands in when the captain doesn't play that day.
  const matchCaptain = matchCaptains.get(matchId) ?? null;
  if (matchCaptain && lineup.some((e) => e.playerId === matchCaptain.playerId && e.response === "nein")) {
    warnings.unshift(
      `${matchCaptain.name} ist Mannschaftsführer am Spieltag, hat aber abgesagt – bitte jemand anderen eintragen.`,
    );
  }
  const matchCaptainOptions = [...stamm, ...ersatz].filter(
    (e) => e.playerId !== captain.id && (e.response !== "nein" || e.playerId === matchCaptain?.playerId),
  );
```

**5d – Block in der Aufstellungs-Karte.** Direkt vor `{warnings.map((w) => (` einfügen:

```tsx
        {lineup.length > 0 && (
          <div className="mb-3 rounded-[10px] border border-[var(--color-border)] px-3 py-2.5">
            <p className="text-xs font-semibold">Mannschaftsführer am Spieltag</p>
            <p className="mb-2 text-[11px] text-[var(--color-ink-muted)]">
              Spielst du selbst nicht mit? Dann trag jemanden aus der Aufstellung ein. Er sieht die Meldeliste und
              bekommt die Absagen – aufstellen und veröffentlichen kannst weiterhin nur du.
            </p>
            <ActionForm action={setMatchCaptain} hidden={hidden} className="flex flex-wrap items-center gap-2">
              <select
                key={matchCaptain?.playerId ?? "self"}
                name="playerId"
                defaultValue={matchCaptain?.playerId ?? ""}
                aria-label="Mannschaftsführer am Spieltag"
                className="min-w-0 flex-1 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-2.5 py-2 text-base"
              >
                <option value="">{`${playerLabel(captain)} (Mannschaftsführer)`}</option>
                {matchCaptainOptions.map((e) => (
                  <option key={e.playerId} value={e.playerId}>
                    {`${e.name}${e.role === "ersatz" ? " (Ersatz)" : ""}${e.response === "nein" ? " – abgesagt" : ""}`}
                  </option>
                ))}
              </select>
              <SubmitButton className={`${smallButton} bg-[var(--color-brand)] text-white`}>Speichern</SubmitButton>
            </ActionForm>
          </div>
        )}
```

**5e – Kennzeichnung in der Zeile.** In `function LineupRow`:

- Parameter und Typ um `matchCaptain` erweitern: in der Destrukturierung nach `unpublished = false,` die Zeile `matchCaptain = false,` einfügen; im Typ nach `unpublished?: boolean;` die Zeilen

  ```ts
    /** This player is the Spieltags-Mannschaftsführer. */
    matchCaptain?: boolean;
  ```

- Im JSX direkt nach `{entry.lists}` einfügen:

  ```tsx
          {matchCaptain && <span className="font-semibold text-[var(--color-brand)]"> · MF am Spieltag</span>}
  ```

- Beide Aufrufe `<LineupRow … />` (Stamm und Ersatz) bekommen zusätzlich die Prop `matchCaptain={e.playerId === matchCaptain?.playerId}`.

**Prüfen (Ende Teil A):** `npx next typegen && npx tsc --noEmit -p .`, `npm test` (75 grün), `npm run lint`.

---

# Teil B – Meldeliste am Spiel (Tasks 6–8)

### Task 6: Offizielle Namen

**`src/lib/roster.ts`**

- In `export type RosterRow` nach `playerId: number;` einfügen: `wtbId: string | null;`
- In `getRoster()` im `.select({…})` nach `playerId: players.id,` einfügen: `wtbId: players.wtbId,`
- Im `rows.map((r) => ({…}))` nach `playerId: r.playerId,` einfügen: `wtbId: r.wtbId,`

**Neu: `src/lib/meldeliste.ts`**

```ts
import file from "../../data/meldeliste.json";

type Entry = { firstName: string; lastName: string; wtbId: string };

// "Nachname, Vorname" exactly as the WTB lists it — the app shows nicknames, the Spielbericht wants these.
const OFFICIAL_NAMES = new Map<string, string>(
  [...file.lists.herren, ...file.lists.h30].map((e: Entry) => [e.wtbId, `${e.lastName}, ${e.firstName}`]),
);

/** Which namentliche Mannschaftsmeldung the app's roster was imported from. */
export const MELDELISTE_SOURCE: string = file.source;

/** A player's name as on the namentliche Mannschaftsmeldung; the app name for anyone the file doesn't know. */
export function officialName(wtbId: string | null, fallback: string): string {
  return (wtbId && OFFICIAL_NAMES.get(wtbId)) || fallback;
}
```

**Neu: `src/lib/meldeliste.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { officialName, MELDELISTE_SOURCE } from "./meldeliste";

test("officialName: the WTB spelling by ID-Nummer", () => {
  assert.equal(officialName("18152806", "Seb"), "Hesse, Sebastian");
  assert.equal(officialName("19662285", "Pablo"), "Vallendor, Pablo");
});

test("officialName: the app name when the list doesn't know the player", () => {
  assert.equal(officialName(null, "Gast"), "Gast");
  assert.equal(officialName("00000000", "Gast"), "Gast");
});

test("the source names the Mannschaftsmeldung", () => {
  assert.match(MELDELISTE_SOURCE, /Namentliche Mannschaftsmeldung/);
});
```

Prüfen: `npm test` → 78 grün.

### Task 7: Seite „Meldeliste“

**Neu: `src/app/spieler/[token]/punktspiele/meldeliste/[matchId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerByToken } from "@/lib/queries";
import { getAllMatches, getTeams } from "@/lib/matches";
import { getRoster } from "@/lib/roster";
import { getLineups } from "@/lib/lineups";
import { getMatchCaptains } from "@/lib/match-captain";
import { officialName, MELDELISTE_SOURCE } from "@/lib/meldeliste";
import { AGE_CLASS_LABEL, FIXED_POSITIONS } from "@/lib/eligibility";
import { formatDayShort, formatTime } from "@/lib/format";
import { TeamChip } from "@/components/MatchCard";
import { ArrowLeftIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MeldelistePage({
  params,
}: PageProps<"/spieler/[token]/punktspiele/meldeliste/[matchId]">) {
  const { token, matchId: matchIdParam } = await params;
  const matchId = Number(matchIdParam);
  const player = await getPlayerByToken(token);
  if (!player) notFound();

  const [allMatches, teamList, roster, matchCaptains] = await Promise.all([
    getAllMatches(),
    getTeams(),
    getRoster(),
    getMatchCaptains(),
  ]);
  const match = allMatches.find((m) => m.id === matchId);
  if (!match) notFound();

  // Only the Mannschaftsführer and this match's Spieltags-Mannschaftsführer — the list carries WTB ID numbers.
  const isCaptain = teamList.some((t) => t.captainPlayerId === player.id);
  const ownTeam = teamList.some((t) => t.id === match.team.id && t.captainPlayerId === player.id);
  if (!isCaptain && matchCaptains.get(matchId)?.playerId !== player.id) notFound();

  // The team's own Mannschaftsführer sees the lineup as planned; everyone else only what is published.
  const entries = ((await getLineups({ publishedOnly: !ownTeam })).get(matchId) ?? []).filter((e) => e.response !== "nein");
  const list = roster.filter((r) => r.ageClass === match.team.ageClass);
  const stammIds = new Set(entries.filter((e) => e.role === "stamm").map((e) => e.playerId));
  const ersatzIds = new Set(entries.filter((e) => e.role === "ersatz").map((e) => e.playerId));
  // Singles are played in Meldeliste order (§ 33b Ziff. 1): number the starters as the list runs.
  const singles = new Map<number, number>();
  for (const r of list) if (stammIds.has(r.playerId)) singles.set(r.playerId, singles.size + 1);
  const listed = new Set(list.map((r) => r.playerId));
  const offList = entries.filter((e) => !listed.has(e.playerId));

  return (
    <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
      <Link
        href={ownTeam ? `/spieler/${token}/mannschaftsfuehrer/spiel/${matchId}` : `/spieler/${token}/punktspiele#spiel-${matchId}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        {ownTeam ? "Zur Aufstellung" : "Zu den Winterspielen"}
      </Link>

      <header className="my-4">
        <TeamChip name={match.team.name} ageClass={match.team.ageClass} />
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight">
          Meldeliste {AGE_CLASS_LABEL[match.team.ageClass]}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {formatDayShort(match.startsAt)} · {formatTime(match.startsAt)} Uhr · {match.isHome ? "gegen" : "bei"}{" "}
          {match.opponent}
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          {MELDELISTE_SOURCE}. Plätze 1–{FIXED_POSITIONS} sind fest in der 1. Mannschaft. Die Einzel werden in der
          Reihenfolge der Liste gespielt.
        </p>
      </header>

      <ol className="divide-y divide-[var(--color-border)] rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 text-sm">
        {list.map((r) => {
          const single = singles.get(r.playerId);
          const ersatz = ersatzIds.has(r.playerId);
          return (
            <li key={r.playerId} className="flex items-center gap-2 py-2">
              <span className="w-6 shrink-0 text-right text-xs font-semibold text-[var(--color-ink-faint)]">
                {r.position}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${single || ersatz ? "font-semibold" : ""}`}>
                  {officialName(r.wtbId, r.name)}
                  {r.nationality ? ` (${r.nationality})` : ""}
                </span>
                <span className="flex flex-wrap gap-x-2 text-[11px] text-[var(--color-ink-muted)]">
                  {r.wtbId && <span>ID {r.wtbId}</span>}
                  {r.lk && <span>LK {r.lk.replace(".", ",")}</span>}
                  {!r.countsAsGerman && <span className="text-[var(--color-h30)]">zählt als Nicht-Deutscher</span>}
                </span>
              </span>
              {single ? (
                <span className="shrink-0 rounded-full bg-[var(--color-ja-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ja)]">
                  Einzel {single}
                </span>
              ) : ersatz ? (
                <span className="shrink-0 rounded-full bg-[var(--color-vielleicht-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-vielleicht)]">
                  Ersatz
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {offList.length > 0 && (
        <p className="mt-3 text-xs text-[var(--color-h30)]">
          Aufgestellt, aber nicht auf dieser Liste: {offList.map((e) => e.name).join(", ")} – spielberechtigt nur, wenn
          sie in der Wintermeldung stehen.
        </p>
      )}
    </main>
  );
}
```

### Task 8: Anzeige und Links

**8a – `src/components/LineupLine.tsx`**

- Imports ergänzen (oben, vor dem ersten `import type`):

  ```ts
  import Link from "next/link";
  ```

  und nach `import type { LineupEntry } from "@/lib/lineups";`:

  ```ts
  import { activeMatchCaptain, type MatchCaptain } from "@/lib/match-captain";
  ```

- Props erweitern. Alt:

  ```tsx
  export function LineupLine({
    match,
    entries,
    viewer,
  }: {
    match: MatchView;
    entries: LineupEntry[];
    viewer: { token: string; playerId: number } | null;
  }) {
  ```

  Neu:

  ```tsx
  export function LineupLine({
    match,
    entries,
    viewer,
    matchCaptain = null,
    showMeldeliste = false,
  }: {
    match: MatchView;
    entries: LineupEntry[];
    viewer: { token: string; playerId: number } | null;
    /** The Spieltags-Mannschaftsführer, if one is set; shown only while they're in the published lineup. */
    matchCaptain?: MatchCaptain | null;
    /** The viewer is a Mannschaftsführer and may open the Meldeliste for any match. */
    showMeldeliste?: boolean;
  }) {
  ```

- Nach der Zeile `const someoneMissing = stamm.some((e) => e.response === "nein");` einfügen:

  ```ts
    const dayCaptain = activeMatchCaptain(matchCaptain, entries);
    const iAmDayCaptain = dayCaptain?.playerId === viewer.playerId;
  ```

- Im JSX direkt nach dem schließenden `</p>` des Absatzes mit `<span className="font-semibold">Aufstellung:</span>` (also vor `{mine && labels && (`) einfügen:

  ```tsx
        {dayCaptain && (
          <p className="mt-1">
            <span className="font-semibold">Mannschaftsführer am Spieltag:</span> {iAmDayCaptain ? "du" : dayCaptain.name}
          </p>
        )}
        {(iAmDayCaptain || showMeldeliste) && (
          <Link
            href={`/spieler/${viewer.token}/punktspiele/meldeliste/${match.id}`}
            className="mt-1 inline-block text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
          >
            Meldeliste ansehen ›
          </Link>
        )}
  ```

**8b – `src/components/MatchList.tsx`**

- Import: `import { getMatchCaptains } from "@/lib/match-captain";`
- Das `Promise.all` bekommt einen fünften Eintrag `getMatchCaptains()`, die Destrukturierung entsprechend `matchCaptains`:

  ```ts
    const [allMatches, teamList, ridesByMatch, lineupsByMatch, matchCaptains] = await Promise.all([
      getAllMatches(),
      getTeams(),
      getRidesByMatch(),
      getLineups({ publishedOnly: true }),
      getMatchCaptains(),
    ]);
  ```

- Nach `const selected = …` einfügen:

  ```ts
    const viewerIsCaptain = viewer ? teamList.some((t) => t.captainPlayerId === viewer.playerId) : false;
  ```

- Den Aufruf `<LineupLine match={m} entries={lineupsByMatch.get(m.id) ?? []} viewer={viewer} />` ersetzen durch:

  ```tsx
                      <LineupLine
                        match={m}
                        entries={lineupsByMatch.get(m.id) ?? []}
                        viewer={viewer}
                        matchCaptain={matchCaptains.get(m.id)}
                        showMeldeliste={viewerIsCaptain}
                      />
  ```

**8c – `src/app/spieler/[token]/page.tsx`**

- Import: `import { getMatchCaptains } from "@/lib/match-captain";`
- Das `Promise.all` am Anfang von `PlayerPage` (`const [schedule, teamList, allMatches, roster, answers, lineupsByMatch] = await Promise.all([…])`) bekommt als letzten Eintrag `getMatchCaptains(),` und in der Destrukturierung `matchCaptains` als letzten Namen.
- Den Aufruf `<LineupLine match={m} entries={lineupsByMatch.get(m.id) ?? []} viewer={{ token, playerId: player.id }} />` ersetzen durch:

  ```tsx
                  <LineupLine
                    match={m}
                    entries={lineupsByMatch.get(m.id) ?? []}
                    viewer={{ token, playerId: player.id }}
                    matchCaptain={matchCaptains.get(m.id)}
                    showMeldeliste={captainOf.length > 0}
                  />
  ```

**8d – Link auf der Aufstellungsseite** (`src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/page.tsx`)

- `AGE_CLASS_LABEL` in den bestehenden Import aus `@/lib/eligibility` aufnehmen.
- Im `<header className="my-4">` direkt nach dem `<p className="text-sm text-[var(--color-ink-muted)]">…</p>` einfügen:

  ```tsx
          <Link
            href={`/spieler/${token}/punktspiele/meldeliste/${matchId}`}
            className="mt-2 inline-block text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
          >
            Meldeliste {AGE_CLASS_LABEL[match.team.ageClass]} ansehen ›
          </Link>
  ```

**Prüfen (Ende Teil B):** `npx next typegen && npx tsc --noEmit -p .`, `npm test` (78 grün), `npm run lint`.

---

## Rollout (nicht Teil der Umsetzung – macht Opus mit Pablos OK)

1. `ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_captain_player_id integer REFERENCES players(id);` in Produktion ausführen – **vor** dem Merge. Der neue Code fragt die Spalte auf der Aufstellungsseite, in der Spielliste und auf der Spielerseite ab; ohne Spalte laufen diese Seiten auf Fehler. Die Spalte ist nullable, der alte Code merkt nichts davon.
2. Lokal nur Seiten laden (die lokale DB ist Produktion), nichts speichern.
3. PR, Squash-Merge nach `main` → Vercel deployt automatisch.
