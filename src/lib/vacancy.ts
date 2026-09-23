import type { SessionView } from "@/lib/queries";

/** Whether a session is short of players after cancellations, and whether the Ersatz covers it. */
export type Vacancy = {
  /** Players still missing after counting an Ersatz who said yes. */
  open: number;
  /** Full wording for the session card banner. */
  label: string;
  /** Few words for the compact list row. */
  short: string;
};

function spielerFehlen(n: number) {
  return n === 1 ? "1 Spieler fehlt" : `${n} Spieler fehlen`;
}

export function vacancyStatus(session: SessionView): Vacancy | null {
  const cancelled = session.starters.filter((a) => a.rsvpStatus === "nein").length;
  if (cancelled === 0) return null;

  const ersatz = session.ersatz?.rsvpStatus;

  if (ersatz === "ja") {
    const open = cancelled - 1;
    return open === 0
      ? { open, label: "Ersatz springt ein", short: "Ersatz kommt" }
      : { open, label: `Ersatz springt ein – ${spielerFehlen(open)} noch`, short: spielerFehlen(open) };
  }

  if (ersatz === "offen") {
    return {
      open: cancelled,
      label: cancelled === 1 ? "Ersatz gesucht" : `Ersatz gesucht – ${cancelled} Absagen`,
      short: "Ersatz gesucht",
    };
  }

  // No Ersatz assigned, or the Ersatz can't come either.
  return {
    open: cancelled,
    label: ersatz === "nein" ? `${spielerFehlen(cancelled)} – Ersatz kann auch nicht` : spielerFehlen(cancelled),
    short: spielerFehlen(cancelled),
  };
}

/** True once a starter has said no, i.e. the Ersatz actually has to play. */
export function ersatzNeeded(session: SessionView): boolean {
  return session.starters.some((a) => a.rsvpStatus === "nein");
}

/** "Anna hat" / "Anna und Ben haben" — the starters who cancelled, ready to be followed by "abgesagt". */
export function cancelledStarters(session: SessionView): string {
  const names = session.starters.filter((a) => a.rsvpStatus === "nein").map((a) => a.displayName);
  return `${names.join(" und ")} ${names.length === 1 ? "hat" : "haben"}`;
}
