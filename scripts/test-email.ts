import { getFullSchedule, sessionsForPlayer, getPlayerByToken } from "../src/lib/queries";
import { sendReminderBatch } from "../src/lib/email";

async function main() {
  const token = process.argv[2];
  const to = process.argv[3];
  if (!token || !to) throw new Error("Usage: tsx scripts/test-email.ts <token> <to-email>");

  const player = await getPlayerByToken(token);
  if (!player) throw new Error("Unbekannter Token.");

  const schedule = await getFullSchedule();
  const mine = sessionsForPlayer(schedule, player.id);
  const session = mine[0];
  if (!session) throw new Error("Keine Termine für diesen Spieler.");

  const results = await sendReminderBatch(
    [
      {
        to,
        playerName: player.displayName,
        role: "starter",
        session,
        token: player.token,
        baseUrl: "https://rotationsplan-tennis.vercel.app",
      },
    ],
    { from: process.env.MAIL_FROM! },
  );
  console.log(results);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
