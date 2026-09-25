import type { MatchView } from "@/lib/matches";
import {
  freeSeats,
  suggestedDeparture,
  meetingPointAddress,
  DEFAULT_MEETING_POINT,
  type MatchRides,
} from "@/lib/rides";
import { mapsUrl } from "@/lib/format";
import {
  offerRide,
  cancelRide,
  joinRide,
  leaveRide,
  requestRide,
  withdrawRequest,
} from "@/app/spieler/[token]/punktspiele/actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";

const smallButton = "rounded-full px-3 py-1.5 text-xs font-semibold";
const primary = `${smallButton} bg-[var(--color-brand)] text-white`;
const secondary = `${smallButton} border border-[var(--color-border-strong)] text-[var(--foreground)]`;

function summary({ rides, requests }: MatchRides): string {
  if (rides.length === 0 && requests.length === 0) return "noch keine Fahrt eingetragen";
  const parts: string[] = [];
  if (rides.length > 0) {
    const free = rides.reduce((n, r) => n + freeSeats(r), 0);
    parts.push(`${rides.length} ${rides.length === 1 ? "Auto" : "Autos"} · ${free} ${free === 1 ? "Platz" : "Plätze"} frei`);
  }
  if (requests.length > 0) parts.push(`${requests.length} ${requests.length === 1 ? "sucht" : "suchen"} Mitfahrt`);
  return parts.join(" · ");
}

/**
 * Fahrgemeinschaft block on a match card. Without a viewer (public page) it only shows counts — names and
 * buttons need the player's personal link.
 */
export function RideSection({
  match,
  data,
  viewer,
}: {
  match: MatchView;
  data: MatchRides;
  viewer: { token: string; playerId: number } | null;
}) {
  if (!viewer) {
    return (
      <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
        <span className="font-semibold text-[var(--foreground)]">Fahrgemeinschaft:</span> {summary(data)}
      </p>
    );
  }

  const { token, playerId } = viewer;
  const myRide = data.rides.find((r) => r.driver.playerId === playerId) ?? null;
  const ridingWith = data.rides.find((r) => r.passengers.some((p) => p.playerId === playerId)) ?? null;
  const searching = data.requests.some((r) => r.playerId === playerId);
  const others = data.requests.filter((r) => r.playerId !== playerId);

  return (
    <details
      open={Boolean(myRide || ridingWith || searching) || undefined}
      className="group mt-3 rounded-[14px] border border-[var(--color-border)] px-3 py-2.5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
        <span>
          <span className="font-semibold">Fahrgemeinschaft</span>
          <span className="block text-xs text-[var(--color-ink-muted)]">
            {myRide
              ? "Du fährst"
              : ridingWith
                ? `Du fährst bei ${ridingWith.driver.name} mit`
                : searching
                  ? "Du suchst eine Mitfahrt"
                  : summary(data)}
          </span>
        </span>
        <span className="text-xs text-[var(--color-ink-faint)] group-open:rotate-180">▾</span>
      </summary>

      <div className="mt-3 space-y-3">
        {data.rides.map((ride) => {
          const free = freeSeats(ride);
          const mine = ride.driver.playerId === playerId;
          const aboard = ride.passengers.some((p) => p.playerId === playerId);
          return (
            <div key={ride.id} className="rounded-[10px] bg-[var(--color-tabs-bg)] px-3 py-2">
              <p className="text-sm">
                <span className="font-semibold">{mine ? "Du" : ride.driver.name}</span> · ab{" "}
                <MeetingPoint name={ride.meetingPoint} /> · {ride.departureTime} Uhr
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">
                {ride.passengers.length > 0 ? `Mit: ${ride.passengers.map((p) => p.name).join(", ")} · ` : ""}
                {free > 0 ? `${free} ${free === 1 ? "Platz" : "Plätze"} frei` : "voll"}
              </p>
              <div className="mt-2">
                {mine ? (
                  <ActionForm action={cancelRide} hidden={{ token, rideId: ride.id }}>
                    <SubmitButton className={secondary}>Fahrt absagen</SubmitButton>
                  </ActionForm>
                ) : aboard ? (
                  <ActionForm action={leaveRide} hidden={{ token, rideId: ride.id }}>
                    <SubmitButton className={secondary}>Doch nicht mitfahren</SubmitButton>
                  </ActionForm>
                ) : (
                  !myRide &&
                  free > 0 && (
                    <ActionForm action={joinRide} hidden={{ token, rideId: ride.id }}>
                      <SubmitButton className={primary}>Mitfahren</SubmitButton>
                    </ActionForm>
                  )
                )}
              </div>
            </div>
          );
        })}

        {others.length > 0 && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            <span className="font-semibold">Suchen eine Mitfahrt:</span> {others.map((r) => r.name).join(", ")}
          </p>
        )}

        <details className="rounded-[10px] border border-dashed border-[var(--color-border-strong)] px-3 py-2">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--color-brand)]">
            {myRide ? "Fahrt ändern" : "Ich fahre und nehme jemanden mit"}
          </summary>
          <ActionForm action={offerRide} hidden={{ token, matchId: match.id }} className="mt-2.5 space-y-2.5">
            <div className="flex gap-2">
              <label className="w-24 shrink-0 text-xs font-semibold">
                Freie Plätze
                <select
                  name="seats"
                  defaultValue={myRide?.seats ?? 3}
                  className="mt-1 w-full rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-2 py-2 text-sm"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28 shrink-0 text-xs font-semibold">
                Abfahrt
                <input
                  type="time"
                  name="departureTime"
                  required
                  step={300}
                  defaultValue={myRide?.departureTime ?? suggestedDeparture(match.startsAt)}
                  className="mt-1 w-full rounded-[10px] border border-[var(--color-border-strong)] bg-transparent px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs font-semibold">
              Treffpunkt
              <input
                type="text"
                name="meetingPoint"
                maxLength={80}
                defaultValue={myRide?.meetingPoint ?? DEFAULT_MEETING_POINT}
                className="mt-1 w-full rounded-[10px] border border-[var(--color-border-strong)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <SubmitButton className={primary}>{myRide ? "Speichern" : "Fahrt anbieten"}</SubmitButton>
          </ActionForm>
        </details>

        {!myRide && !ridingWith && (
          <ActionForm action={searching ? withdrawRequest : requestRide} hidden={{ token, matchId: match.id }}>
            <SubmitButton className={secondary}>
              {searching ? "Ich brauche doch keine Mitfahrt" : "Ich suche eine Mitfahrt"}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </details>
  );
}

function MeetingPoint({ name }: { name: string }) {
  const address = meetingPointAddress(name);
  if (!address) return <>{name}</>;
  return (
    <a href={mapsUrl(address)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {name}
    </a>
  );
}
