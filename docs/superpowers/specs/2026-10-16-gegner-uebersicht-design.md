# Gegner-Übersicht auf der Spielkarte: Tabelle, Aufstellungen, Einschätzung

Stand: 16.10.2026 · mit Pablo abgestimmt (Brainstorming im Chat, Entwurf „Variante B“)

## Worum es geht

Vor einem Punktspiel, am Tag davor oder am Spieltag selbst, will die Mannschaft auf einen Blick wissen, gegen wen es
geht: Wo steht der Gegner in der Tabelle, wen hat er bisher aufgestellt, und wie stehen unsere Chancen? Es geht um
die Mannschaft als Ganzes, nicht um die Vorbereitung einzelner Spieler auf ihren direkten Gegner.

Die Fakten kommen aus den öffentlichen WTB-/nuLiga-Seiten, die die App für den Spielplan schon liest
(`src/lib/wtb.ts`, `scripts/import-wtb.ts`). Die Einschätzung schreibt Claude, so wie die App es bei der
Aufstellungs-Simulation schon tut (`src/lib/lineup-ai.ts`).

## Wer es sieht und wo

- **Ort:** die Punktspiele-Seite hinter dem persönlichen Link (`/spieler/[token]/punktspiele`, Komponente
  `MatchCard` in `MatchList`). Nicht auf der öffentlichen Startseite und nicht in E-Mails.
- **Welche Karten:** nur das **nächste** kommende Spiel jeder unserer vier Mannschaften (Herren I/II, Herren 30 I/II)
  bekommt den Gegner-Teil. Spätere Spiele bleiben, wie sie sind.
- **Wer:** jeder mit persönlichem Link, also so, wie die Punktspiele-Seite heute schon alle Teams zeigt.
  *(Meine Entscheidung: Pablo sagte „jeder in der Mannschaft“. Eine Sperre pro Team gibt es auf der Seite bisher
  nicht, und hier ist keine nötig.)*

## Was auf der Karte steht (Variante B: alles auf der Karte)

Unter dem bestehenden Kopf der Karte (Team-Chip, Heim/Auswärts, Gegner, Uhrzeit), vor dem Hallen-Block, kommen drei
Teile im Stil der vorhandenen grauen Boxen (`bg-[var(--color-tabs-bg)]`, `rounded-[14px]`):

1. **Tabelle:** die ganze Gruppe (meist 5–6 Teams) mit Rang, Mannschaft und Punkten. Der Gegner ist in
   `--color-brand` hervorgehoben, wir in der Farbe der Altersklasse (`--color-herren` / `--color-h30`).
2. **So haben sie aufgestellt:** die Spieler des Gegners, die in dieser Saison schon mindestens ein Einzel oder
   Doppel gespielt haben, in Reihenfolge ihres Rangs auf der Meldeliste, jeweils mit LK, Anzahl Einsätzen und Bilanz.
   Namen mit abgekürztem Vornamen („M. Keller“). *(Meine Entscheidung zur Abkürzung; die Daten sind öffentlich, wir
   müssen sie aber nicht vollständig wiederholen.)*
   **Vor ihrem ersten Spiel:** stattdessen die ersten Plätze ihrer Meldeliste (so viele, wie das Spiel Spieler
   braucht, plus zwei) mit LK und dem Hinweis „Noch keine Spiele – so sind sie gemeldet“.
3. **Einschätzung:** zwei bis drei Sätze, hervorgehoben wie im Entwurf (bläuliche Box, „Einschätzung:“ fett).

Darunter klein: „Stand: <Datum> · Quelle: nuLiga“, mit Link auf die Gruppenseite beim WTB.

## Die Einschätzung

**Ton (Pablos Wünsche):**
- Aufbauend: zuerst, wo wir gute Chancen haben, dann, wo es schwer wird, formuliert als Herausforderung. Nichts
  schöner machen, als es ist, aber nie entmutigend.
- **Gegner nur über Positionen**, nie mit Namen („ihre Nummer 1“, „ihr Doppel 2“). Unsere Spieler auch nicht
  namentlich *(meine Entscheidung, damit das Muster einheitlich bleibt)*.
