"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { players, matches, teams, rides, ridePassengers, rideRequests, rosterEntries, availability, lineups } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { sendNotice } from "@/lib/email";
import { formatDayShort, formatTime, playerLabel } from "@/lib/format";
import { DEFAULT_MEETING_POINT } from "@/lib/rides";
import { canBeAsked, type PlayerRoster } from "@/lib/eligibility";
import type { AgeClass } from "@/lib/matches";
import { getLineups, responseAlerts, type LineupResponse, type LineupRole } from "@/lib/lineups";

export type RideActionResult = { error?: string } | void;

type Player = typeof players.$inferSelect;
type MatchInfo = { id: number; startsAt: Date; teamName: string; isHome: boolean; opponent: string };

async function loadPlayer(formData: FormData): Promise<Player> {
  const token = String(formData.get("token") ?? "");
  const [player] = await getDb().select().from(players).where(eq(players.token, token)).limit(1);
  if (!player) throw new Error("Ungültiger Link.");
  return player;
}

async function loadUpcomingMatch(matchId: number): Promise<MatchInfo | null> {
  const [m] = await getDb()
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      teamName: teams.name,
      isHome: matches.isHome,
      opponent: matches.opponent,
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .where(and(eq(matches.id, matchId), sql`${matches.startsAt} > now()`))
    .limit(1);
  return m ?? null;
}

async function loadRide(rideId: number) {
  const [ride] = await getDb().select().from(rides).where(eq(rides.id, rideId)).limit(1);
  return ride ?? null;
}

function matchLine(m: MatchInfo): string {
  return `${formatDayShort(m.startsAt)} · ${m.teamName} ${m.isHome ? "gegen" : "bei"} ${m.opponent} · ${formatTime(m.startsAt)} Uhr`;
}

/** Emails the given players after the response is sent; players without an email are skipped. Never throws. */
async function notify(
  playerIds: number[],
  matchId: number,
  subject: string,
  line: (p: Player) => string,
  detail: string,
  cta: { path: (p: Player) => string; label: string } = {
    path: (p) => `/spieler/${p.token}/punktspiele#spiel-${matchId}`,
    label: "Fahrgemeinschaft ansehen",
  },
) {
  const ids = [...new Set(playerIds)];
  if (ids.length === 0) return;
  const baseUrl = await getBaseUrl();
  after(async () => {
    try {
      const from = process.env.MAIL_FROM;
      if (!from) {
        console.warn("MAIL_FROM ist nicht gesetzt – Fahrgemeinschafts-Mail übersprungen.");
        return;
      }
      const recipients = await getDb().select().from(players).where(inArray(players.id, ids));
      for (const p of recipients) {
        if (!p.email) continue;
        const result = await sendNotice(
          {
            to: p.email,
            playerName: playerLabel(p),
            subject,
            line: line(p),
            detail,
            cta: { url: `${baseUrl}${cta.path(p)}`, label: cta.label },
            token: p.token,
            baseUrl,
          },
          { from, replyTo: process.env.REPLY_TO },
        );
        if (result.error) console.error(`Fahrgemeinschafts-Mail an ${p.email} fehlgeschlagen: ${result.error}`);
        await new Promise((r) => setTimeout(r, 600)); // stay under the mail provider's rate limit
      }
    } catch (err) {
      console.error("Fahrgemeinschafts-Mail fehlgeschlagen:", err);
    }
  });
}

/** Gives seats back after passengers left (one per removed passenger row). */
async function releaseSeats(rideIds: number[]) {
  for (const id of rideIds) {
    await getDb()
      .update(rides)
      .set({ taken: sql`greatest(${rides.taken} - 1, 0)` })
      .where(eq(rides.id, id));
  }
}

/**
 * Removes the player as passenger from the rides of this match (except `keepRideId`); returns the drivers they left.
 */
