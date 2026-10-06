import type { SessionAssignmentView, SessionView } from "@/lib/queries";

/** Whether a session is short of players after cancellations, and whether the gap is covered. */
export type Vacancy = {
  /** Places still free after counting players who jumped in and an Ersatz who said yes. */
  open: number;
  /** Full wording for the session card banner. */
  label: string;
  /** Few words for the compact list row. */
  short: string;
};

function spielerFehlen(n: number) {
  return n === 1 ? "1 Spieler fehlt" : `${n} Spieler fehlen`;
}

function cancelledCount(session: SessionView) {
  return session.starters.filter((a) => a.rsvpStatus === "nein").length;
}

/** Places cancelled starters left that nobody has taken yet — neither someone who jumped in nor the Ersatz. */
export function openSlots(session: SessionView): number {
  const ersatzPlays = session.ersatz?.rsvpStatus === "ja" ? 1 : 0;
  return Math.max(0, cancelledCount(session) - session.einspringer.length - ersatzPlays);
}

export function vacancyStatus(session: SessionView): Vacancy | null {
  if (cancelledCount(session) === 0) return null;

  const open = openSlots(session);
  const ersatz = session.ersatz?.rsvpStatus;

  if (open === 0) {
    return ersatz === "ja" && session.einspringer.length === 0
      ? { open, label: "Ersatz springt ein", short: "Ersatz kommt" }
      : { open, label: "Vollständig", short: "Vollständig" };
  }

  if (ersatz === "ja") {
    return { open, label: `Ersatz springt ein – ${spielerFehlen(open)} noch`, short: spielerFehlen(open) };
  }

  if (ersatz === "offen") {
    return {
      open,
      label: open === 1 ? "Ersatz gesucht" : `Ersatz gesucht – ${spielerFehlen(open)}`,
      short: "Ersatz gesucht",
    };
  }

  // No Ersatz assigned, or the Ersatz can't come either.
  return {
    open,
    label: ersatz === "nein" ? `${spielerFehlen(open)} – Ersatz kann auch nicht` : spielerFehlen(open),
    short: spielerFehlen(open),
  };
}

/** True while a cancelled place isn't taken by someone who jumped in, i.e. the Ersatz would actually play. */
export function ersatzNeeded(session: SessionView): boolean {
  return cancelledCount(session) - session.einspringer.length > 0;
}

/**
 * After someone jumped in: true when that filled the last free place while the Ersatz still hadn't answered,
 * so the Ersatz should hear they're off the hook.
 */
export function ersatzNoLongerNeeded(session: SessionView, now: Date): boolean {
  return (
    session.ersatz?.rsvpStatus === "offen" &&
    session.einspringer.length > 0 &&
    openSlots(session) === 0 &&
    session.endsAt > now
  );
}

/** The Ersatz once they said yes and a cancelled place is still theirs to fill — then they really play, so it's no secret. */
export function playingErsatz(session: SessionView): SessionAssignmentView | null {
  return session.ersatz?.rsvpStatus === "ja" && ersatzNeeded(session) ? session.ersatz : null;
}

/** Everyone on court: starters (whatever they answered), who jumped in, and the Ersatz once they really play. */
export function lineup(session: SessionView): SessionAssignmentView[] {
  const ersatz = playingErsatz(session);
  return [...session.starters, ...session.einspringer, ...(ersatz ? [ersatz] : [])];
}

/** Who is still expected on court: the lineup without anyone who cancelled. This is what "Mit dabei" lists. */
export function attending(session: SessionView): SessionAssignmentView[] {
  return lineup(session).filter((a) => a.rsvpStatus !== "nein");
}

/** "Anna hat" / "Anna und Ben haben" — the starters who cancelled, ready to be followed by "abgesagt". */
export function cancelledStarters(session: SessionView): string {
  const names = session.starters.filter((a) => a.rsvpStatus === "nein").map((a) => a.displayName);
  return `${names.join(" und ")} ${names.length === 1 ? "hat" : "haben"}`;
}
