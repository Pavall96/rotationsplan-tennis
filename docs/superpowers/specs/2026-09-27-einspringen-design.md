# Einspringen: Jeder aus dem Trainingsplan kann einen freien Platz übernehmen

Stand: 27.09.2026 · mit Pablo abgestimmt

## Problem

Sagt ein Starter ab, kann heute nur der eingeteilte Ersatz einspringen – und das nur über den Link aus einer Mail
(Ersatz-Termine sind auf der persönlichen Seite ausgeblendet). Sagt der Ersatz nicht zu, bleibt der Platz leer,
obwohl andere Spieler aus dem Plan Zeit hätten.

## Regeln

**Wer darf einspringen?** Jeder Spieler, der im Trainingsplan als Spieler eingeteilt ist (mindestens eine
`session_assignment` als Starter oder Ersatz; wer nur als Trainer eingeteilt ist, zählt nicht), außer:

- wer an diesem Termin schon eingeteilt ist (Starter, Ersatz, Trainer oder bereits eingesprungen),
- wer am selben Tag an einem anderen Termin als Starter, Trainer oder Eingesprungener spielt.

Ersatz am selben Abend in der anderen Halle zu sein, schließt nicht aus.

**Offene Plätze** = Absagen der Starter − (1, wenn der Ersatz „ja“ gesagt hat) − Anzahl Eingesprungener, nie kleiner
als 0. Einspringen geht nur, solange der Termin noch nicht vorbei ist und mindestens ein Platz offen ist.

**Wer zuerst kommt, spielt.** Der Ersatz hat keinen Vorrang. Sagt der Ersatz „ja“, obwohl kein Platz mehr offen ist,
gilt das wie bisher als „hält sich bereit“.

**Eingesprungene können wieder absagen.** Dann wird ihre Einteilung gelöscht und der Platz ist wieder offen.

**Rücknahme einer Absage:** Ein Starter, der abgesagt hat, kann nur auf „ja“ zurückwechseln, solange noch ein Platz
offen ist. Sonst sieht er „Dein Platz wurde übernommen“ statt der Ja-Knöpfe.

## Oberfläche

- **Persönliche Seite:** neuer Abschnitt „Freie Plätze“ mit allen kommenden Terminen, an denen der Spieler einspringen
  darf und ein Platz offen ist, jeweils mit Knopf „Ich springe ein“. Eingesprungene Termine erscheinen danach unter
  den eigenen Terminen, mit den normalen Ja/Nein-Knöpfen („Nein“ = wieder abgeben).
- **Öffentlicher Plan (SessionCard):** Eingesprungene stehen mit Namen unter den Startern, markiert „eingesprungen“.
  Der Name des Ersatzes bleibt weiter verborgen. Ist ein Platz offen, steht unter dem Hinweis „… über deine
  persönliche Seite kannst du einspringen“.
- **Status-Texte (`vacancyStatus`):** „Ersatz gesucht“ nur, solange ein Platz offen ist und der Ersatz noch nicht
  geantwortet hat; sonst „1 Spieler fehlt“ / „2 Spieler fehlen“; ist nach einer Absage alles besetzt, „Vollständig“
  (bzw. wie bisher „Ersatz springt ein“, wenn es der Ersatz war).
- **Antwortseite `/spieler/[token]/antwort`:** kann auch für nicht eingeteilte, aber berechtigte Spieler geöffnet
  werden und zeigt dann „Heute ist ein Platz frei – springst du ein?“ mit dem Knopf. Ist der Platz inzwischen
  vergeben: „Schon vergeben, danke!“.
- **Kalender-Abo (ICS):** enthält eingesprungene Termine.
- Der Zähler „Spieltage“ auf der persönlichen Seite bleibt bei den geplanten Einsätzen (ohne Einspringen).

## Mails

- **Ersatz sofort bei Absage:** unverändert („Ersatz gesucht … kannst du einspringen?“).
- **Entwarnung an den Ersatz:** zusätzlich auch dann, wenn ein anderer Spieler den letzten offenen Platz übernimmt und
  der Ersatz nicht „ja“ gesagt hat (bestehende Entwarnungs-Mail, Text: „<Name> springt ein – du wirst nicht
  gebraucht“).
- **„Platz frei“-Mail am Spieltag:** im bestehenden täglichen Erinnerungslauf (Cron 06:00 UTC = 7 Uhr Winterzeit /
  8 Uhr Sommerzeit). Für jeden heutigen Termin mit offenem Platz bekommt jeder berechtigte Spieler mit E-Mail-Adresse
  eine Mail mit Knopf „Ich springe ein“, der auf die Antwortseite führt. Der Ersatz dieses Termins ist nicht
  berechtigt (er bekommt ohnehin seine Erinnerung). Protokolliert in `reminder_log` (ein Eintrag pro Termin und
  Spieler), damit ein zweiter Lauf nichts doppelt verschickt.

## Datenmodell

- `session_assignments.role` bekommt den Wert `'einspringer'` (Check-Constraint erweitern; per Hand in
  `drizzle/manual-migrations.sql` dokumentieren und gegen Produktion ausführen, wie bei `'trainer'`).
- Einspringen = Einteilung mit Rolle `einspringer` plus `rsvps`-Eintrag `ja`. Wieder absagen = beides löschen.
- `SessionView` bekommt `einspringer: SessionAssignmentView[]`; `myRoleInSession` / `sessionsForPlayer` kennen die
  neue Rolle.

## Gleichzeitige Klicks

Einspringen und das Zurücknehmen einer Absage laufen in einer Transaktion (`db.batch` über neon-http), die zuerst
`pg_advisory_xact_lock(session_id)` nimmt und dann nur einfügt bzw. ändert, wenn noch ein Platz offen ist
(`INSERT … SELECT … WHERE <offene Plätze> > 0`). So kommen bei zwei gleichzeitigen Klicks nie zwei Spieler auf einen
Platz. Wer zu spät war, bekommt „Schon vergeben“.

## Logik und Tests

Reine Funktionen in `src/lib/vacancy.ts` bzw. einer neuen `src/lib/einspringen.ts`, mit Tests (`node --test`):

- `openSlots(session)` – Zählung inkl. Ersatz-„ja“ und Eingesprungener.
- `canJumpIn(schedule, session, playerId, now)` – Berechtigung (andere Halle, schon eingeteilt, vorbei, kein Platz).
- `vacancyStatus` – neue Texte.
- `ersatzAlertKind` – Entwarnung, wenn ein Eingesprungener den letzten Platz füllt.
- Empfänger-Auswahl der „Platz frei“-Mail.

## Nicht Teil davon

- Keine Mail an alle direkt bei der Absage (nur am Spieltag morgens).
- Kein zweiter Cron-Zeitpunkt.
- Keine Warteliste, falls mehrere einspringen wollen.
