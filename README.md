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
- `src/app/api/ics/` – Kalender-Feed und Einzeltermin-Download
- `src/app/admin/` – Linkliste, geschützt per `?key=`