- Ein bisschen Schwäbisch, dezent und nicht als Karikatur („des wird koi Spaziergang“, „do isch was drin“). Höchstens
  ein, zwei Ausdrücke pro Text.
- Keine Prozentzahlen. Eine Tendenz ist erlaubt („eher knapp, a 3:3 isch drin“).

**Woraus sie entsteht:** Claude bekommt nur Fakten, die die App vorher selbst ausgerechnet hat, als JSON:
- Tabellenplatz, Punkte und Matches von Gegner und uns, Anzahl Teams in der Gruppe;
- pro Einzel-Position der wahrscheinliche Spieler des Gegners (nur Rang, LK, Einsätze, Bilanz, ohne Namen) und
  unser Spieler auf der Position (nur LK), dazu das Ergebnis des LK-Vergleichs (`vorne` / `offen` / `hinten`);
- ob unsere Aufstellung schon veröffentlicht ist oder der Vergleich nur geschätzt ist;
- ob der Gegner schon gespielt hat (vor dem ersten Spieltag beruht alles nur auf der LK, und der Text sagt das).

**Einsätze** stehen nicht als eigene Spalte beim WTB. Sie werden aus der Bilanz berechnet: Siege plus Niederlagen im
Einzel, für die Liste auch im Doppel.

**Wahrscheinliche Aufstellung des Gegners** *(Regel ist meine Entscheidung)*: die `playersNeeded` Spieler mit den
meisten Einzel-Einsätzen, bei Gleichstand der bessere Rang, dann in Meldelisten-Reihenfolge sortiert. Haben zu wenige
gespielt, wird mit den nächsten der Meldeliste aufgefüllt.

**Positionen neu zählen:** Auf der Seite einer 2. Mannschaft beginnt der Rang dort, wo die 1. aufhört (z. B. bei 5).
Für die Einschätzung und die Liste werden die Positionen 1…n gezählt, damit es „ihre Nummer 1“ heißt und nicht
„Nummer 5“.

**Unsere Seite:** Ist die Aufstellung veröffentlicht (`matches.lineupPublishedAt`), dann deren Stammspieler in
Meldelisten-Reihenfolge mit LK aus `roster_entries`. Sonst dieselbe Regel wie beim Gegner, angewendet auf unsere
eigene WTB-Mannschaftsseite.

**LK-Vergleich** *(Schwelle ist meine Entscheidung)*: Differenz ≥ 2 LK-Punkte ergibt `vorne` / `hinten`, sonst
`offen`. Niedrigere LK ist stärker. Der WTB zeigt die LK nur ganzzahlig („LK13“). Die LK aus `roster_entries` (mit
Nachkommastelle) wird vor dem Vergleich ebenso auf eine ganze Zahl gekürzt, damit sich das Ergebnis beim
Veröffentlichen nicht nur wegen der anderen Datenquelle ändert. Angezeigt wird die LK so, wie der WTB sie zeigt.

**Technik:** wie `lineup-ai.ts`: `@anthropic-ai/sdk`, Modell `claude-sonnet-5-5`, vorhandener
`ANTHROPIC_API_KEY`, strukturierte Ausgabe `{ "text": string }`. Effort kann niedriger sein als bei der Simulation;
das entscheidet der Builder. Danach prüft der Code, dass kein Nachname eines gegnerischen Spielers im Text vorkommt (ganzes Wort,
genaue Groß-/Kleinschreibung, damit ein Spieler „Knapp“ nicht „eher knapp“ blockiert).
Bei einem Treffer gibt es einen zweiten Versuch mit Hinweis. Scheitert auch der, wird keine Einschätzung gezeigt.

## Daten holen

Die Mannschaftsseite jedes Teams beim WTB (`…/mannschaft/v/<Verein>/m/<Team>.html`) enthält, als HTML geprüft am
16.10.2026:
- einen Link auf die **Gruppenseite** (`/spielbetrieb/winter2026-2027/…/gruppe/g/<id>.html`) mit der Tabelle (Rang,
  Mannschaft, Begegnungen, Punkte, Matches, Sätze, Games) und Links auf die Mannschaftsseiten aller Gegner;
