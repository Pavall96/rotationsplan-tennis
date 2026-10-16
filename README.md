# Rotationsplan Tennis – Wintertraining 2026/27

Web-App für den Rotationsplan: wer wann und wo spielt, Kalender-Abo, Zu-/Absagen per persönlichem Link und eine Erinnerungs-E-Mail am Trainingstag.

## Setup

```bash
npm install
```

1. **Vercel verbinden** (einmalig, interaktiv – kann nicht automatisiert werden):
   ```bash
   npx vercel login
   npx vercel link
   ```
2. **Postgres provisionieren** (Neon über den Vercel Marketplace):
   ```bash
   npx vercel integration add neon --yes
   npx vercel env pull .env.local --yes
   ```
3. **Schema anlegen und Daten importieren:**
   ```bash
   npm run data:parse   # liest ~/Downloads/Rotationsplan_Wintertraining_2026-27.xlsx → data/seed.json
   npm run db:push       # Schema nach Postgres
   npm run db:seed       # Spieler/Plätze/Termine aus data/seed.json
   ```
   ⚠️ **Bei `db:push` gegen eine bestehende Datenbank mit echten Daten:** drizzle-kit
   fragt bei manchen Schema-Änderungen (z.B. neue CHECK-Constraint-Werte) interaktiv,
   ob es dafür eine Tabelle **truncaten** darf. Diese Frage niemals unbedacht mit
   Ja/Force beantworten — das hat hier schon einmal gedroht, die `sessions`-Tabelle
   mit 58 echten Terminen zu leeren. Im Zweifel stattdessen die Änderung manuell per
   `ALTER TABLE` ausführen (siehe `drizzle/manual-migrations.sql` für bereits so
   durchgeführte Änderungen) und vorher ein Backup ziehen.
4. **E-Mail-Adressen ergänzen** (Kopie von `data/spieler-emails.example.csv` nach `data/spieler-emails.csv`, ausfüllen):
   ```bash
   npm run data:emails
   ```
5. **E-Mail-Versand provisionieren** (Resend über den Vercel Marketplace):
   ```bash
   npx vercel integration add resend --yes
   npx vercel env pull .env.local --yes
   ```
   Zusätzlich per `npx vercel env add` setzen: `MAIL_FROM`, `REPLY_TO`, `CRON_SECRET` (zufälliger Wert), `ADMIN_TOKEN` (zufälliger Wert), `NEXT_PUBLIC_BASE_URL` (die Produktions-URL).
6. **Deployen:**
   ```bash
   npx vercel --prod
   ```
7. **Links verteilen:** `/admin?key=<ADMIN_TOKEN>` zeigt alle persönlichen Links zum Kopieren.
   Dort gibt es auch den Excel-Download aller Abstimmungen für die Winterspiele (`/api/admin/abstimmungen?key=<ADMIN_TOKEN>`).

## Winterspiele der Mannschaften

Spielplan und Hallenadressen der vier Teams (Herren I/II, Herren 30 I/II) kommen direkt von den WTB-Mannschaftsseiten:

```bash
npm run data:wtb -- --dry-run   # nur anzeigen
npm run data:wtb                # in die Datenbank schreiben (erneut ausführbar, z.B. nach Terminverschiebungen)
```

Meldeliste (Reihenfolge, LK, Nationalität) aus `data/meldeliste.json` importieren – legt fehlende Spieler an und
verknüpft bestehende über die WTB-ID (Zuordnung Spitzname → WTB-ID steht im Skript):

```bash
npm run data:meldeliste -- --dry-run
npm run data:meldeliste
```

Die Spielregeln (fest in der 1. Mannschaft, Festspielen, Nicht-Deutsche) stehen in `src/lib/eligibility.ts`, getestet
mit `npm test`. Fahrgemeinschaften laufen über `/spieler/<token>/punktspiele`.

### Aufstellung simulieren (Claude)

Auf der Mannschaftsführer-Seite schlägt Claude für alle Teams eines Spieltags eine Aufstellung vor (Zusagen, Meldeliste,
bisherige Einsätze; Schwerpunkt ausgewogen / stark / Rotation). Die Spielregeln prüft danach die App selbst
(`src/lib/lineup-sim.ts`), der Aufruf steht in `src/lib/lineup-ai.ts`. Gespeichert wird nichts – der Mannschaftsführer
kann den Vorschlag für sein Team vormerken. Braucht einen API-Key von console.anthropic.com:

```bash
npx vercel env add ANTHROPIC_API_KEY   # nie mit NEXT_PUBLIC_ – der Key darf nicht in den Browser
```

Die Tabellen dafür (`teams`, `venues`, `matches`, `roster_entries`, `rides`, …) stehen in `drizzle/manual-migrations.sql`. Mannschaftsführer erreichen
über ihre persönliche Seite den Bereich `/spieler/<token>/mannschaftsfuehrer`, wo sie Spieler ohne Training anlegen können.

## Entwicklung

```bash
npm run dev
```

Ohne `RESEND_API_KEY` werden E-Mails nur in die Konsole geloggt, nicht verschickt.

## Struktur

- `src/db/schema.ts` – Datenmodell (players, courts, sessions, session_assignments, rsvps, reminder_log)
- `scripts/parse-xlsx.ts` – Excel → `data/seed.json` (mit Plausibilitätsprüfungen)
- `scripts/seed.ts` – `data/seed.json` → Postgres (idempotent, überschreibt keine Tokens/E-Mails/RSVPs)
- `src/app/page.tsx` – öffentliche Gesamtübersicht
- `src/app/spieler/[token]/` – persönliche Seite mit Zu-/Absage und Kalender-Abo
- `src/app/api/cron/erinnerungen/` – tägliche Erinnerungs-E-Mail (Vercel Cron, `vercel.json`)
- `src/app/api/cron/trainer-stand/` – Nachmittags-Mail an den Trainer, solange Zusagen fehlen (Vercel Cron, `vercel.json`)
- `src/app/api/ics/` – Kalender-Feed und Einzeltermin-Download
- `src/app/admin/` – Linkliste, geschützt per `?key=`
