import { eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { players, rides, ridePassengers, rideRequests } from "@/db/schema";
import { playerLabel } from "@/lib/format";

export const DEFAULT_MEETING_POINT = "Vereinsheim";
export const CLUBHOUSE_ADDRESS = "Im Haselter 9, Haus 1, 74080 Heilbronn-Böckingen";

/** Map address for a free-text meeting point — only the clubhouse is known; anything else players agree on. */
export function meetingPointAddress(meetingPoint: string): string | null {
  return meetingPoint.trim().toLowerCase() === DEFAULT_MEETING_POINT.toLowerCase() ? CLUBHOUSE_ADDRESS : null;
}

/** Suggested departure: this long before the match starts (covers most halls in the Bezirk plus warm-up). */
export const DEFAULT_LEAD_MINUTES = 60;

type Person = { playerId: number; name: string };

export type RideView = {
  id: number;
  matchId: number;
  driver: Person;
  seats: number;
  meetingPoint: string;
  departureTime: string; // HH:MM
  passengers: Person[];
};

export type MatchRides = { rides: RideView[]; requests: Person[] };

/** Rides and "suche Mitfahrt" requests for every match, keyed by match id. */
export async function getRidesByMatch(): Promise<Map<number, MatchRides>> {
  const db = getDb();
  const [rideRows, passengerRows, requestRows] = await Promise.all([
    db
      .select({
        id: rides.id,
        matchId: rides.matchId,
        seats: rides.seats,
        meetingPoint: rides.meetingPoint,
        departureTime: rides.departureTime,
        driverId: players.id,
        displayName: players.displayName,
        nickname: players.nickname,
      })
      .from(rides)
      .innerJoin(players, eq(rides.driverPlayerId, players.id))
      .orderBy(asc(rides.departureTime), asc(rides.createdAt)),
    db
      .select({
        rideId: ridePassengers.rideId,
        playerId: players.id,
        displayName: players.displayName,
        nickname: players.nickname,
      })
      .from(ridePassengers)
      .innerJoin(players, eq(ridePassengers.playerId, players.id))
      .orderBy(asc(ridePassengers.createdAt)),
    db
      .select({
        matchId: rideRequests.matchId,
        playerId: players.id,
        displayName: players.displayName,
        nickname: players.nickname,
      })
      .from(rideRequests)
      .innerJoin(players, eq(rideRequests.playerId, players.id))
      .orderBy(asc(rideRequests.createdAt)),
  ]);

  const byMatch = new Map<number, MatchRides>();
  const entry = (matchId: number) => {
    if (!byMatch.has(matchId)) byMatch.set(matchId, { rides: [], requests: [] });
    return byMatch.get(matchId)!;
  };

  const rideById = new Map<number, RideView>();
  for (const r of rideRows) {
    const ride: RideView = {
      id: r.id,
      matchId: r.matchId,
      driver: { playerId: r.driverId, name: playerLabel(r) },
      seats: r.seats,
      meetingPoint: r.meetingPoint,
      departureTime: r.departureTime.slice(0, 5),
      passengers: [],
    };
    rideById.set(r.id, ride);
    entry(r.matchId).rides.push(ride);
  }
  for (const p of passengerRows) {
    rideById.get(p.rideId)?.passengers.push({ playerId: p.playerId, name: playerLabel(p) });
  }
  for (const q of requestRows) {
    entry(q.matchId).requests.push({ playerId: q.playerId, name: playerLabel(q) });
  }
  return byMatch;
}

export function freeSeats(ride: RideView): number {
  return Math.max(0, ride.seats - ride.passengers.length);
}

/** "HH:MM" in Europe/Berlin, DEFAULT_LEAD_MINUTES before the start, rounded down to 5 minutes. */
export function suggestedDeparture(startsAt: Date): string {
  const d = new Date(startsAt.getTime() - DEFAULT_LEAD_MINUTES * 60_000);
  const [h, m] = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .split(":")
    .map(Number);
  return `${String(h).padStart(2, "0")}:${String(m - (m % 5)).padStart(2, "0")}`;
}