- die Tabelle **„Spieler“** mit Rang, LK (z. B. „LK13“), Name, Nation, Bilanz Einzel / Doppel / Gesamt.

Das reicht für alles oben. Die Spielberichte (PDF, `MeetingReportFOP`) werden **nicht** gelesen.

**Ablauf:** ein neuer Vercel-Cron, montags 04:30 UTC (Ergebnisse ändern sich nur nach dem Spieltag; Pablo, 16.10.2026) (neben `erinnerungen` und `trainer-stand`, geschützt mit `CRON_SECRET`):
1. pro eigener Mannschaft Gruppenseite und alle Mannschaftsseiten der Gruppe holen (zusammen etwa 25 Seiten am Tag);
2. Tabelle und Spielerlisten speichern (neue Tabellen; Schema entscheidet der Builder);
3. für das nächste Spiel jeder Mannschaft die Fakten berechnen. Nur wenn sie sich seit dem letzten Mal geändert
   haben (Hash der Eingabe), wird eine neue Einschätzung bei Claude geholt und gespeichert.

Wenn der Mannschaftsführer die Aufstellung veröffentlicht, wird die Einschätzung dieses Spiels gleich danach neu
erzeugt, ohne den Veröffentlichen-Button aufzuhalten (z. B. mit `after()`). So stimmt sie am Abend vor dem Spiel
schon.

Die Seite selbst ruft weder WTB noch Claude auf, sie liest nur Gespeichertes.

**Fehler:**
- WTB nicht erreichbar oder Seite verändert: alte Daten bleiben stehen, „Stand:“ zeigt das alte Datum. Ein Fehler im
  Cron-Ergebnis wie bei den anderen Crons.
- Claude nicht erreichbar oder kein Key: Tabelle und Aufstellungen werden trotzdem gezeigt, ohne Einschätzung.
- Gegner nicht in der Gruppe gefunden (Name weicht ab): kein Gegner-Teil auf der Karte, Hinweis im Cron-Ergebnis.

## Datenbank

Es gibt nur die Produktions-Datenbank (`.env.local`). Neue Tabellen kommen von Hand per `CREATE TABLE` gegen
Produktion, festgehalten in `drizzle/manual-migrations.sql`, und **erst nach Pablos OK**, nicht per `drizzle-kit push`.
Das passiert, bevor Code live geht, der die Tabellen liest.

## Nicht Teil davon

- Spielberichte (PDF) auslesen und Aufstellungen Spiel für Spiel; Doppelpaarungen.
- Einschätzung für andere als das nächste Spiel; Rückblick nach dem Spiel.
- Gegner-Info in E-Mails oder auf der öffentlichen Startseite.
- Profile einzelner Gegner über mehrere Saisons.
- Siegwahrscheinlichkeiten in Prozent.

## Was es nicht werden darf

- Ein Text, der die Mannschaft vor dem Spiel runterzieht.
- Ein Text, der Gegner namentlich schlecht dastehen lässt.
- Erfundene Fakten: Jede Zahl und jede Aussage über Stärke muss aus den berechneten Fakten kommen.
- Eine Seite, die langsam lädt oder kaputtgeht, weil WTB oder Claude gerade hängen.

## Tests

Wie bisher als reine Funktionen mit `tsx --test`:
- Parser für Gruppenseite und Spielerliste gegen gespeicherte HTML-Beispiele (eine Seite vor Saisonbeginn mit 0:0,
  eine mit Ergebnissen, sobald es welche gibt);
- wahrscheinliche Aufstellung und LK-Vergleich;
- Namensprüfung der Einschätzung.

## Dem Builder überlassen

Tabellen-Schema, Cron-Uhrzeit (vor 06:00 UTC, damit es vor den Erinnerungen fertig ist), genaue Prompt-Formulierung
im Rahmen des Tons oben, Komponentenaufteilung, wie die Gruppen-URL ermittelt und gespeichert wird.
