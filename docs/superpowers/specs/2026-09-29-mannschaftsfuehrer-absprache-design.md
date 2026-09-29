# Absprache zwischen Mannschaftsführern: Vormerken, Konflikte, Einsätze

Stand: 29.09.2026 · mit Pablo abgestimmt

## Problem

Viele Spieler kommen für mehrere Mannschaften in Frage (z. B. Motzi für Herren I, Herren II, Herren 30 I und II).
Heute gilt beim Aufstellen „wer zuerst aufstellt, bekommt ihn“: Wer bei einem Team am selben Tag aufgestellt ist
(Stamm oder Ersatz), ist für die anderen gesperrt, und die anderen Mannschaftsführer merken das erst auf ihrer
eigenen Seite. Es gibt keinen Weg zu sagen „den hätte ich auch gern“, keinen Überblick über die anderen Teams des
Tages auf der Aufstellungsseite und keine Zahlen, wie oft ein Spieler schon wo eingeplant ist.

## Grundsatz

Keine feste Rangfolge zwischen den Mannschaften – weder Herren I vor Herren II noch Herren vor Herren 30. Die
Mannschaftsführer sprechen sich ab; die App macht Wünsche und Konflikte sichtbar und öffnet mit einem Tipp einen
WhatsApp-Chat. Die Einigung selbst passiert außerhalb der App. Wer den Spieler am Ende aufstellt, hat ihn (die
bestehende Sperre am selben Tag bleibt unverändert).

## Begriffe

- **Vormerkung:** Ein Mannschaftsführer markiert einen Spieler für ein Spiel seines Teams als „hätte ich gern“. Sie
  reserviert nichts, sperrt niemanden, verschickt keine Mail und ist für Spieler unsichtbar.
- **Anspruch:** Ein Spieler ist bei einem Spiel aufgestellt (Stamm oder Ersatz) oder vorgemerkt.
- **Konflikt:** Ein Spieler hat an einem Tag Ansprüche von mindestens zwei Spielen verschiedener Teams.
- **Einsätze:** Stammplätze eines Spielers über die ganze Saison pro Team – gespielt oder geplant, veröffentlicht oder
  nicht. Ersatz und Stammplätze mit Absage („nein“) zählen nicht.

## Regeln

**Vormerken** darf nur der Mannschaftsführer des Teams, nur für kommende Spiele (dieselbe Prüfung wie beim
Aufstellen, `captainMatch`). Der Spieler muss für das Team grundsätzlich spielberechtigt sein: `lineupCheck` mit
`sameDayTeam: null` muss `ok` sein. Damit gilt:

- erlaubt, obwohl der Spieler am selben Tag schon für ein anderes Team aufgestellt ist – genau dafür ist es da;
- nicht erlaubt bei „Spielt diese Saison nicht“, „Nicht auf der Meldeliste …“, „fest in der 1. Mannschaft“,
  „In der 1. Mannschaft festgespielt“.

Ein Spieler kann pro Spiel höchstens einmal vorgemerkt sein; doppeltes Vormerken ist still ein No-op. Wer bei diesem
Spiel schon aufgestellt ist, kann nicht zusätzlich vorgemerkt werden.

**Aufstellen** eines vorgemerkten Spielers (Stamm oder Ersatz) löscht die Vormerkung für dieses Spiel. Vormerkungen
anderer Spiele am selben Tag bleiben – der Konflikt bleibt sichtbar, bis jemand seine Vormerkung entfernt.

**Entfernen** einer Vormerkung geht jederzeit für kommende Spiele.

**Ausgeblendet** werden Vormerkungen von Spielern mit „spielt nicht“ und Vormerkungen vergangener Spiele.

**Verlegte Spiele:** Vormerkungen hängen am Spiel, nicht am Datum; Konflikte werden immer nach dem aktuellen Datum
berechnet.

Festspiel-Regel, Sperre am selben Tag, Veröffentlichen und alle Mails bleiben unverändert.

## Oberfläche

### Aufstellungsseite eines Spiels (`/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]`)

**Block „Am selben Tag“** direkt unter dem Kopf, nur wenn am selben Tag andere Spiele sind. Er ersetzt die bisherige
rote Zeile „Am selben Tag: … – dort Aufgestellte sind hier gesperrt.“ Pro anderem Spiel:

- Team-Chip, Uhrzeit, Gegner;
- „Aufgestellt x/y: Namen“ (Stamm; Ersatz als „Ersatz: Namen“);
- „Vorgemerkt: Namen“, falls vorhanden;
- „MF: Name“ und Knopf „WhatsApp ›“ mit allgemeinem Text an diesen Mannschaftsführer. Ist man selbst dessen
  Mannschaftsführer, fehlt der Knopf; ist keiner eingetragen, steht „kein Mannschaftsführer eingetragen“.

**Aufstellungs-Karte:** Unter Stamm und Ersatz neuer Abschnitt „Vorgemerkt“ mit den eigenen Vormerkungen, jeweils:

- Name und Listen-Tag wie bei den anderen Zeilen;
- „Aufstellen“ (als Stamm) und „Entfernen“;
- ist der Spieler inzwischen woanders am selben Tag aufgestellt: „inzwischen bei Herren I aufgestellt“ und
  „Absprechen ›“ statt „Aufstellen“;
- ist er nicht mehr spielberechtigt: Grund in Rot, nur „Entfernen“.

Vorgemerkte zählen nicht in „x von 4“ und werden nicht veröffentlicht.

