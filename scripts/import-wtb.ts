// Imports the winter schedule of our four teams from the public WTB team pages (with hall addresses).
// Safe to re-run: teams/venues/matches are upserted by their WTB keys, captains are only set where none is set yet,
// and a venue address someone corrected by hand is never overwritten.
//
//   npm run data:wtb -- --dry-run   # only fetch + print, no database access
//   npm run data:wtb                # write to the database from DATABASE_URL
//   npm run data:wtb -- --notify    # also email lined-up players about moved matches (required if there are any)
//
// A moved match (date, time or hall) bumps its schedule_version (the calendar event's SEQUENCE). If its lineup is
// already published, the players must hear about it: the import refuses to write until run with --notify, then
// resets their Zu-/Absage (they answered for the old time) and emails them and the Mannschaftsführer.

import { eq, isNull, and, sql, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../src/db";
import { players, teams, venues, matches, lineups } from "../src/db/schema";
import { sendNotice } from "../src/lib/email";
import { formatDayShort, formatTime, playerLabel } from "../src/lib/format";
import { WTB_BASE_URL, OWN_CLUB_NAME, parseTeamPage, parseHallAddress, fetchWtb, type WtbMatch } from "../src/lib/wtb";

const TEAMS = [
  { slug: "herren-1", name: "Herren I", ageClass: "herren", rank: 1, wtbTeamId: "3770209", captain: "Patrick Kremer" },
  { slug: "herren-2", name: "Herren II", ageClass: "herren", rank: 2, wtbTeamId: "3769465", captain: "Yassin" },
  { slug: "h30-1", name: "Herren 30 I", ageClass: "h30", rank: 1, wtbTeamId: "3770434", captain: "Seb" },
  { slug: "h30-2", name: "Herren 30 II", ageClass: "h30", rank: 2, wtbTeamId: "3769220", captain: "Pablo" },
] as const;

const CLUB_ID = "20019";

function teamUrl(wtbTeamId: string) {
  return `${WTB_BASE_URL}/spielbetrieb/vereine/verein/mannschaften/mannschaft/v/${CLUB_ID}/m/${wtbTeamId}.html`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const notifyMoved = process.argv.includes("--notify");

  // ---- Fetch everything first, so a WTB hiccup never leaves a half-written import ----
  const fetched: { team: (typeof TEAMS)[number]; league: string | null; matches: WtbMatch[] }[] = [];
  for (const team of TEAMS) {
    const page = parseTeamPage(await fetchWtb(teamUrl(team.wtbTeamId)));
    fetched.push({ team, ...page });
  }

  const venueUrls = new Map<string, string | null>();
  for (const f of fetched) for (const m of f.matches) venueUrls.set(m.venueName, m.venueUrl);
  const venueAddresses = new Map<string, string | null>();
  const guessedAddresses = new Set<string>();
  for (const [name, url] of venueUrls) {
    const parsed = url ? parseHallAddress(await fetchWtb(url)) : null;
    venueAddresses.set(name, parsed?.address ?? null);
    if (parsed?.fallback) guessedAddresses.add(name);
  }

  for (const f of fetched) {
    console.log(`\n${f.team.name} – ${f.league ?? "?"} (${f.matches.length} Spiele)`);
    for (const m of f.matches) {
      console.log(`  ${m.date} ${m.time}  ${m.homeTeam} – ${m.guestTeam}  @ ${m.venueName}`);
    }
  }
  console.log("\nHallen:");
  for (const [name, address] of venueAddresses) {
    const hint = guessedAddresses.has(name) ? "  ⚠️ keine Hallenadresse, Vereinsanschrift genommen – bitte prüfen" : "";
    console.log(`  ${name}: ${address ?? "(keine Adresse gefunden)"}${hint}`);
  }

  if (dryRun) {
    console.log("\n(Dry run – nichts gespeichert.)");
    return;
  }

  const db = getDb();

  // ---- Venues: insert new ones; fill in a missing address but never overwrite a (possibly corrected) one ----
  for (const [name, address] of venueAddresses) {
    await db.insert(venues).values({ name, address }).onConflictDoNothing({ target: venues.name });
    if (address) {
      await db.update(venues).set({ address }).where(and(eq(venues.name, name), isNull(venues.address)));
    }
  }
  const venueIdByName = new Map((await db.select().from(venues)).map((v) => [v.name, v.id]));

  const playerRows = await db.select({ id: players.id, displayName: players.displayName }).from(players);
  const playerIdByName = new Map(playerRows.map((p) => [p.displayName, p.id]));

  // ---- Moved matches: compare with what's stored before writing anything ----
  const venueNameById = new Map([...venueIdByName].map(([name, id]) => [id, name]));
  const existing = new Map(
    (await db.select().from(matches)).map((m) => [m.wtbMeetingId, m]),
  );
  const describe = (date: string, time: string, venue: string | null) =>
    `${formatDayShort(date)} ${time} Uhr${venue ? `, ${venue}` : ""}`;
  const moved: { id: number; teamName: string; opponent: string; before: string; after: string; published: boolean; timeChanged: boolean }[] = [];
  for (const f of fetched) {
    for (const m of f.matches) {
      const old = existing.get(m.meetingId);
      if (!old) continue;
      const oldTime = formatTime(old.startsAt);
      const oldVenue = old.venueId ? (venueNameById.get(old.venueId) ?? null) : null;
      if (old.matchDate === m.date && oldTime === m.time && oldVenue === m.venueName) continue;
      moved.push({
        id: old.id,
        teamName: f.team.name,
        opponent: old.opponent,
        before: describe(old.matchDate, oldTime, oldVenue),
        after: describe(m.date, m.time, m.venueName),
        published: Boolean(old.lineupPublishedAt),
        timeChanged: old.matchDate !== m.date || oldTime !== m.time,
      });
    }
  }
  const fetchedIds = new Set(fetched.flatMap((f) => f.matches.map((m) => m.meetingId)));
  for (const [meetingId, m] of existing) {
    if (!fetchedIds.has(meetingId)) console.warn(`⚠️  Spiel ${m.opponent} am ${m.matchDate} steht nicht mehr beim WTB – bitte prüfen.`);
  }
  if (moved.length > 0) {
    console.log("\nVerlegte Spiele:");
    for (const mv of moved) {
      console.log(`  ${mv.teamName} – ${mv.opponent}: ${mv.before} → ${mv.after}${mv.published ? "  (Aufstellung veröffentlicht)" : ""}`);
    }
  }
  const publishedMoved = moved.filter((mv) => mv.published);
  if (publishedMoved.length > 0 && !notifyMoved) {
    console.error(
      "\n✋ Verlegte Spiele mit veröffentlichter Aufstellung – die Spieler müssen Bescheid bekommen." +
        "\n   Nichts gespeichert. Erneut mit --notify ausführen, dann gehen die E-Mails raus.",
    );
    process.exit(1);
  }
  const movedIds = new Set(moved.map((mv) => mv.id));

  let matchCount = 0;
  for (const f of fetched) {
    const { team } = f;
    const [row] = await db
      .insert(teams)
      .values({
        slug: team.slug,
        name: team.name,
        ageClass: team.ageClass,
        rank: team.rank,
        wtbTeamId: team.wtbTeamId,
        league: f.league,
      })
      .onConflictDoUpdate({
        target: teams.slug,
        set: { name: team.name, ageClass: team.ageClass, rank: team.rank, wtbTeamId: team.wtbTeamId, league: f.league },
      })
      .returning({ id: teams.id });

    const captainId = playerIdByName.get(team.captain);
    if (!captainId) {
      console.warn(`⚠️  Mannschaftsführer „${team.captain}“ nicht in der Spielerliste – ${team.name} bleibt ohne.`);
    } else {
      await db
        .update(teams)
        .set({ captainPlayerId: captainId })
        .where(and(eq(teams.id, row.id), isNull(teams.captainPlayerId)));
    }

    for (const m of f.matches) {
      const isHome = m.homeTeam.startsWith(OWN_CLUB_NAME);
      const updatable = {
        matchDate: m.date,
        startsAt: sql`((${m.date}::date + ${m.time}::time) at time zone 'Europe/Berlin')`,
        isHome,
        opponent: isHome ? m.guestTeam : m.homeTeam,
        venueId: venueIdByName.get(m.venueName) ?? null,
      };
      const old = existing.get(m.meetingId);
      await db
        .insert(matches)
        .values({ teamId: row.id, wtbMeetingId: m.meetingId, ...updatable })
        .onConflictDoUpdate({
          target: matches.wtbMeetingId,
          set: old && movedIds.has(old.id) ? { ...updatable, scheduleVersion: sql`${matches.scheduleVersion} + 1` } : updatable,
        });
      matchCount++;
    }
  }

  // ---- Tell lined-up players (and the Mannschaftsführer) about moved matches ----
  if (publishedMoved.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://rotationsplan-tennis.vercel.app";
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error("MAIL_FROM ist nicht gesetzt – Spiele gespeichert, aber niemand benachrichtigt.");
    for (const mv of publishedMoved) {
      if (mv.timeChanged) {
        // They confirmed the old time; ask again.
        await db
          .update(lineups)
          .set({ response: null, respondedAt: null })
          .where(and(eq(lineups.matchId, mv.id), isNotNull(lineups.publishedAt)));
      }
      const entries = await db
        .select({ playerId: lineups.playerId })
        .from(lineups)
        .where(and(eq(lineups.matchId, mv.id), isNotNull(lineups.publishedAt)));
      const [match] = await db
        .select({ captainId: teams.captainPlayerId })
        .from(matches)
        .innerJoin(teams, eq(matches.teamId, teams.id))
        .where(eq(matches.id, mv.id));
      const ids = [...new Set([...entries.map((e) => e.playerId), ...(match?.captainId ? [match.captainId] : [])])];
      const recipients = ids.length ? await db.select().from(players).where(inArray(players.id, ids)) : [];
      for (const p of recipients) {
        if (!p.email) {
          console.log(`  ohne E-Mail, bitte selbst Bescheid geben: ${playerLabel(p)}`);
          continue;
        }
        const result = await sendNotice(
          {
            to: p.email,
            playerName: playerLabel(p),
            subject: `Spiel verlegt: ${mv.teamName} ${mv.opponent}`,
            line: `Das Spiel ${mv.teamName} – ${mv.opponent} wurde verlegt: jetzt ${mv.after}.${
              mv.timeChanged ? " Bitte sag in der App noch einmal zu oder ab." : ""
            }`,
            detail: `Vorher: ${mv.before}`,
            cta: { url: `${baseUrl}/spieler/${p.token}/punktspiele#spiel-${mv.id}`, label: "Zum Spiel" },
            token: p.token,
            baseUrl,
          },
          { from, replyTo: process.env.REPLY_TO },
        );
        console.log(result.error ? `  ✗ ${p.email}: ${result.error}` : `  ✉ ${playerLabel(p)}`);
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  console.log(`\n✅ Import abgeschlossen: ${TEAMS.length} Mannschaften, ${venueAddresses.size} Hallen, ${matchCount} Spiele.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