async function leaveAllRides(playerId: number, matchId: number, keepRideId?: number): Promise<number[]> {
  const db = getDb();
  const removed = await db
    .delete(ridePassengers)
    .where(
      and(
        eq(ridePassengers.playerId, playerId),
        sql`${ridePassengers.rideId} in (select id from rides where match_id = ${matchId})`,
        keepRideId ? sql`${ridePassengers.rideId} <> ${keepRideId}` : undefined,
      ),
    )
    .returning({ rideId: ridePassengers.rideId });
  if (removed.length === 0) return [];
  await releaseSeats(removed.map((r) => r.rideId));
  const drivers = await db
    .select({ id: rides.driverPlayerId })
    .from(rides)
    .where(inArray(rides.id, removed.map((r) => r.rideId)));
  return drivers.map((d) => d.id);
}

function refresh() {
  revalidatePath("/punktspiele");
  revalidatePath("/spieler/[token]/punktspiele", "page");
}

export async function offerRide(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const match = await loadUpcomingMatch(Number(formData.get("matchId")));
  if (!match) return { error: "Das Spiel ist schon vorbei." };

  const seats = Number(formData.get("seats"));
  const meetingPoint = String(formData.get("meetingPoint") ?? "").trim() || DEFAULT_MEETING_POINT;
  const departureTime = String(formData.get("departureTime") ?? "");
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) return { error: "Bitte 1 bis 8 freie Plätze angeben." };
  if (!/^\d{2}:\d{2}$/.test(departureTime)) return { error: "Bitte eine Abfahrtszeit angeben." };
  if (meetingPoint.length > 80) return { error: "Der Treffpunkt ist zu lang." };

  const db = getDb();
  const [existing] = await db
    .select({ id: rides.id })
    .from(rides)
    .where(and(eq(rides.matchId, match.id), eq(rides.driverPlayerId, player.id)))
    .limit(1);
  if (existing) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ridePassengers)
      .where(eq(ridePassengers.rideId, existing.id));
    if (seats < count) return { error: `Es fahren schon ${count} mit – weniger Plätze gehen nicht.` };
  }

  // A driver doesn't also ride with someone else or keep looking for a seat.
  const leftDrivers = await leaveAllRides(player.id, match.id);
  await db
    .delete(rideRequests)
    .where(and(eq(rideRequests.matchId, match.id), eq(rideRequests.playerId, player.id)));

  // xmax = 0 only for a freshly inserted row — so of two simultaneous offers, only one counts as "new".
  const [saved] = await db
    .insert(rides)
    .values({ matchId: match.id, driverPlayerId: player.id, seats, meetingPoint, departureTime })
    .onConflictDoUpdate({ target: [rides.matchId, rides.driverPlayerId], set: { seats, meetingPoint, departureTime } })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  const name = playerLabel(player);
  const detail = matchLine(match);
  await notify(leftDrivers, match.id, `${name} fährt doch nicht bei dir mit`, () => `${name} fährt jetzt selbst und nicht mehr bei dir mit.`, detail);
  if (saved?.inserted) {
    const searching = await db
      .select({ playerId: rideRequests.playerId })
      .from(rideRequests)
      .where(eq(rideRequests.matchId, match.id));
    await notify(
      searching.map((s) => s.playerId),
      match.id,
      `Mitfahrt frei: ${name} fährt am ${formatDayShort(match.startsAt)}`,
      () => `${name} fährt ab ${meetingPoint} um ${departureTime} Uhr und hat ${seats} ${seats === 1 ? "Platz" : "Plätze"} frei.`,
      detail,
    );
  }
  refresh();
}

export async function cancelRide(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const ride = await loadRide(Number(formData.get("rideId")));
  if (!ride || ride.driverPlayerId !== player.id) return { error: "Diese Fahrt gibt es nicht mehr." };
  const match = await loadUpcomingMatch(ride.matchId);

  const db = getDb();
  const passengers = await db
    .select({ playerId: ridePassengers.playerId })
    .from(ridePassengers)
    .where(eq(ridePassengers.rideId, ride.id));
  await db.delete(rides).where(eq(rides.id, ride.id));

  if (match) {
    const name = playerLabel(player);
    await notify(
      passengers.map((p) => p.playerId),
      match.id,
      `${name} kann doch nicht fahren`,
      () => `${name} hat die Fahrt abgesagt – bitte such dir eine andere Mitfahrt.`,
      matchLine(match),
    );
  }
  refresh();
}