**Spielberechtigt-Liste:** Jede Zeile bekommt

- neben „Aufstellen“ und „Ersatz“ einen dritten Knopf „Vormerken“;
- eine Zeile „Einsätze: Herren I 2 · H30 II 1“ (nur Teams mit mindestens einem Einsatz; fehlt, wenn keiner);
- bei einem Anspruch eines anderen Teams am selben Tag: „⚠ Auch vorgemerkt von Herren I“ und „Absprechen ›“.

Vorgemerkte Spieler erscheinen nicht mehr in dieser Liste (sie stehen in der Karte).

**Nicht spielberechtigt:** Bei „Spielt am selben Tag schon für …“ gibt es „Vormerken“ und „Absprechen ›“.

### Mannschaftsführer-Übersicht (`/spieler/[token]/mannschaftsfuehrer`)

Die Karte eines eigenen Spiels unter „Deine Spiele“ bekommt bei mindestens einem Konflikt, an dem dieses Spiel
beteiligt ist, die Zeile „⚠ Absprache mit Herren I offen“ (mehrere Teams mit Komma).

### WhatsApp-Text

„Absprechen ›“ öffnet `https://wa.me/?text=…` (Chat wählt man selbst), Text:

> Hi Marco, wegen Sa., 16.01.: Ich würde Seb gern bei Herren 30 II einsetzen – du hast ihn bei Herren I aufgestellt.
> Wie machen wir's?

„aufgestellt“ bzw. „vorgemerkt“ je nach Anspruch. Der allgemeine Knopf im Block „Am selben Tag“:

> Hi Marco, wegen Sa., 16.01. (Herren I und Herren 30 II): Lass uns kurz abstimmen, wer wo spielt.

Ohne Link – die persönlichen Links sind geheim.

## Daten

Neue Tabelle `lineup_marks`:

| Spalte       | Typ                                   |
|--------------|---------------------------------------|
| `id`         | serial, PK                            |
| `match_id`   | integer, FK `matches.id`, on delete cascade |
| `player_id`  | integer, FK `players.id`              |
| `created_at` | timestamptz, default now()            |

Unique `(match_id, player_id)`.

Bewusst getrennt von `lineups`: An `lineups` hängen Sperre am selben Tag, Festspielen, Veröffentlichen, Mails,
Spielerseiten und Kalender. Eine Vormerkung darf nichts davon auslösen.

Produktion: `CREATE TABLE` von Hand, erst nach Pablos OK, eingetragen in `drizzle/manual-migrations.sql`.

## Code

- `src/db/schema.ts`: Tabelle `lineupMarks`.
- `src/lib/marks.ts`:
  - `getMarks(): Promise<Map<number, { playerId: number; name: string; playsMatches: boolean }[]>>` – nur von
    Mannschaftsführer-Seiten und -Actions benutzt.
  - `sameDayClaims(playerId, match, allMatches, lineupsByMatch, marksByMatch, teams)` → Ansprüche anderer Spiele am
    selben Tag: `{ match, kind: "aufgestellt" | "vorgemerkt", captainName, captainPlayerId }[]`. Rein, getestet.
  - `appearances(playerId, allMatches, lineupsByMatch)` → `{ teamName, count }[]` in Team-Reihenfolge. Rein, getestet.
  - `canMark(roster, team, ctx)` → `lineupCheck` mit `sameDayTeam: null`. Rein, getestet.
  - `conflictTeams(match, allMatches, lineupsByMatch, marksByMatch)` → Namen der Teams, mit denen es bei diesem Spiel
    einen Konflikt gibt (für den Hinweis in der Übersicht). Rein, getestet.
- `src/lib/invite.ts`: `coordinationText(...)` und `sameDayText(...)` für die beiden WhatsApp-Texte.
- `src/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions.ts`: `markPlayer`, `unmarkPlayer`;
  `addToLineup` löscht nach dem Eintragen die Vormerkung desselben Spiels.
- Aufstellungsseite und Übersicht wie oben; neue Komponente `SameDayBlock` für den Block „Am selben Tag“.

## Tests

- Unit-Tests (`node:test`, `npm test`):
  - `sameDayClaims`: kein Konflikt; woanders Stamm; woanders Ersatz; woanders vorgemerkt; eigenes Spiel zählt nicht;
    anderer Tag zählt nicht; Mannschaftsführer beider Teams.
  - `appearances`: Stamm zählt; Ersatz und Absage nicht; getrennt pro Team.
  - `canMark`: erlaubt trotz Spiel am selben Tag; verboten bei fester Position, fehlender Meldeliste, festgespielt,
    „spielt nicht“.
  - `conflictTeams`: Konflikt über Aufstellung und über Vormerkung; kein Konflikt ohne Anspruch am selben Tag.
  - `coordinationText` / `sameDayText`.
- SQL der neuen Actions gegen die Produktions-DB in einem `db.batch`, der mit `select 1/0` zurückgerollt wird
  (wie `scripts/check-slots-sql.ts`).
- Browser lokal nur lesend (lokal hängt die Produktions-DB dran). Nach dem Deploy: einmal einen Spieler vormerken
  und wieder entfernen – nur nach Pablos OK.

## Nicht Teil davon

- Anfragen mit Freigeben/Behalten in der App, Mails an Mannschaftsführer wegen Vormerkungen.
- Feste Rangfolge zwischen Mannschaften, Schutz vor dem Festspielen.
- Saison-Tabelle Spieler × Spieltage, eigene Spieltag-Seite.
