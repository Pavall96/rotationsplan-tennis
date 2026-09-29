import { test } from "node:test";
import assert from "node:assert/strict";
import { coordinationText, sameDayText } from "./invite";

test("coordinationText names the player, both teams and the kind of claim", () => {
  assert.equal(
    coordinationText({
      captainName: "Marco",
      day: "Sa., 16.01.",
      player: "Seb",
      myTeam: "Herren 30 II",
      theirTeam: "Herren I",
      kind: "aufgestellt",
    }),
    "Hi Marco, wegen Sa., 16.01.: Ich würde Seb gern bei Herren 30 II einsetzen – du hast ihn bei Herren I aufgestellt. Wie machen wir's?",
  );
  assert.match(
    coordinationText({ captainName: "Marco", day: "Sa., 16.01.", player: "Seb", myTeam: "A", theirTeam: "B", kind: "vorgemerkt" }),
    /du hast ihn bei B vorgemerkt\./,
  );
});

test("sameDayText lists the teams of the day", () => {
  assert.equal(
    sameDayText({ captainName: "Marco", day: "Sa., 16.01.", teams: ["Herren I", "Herren 30 II"] }),
    "Hi Marco, wegen Sa., 16.01. (Herren I und Herren 30 II): Lass uns kurz abstimmen, wer wo spielt.",
  );
});