export async function joinRide(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const ride = await loadRide(Number(formData.get("rideId")));
  if (!ride) return { error: "Diese Fahrt gibt es nicht mehr." };
  if (ride.driverPlayerId === player.id) return { error: "Das ist deine eigene Fahrt." };
  const match = await loadUpcomingMatch(ride.matchId);
  if (!match) return { error: "Das Spiel ist schon vorbei." };

  const db = getDb();
  const [ownRide] = await db
    .select({ id: rides.id })
    .from(rides)
    .where(and(eq(rides.matchId, match.id), eq(rides.driverPlayerId, player.id)))
    .limit(1);
  if (ownRide) return { error: "Du fährst selbst – sag erst deine Fahrt ab." };

  const [aboard] = await db
    .select({ id: ridePassengers.id })
    .from(ridePassengers)
    .where(and(eq(ridePassengers.rideId, ride.id), eq(ridePassengers.playerId, player.id)))
    .limit(1);
  if (aboard) return;

  // Take the seat on the ride row itself: "taken < seats" is re-checked on the locked row (and a CHECK backs it up),
  // so two players grabbing the last seat at once can't both get it.
  const [seat] = await db
    .update(rides)
    .set({ taken: sql`${rides.taken} + 1` })
    .where(and(eq(rides.id, ride.id), sql`${rides.taken} < ${rides.seats}`))
    .returning({ id: rides.id });
  if (!seat) return { error: "Das Auto ist leider schon voll." };

  const [taken] = await db
    .insert(ridePassengers)
    .values({ rideId: ride.id, playerId: player.id })
    .onConflictDoNothing()
    .returning({ id: ridePassengers.id });
  if (!taken) {
    // A double tap got here first — give back the seat this request counted.
    await releaseSeats([ride.id]);
    return;
  }

  // Now that the new seat is safe, leave any other car for this match.
  const leftDrivers = await leaveAllRides(player.id, match.id, ride.id);
  await db
    .delete(rideRequests)
    .where(and(eq(rideRequests.matchId, match.id), eq(rideRequests.playerId, player.id)));

  const name = playerLabel(player);
  const detail = matchLine(match);
  await notify([ride.driverPlayerId], match.id, `${name} fährt bei dir mit`, () => `${name} fährt am ${formatDayShort(match.startsAt)} bei dir mit.`, detail);
  await notify(leftDrivers, match.id, `${name} fährt doch nicht bei dir mit`, () => `${name} fährt jetzt bei jemand anderem mit.`, detail);
  refresh();
}

export async function leaveRide(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const ride = await loadRide(Number(formData.get("rideId")));
  if (!ride) return;
  const db = getDb();
  const removed = await db
    .delete(ridePassengers)
    .where(and(eq(ridePassengers.rideId, ride.id), eq(ridePassengers.playerId, player.id)))
    .returning();
  await releaseSeats(removed.map((r) => r.rideId));

  const match = await loadUpcomingMatch(ride.matchId);
  if (match && removed.length > 0) {
    const name = playerLabel(player);
    await notify([ride.driverPlayerId], match.id, `${name} fährt doch nicht bei dir mit`, () => `${name} fährt doch nicht bei dir mit – ein Platz ist wieder frei.`, matchLine(match));
  }
  refresh();
}

export async function requestRide(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const match = await loadUpcomingMatch(Number(formData.get("matchId")));
  if (!match) return { error: "Das Spiel ist schon vorbei." };
  await getDb().insert(rideRequests).values({ matchId: match.id, playerId: player.id }).onConflictDoNothing();
  refresh();
}

export async function withdrawRequest(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const matchId = Number(formData.get("matchId"));
  await getDb()
    .delete(rideRequests)
    .where(and(eq(rideRequests.matchId, matchId), eq(rideRequests.playerId, player.id)));
  refresh();
}

