/** WhatsApp message a Mannschaftsführer sends a newly added player so they register their email. */
export function inviteText(name: string, registerUrl: string): string {
  return (
    `Hi ${name}! Die Winterspiele organisieren wir jetzt über unsere Vereins-App. ` +
    `Trag dich hier einmal mit deiner E-Mail ein (einfach deinen Namen auswählen): ${registerUrl}`
  );
}

/** Opens WhatsApp with the text prefilled; the sender picks the chat. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** WhatsApp message from one Mannschaftsführer to another about a player both want on the same day. */
export function coordinationText(o: {
  captainName: string;
  day: string;
  player: string;
  myTeam: string;
  theirTeam: string;
  kind: "aufgestellt" | "vorgemerkt";
}): string {
  return (
    `Hi ${o.captainName}, wegen ${o.day}: Ich würde ${o.player} gern bei ${o.myTeam} einsetzen – ` +
    `du hast ihn bei ${o.theirTeam} ${o.kind}. Wie machen wir's?`
  );
}

/** WhatsApp message to the Mannschaftsführer of another team playing the same day. */
export function sameDayText(o: { captainName: string; day: string; teams: string[] }): string {
  return `Hi ${o.captainName}, wegen ${o.day} (${o.teams.join(" und ")}): Lass uns kurz abstimmen, wer wo spielt.`;
}
