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