/** "Kann ich an diesem Spieltag?" — one answer per player and Saturday. */
export async function setAvailability(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  if (!player.playsMatches) return { error: "Du bist nicht für die Punktspiele eingeplant." };
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["ja", "vielleicht", "nein"].includes(status)) {
    return { error: "Ungültige Antwort." };
  }

  const db = getDb();
  const [dayMatches, entries] = await Promise.all([
    db
      .select({ ageClass: teams.ageClass, rank: teams.rank })
      .from(matches)
      .innerJoin(teams, eq(matches.teamId, teams.id))
      .where(and(eq(matches.matchDate, date), sql`${matches.startsAt} > now()`)),
    db.select().from(rosterEntries).where(eq(rosterEntries.playerId, player.id)),
  ]);
  const roster: PlayerRoster = {};
  for (const e of entries) roster[e.ageClass as AgeClass] = { position: e.position, countsAsGerman: e.countsAsGerman };
  if (!dayMatches.some((m) => canBeAsked(roster, { ageClass: m.ageClass as AgeClass, rank: m.rank }))) {
    return { error: "An diesem Tag gibt es kein Spiel für dich." };
  }

  await db
    .insert(availability)
    .values({ playerId: player.id, matchDate: date, status })
    .onConflictDoUpdate({
      target: [availability.playerId, availability.matchDate],
      set: { status, respondedAt: new Date() },
    });

  revalidatePath("/spieler/[token]", "page");
  revalidatePath("/spieler/[token]/punktspiele", "page");
  revalidatePath("/spieler/[token]/mannschaftsfuehrer", "page");
}

const CAPTAIN_LINES: Record<NonNullable<ReturnType<typeof responseAlerts>["captain"]>, (name: string) => string> = {
  absage: (name) => `${name} hat abgesagt.`,
  "doch-dabei": (name) => `${name} ist doch dabei.`,
  "springt-ein": (name) => `${name} (Ersatz) kann einspringen.`,
  "ersatz-kann-nicht": (name) => `${name} (Ersatz) kann leider auch nicht.`,
};

/** A lined-up player confirms or cancels. Alerts the Mannschaftsführer and asks the Ersatz where needed. */
export async function respondToLineup(formData: FormData): Promise<RideActionResult> {
  const player = await loadPlayer(formData);
  const matchId = Number(formData.get("matchId"));
  const response = String(formData.get("response")) as LineupResponse;
  if (response !== "ja" && response !== "nein") return { error: "Ungültige Antwort." };

  const match = await loadUpcomingMatch(matchId);
  if (!match) return { error: "Das Spiel ist schon vorbei." };

  const db = getDb();
  const [row] = await db
    .select({
      role: lineups.role,
      response: lineups.response,
      captainId: teams.captainPlayerId,
      matchCaptainId: matches.matchCaptainPlayerId,
      published: lineups.publishedAt,
    })
    .from(lineups)
    .innerJoin(matches, eq(lineups.matchId, matches.id))
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .where(and(eq(lineups.matchId, matchId), eq(lineups.playerId, player.id)))
    .limit(1);
  if (!row || !row.published) return { error: "Du bist für dieses Spiel nicht aufgestellt." };

  // Only an actual change updates a row; of two simultaneous identical answers, only one alerts anyone.
  const changed = await db
    .update(lineups)
    .set({ response, respondedAt: new Date() })
    .where(
      and(eq(lineups.matchId, matchId), eq(lineups.playerId, player.id), sql`${lineups.response} is distinct from ${response}`),
    )
    .returning({ id: lineups.id });
  if (changed.length === 0) return;

  const lineupNow = (await getLineups({ publishedOnly: true })).get(matchId) ?? [];
  const alerts = responseAlerts(row.role as LineupRole, row.response as LineupResponse | null, response, lineupNow);
  const name = playerLabel(player);
  const detail = matchLine(match);

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
  if (alerts.askErsatz) {
    const ersatz = lineupNow.filter((e) => e.role === "ersatz" && e.response !== "nein").map((e) => e.playerId);
    await notify(
      ersatz,
      matchId,
      `Ersatz gesucht: ${match.teamName} am ${formatDayShort(match.startsAt)}`,
      () => `${name} hat abgesagt. Du bist Ersatz – kannst du einspringen? Bitte antworte kurz in der App.`,
      detail,
      { path: (p) => `/spieler/${p.token}#spiel-${matchId}`, label: "Jetzt antworten" },
    );
  }

  revalidatePath("/spieler/[token]", "page");
  revalidatePath("/spieler/[token]/punktspiele", "page");
  revalidatePath("/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]", "page");
}
