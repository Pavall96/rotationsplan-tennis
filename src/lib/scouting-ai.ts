// Asks Claude for a short assessment of our next match from the ScoutingFacts. The text must not contain any
// opponent (or own) player name; that is checked in code (mentionsName) and Claude gets one chance to fix it.

import Anthropic from "@anthropic-ai/sdk";
import type { ScoutingFacts } from "@/lib/scouting";

const MODEL = "claude-sonnet-5-5";

const SYSTEM = `Du schreibst für die Mannschaftsführer und Spieler eines Tennisvereins eine kurze Einschätzung zum nächsten Punktspiel der eigenen Mannschaft in der Winterrunde.

Du bekommst Fakten zu diesem Spiel als JSON (ScoutingFacts):
- "isHome": true = Heimspiel, false = Auswärtsspiel.
- "groupSize": Anzahl der Mannschaften in der Gruppe.
- "opponent" und "us": der Gegner und wir in der Tabelle. "rank" = Tabellenplatz, "points" = Punkte als "gewonnen:verloren", "matches" = Matches (Einzel und Doppel) bisher, "meetings" = bisher gespielte Begegnungen.
- "opponentHasPlayed": true = mindestens ein Spieler des Gegners hat diese Saison schon ein Einzel gespielt. false = es gibt noch keine Einsatzdaten; dann wurde die wahrscheinliche Aufstellung nur nach LK bzw. Meldeliste geschätzt. Sag das offen und tu nicht so, als wüsstest du mehr.
- "ourLineupPublished": true = unsere Aufstellung ist veröffentlicht. false = unsere Seite ist nur geschätzt (nach Einsätzen und Meldeliste), die Aufstellung steht noch nicht fest.
- "positions": die Einzelpositionen 1 bis n (Position 1 ist die stärkste). Zu Doppeln gibt es keine Daten. Je Position: "theirLk" und "ourLk" (LK; null = unbekannt), "theirAppearances" = Einzel-Einsätze des Gegners an dieser Position, "theirSingles" = deren Einzelbilanz "gewonnen:verloren", "verdict" = Vergleich der LK aus unserer Sicht: "vorne" = wir sind klar stärker, "offen" = ungefähr gleich stark, "hinten" = der Gegner ist klar stärker, null = nicht vergleichbar.
- Niedrigere LK bedeutet stärker.

Schreibe zwei bis drei Sätze auf Deutsch. Regeln für den Ton:
- Aufbauend: zuerst, wo wir gute Chancen haben, dann, wo es schwer wird – das als Herausforderung formuliert, nicht als Schwäche oder Kritik.
- Den Gegner nur über Positionen nennen ("an Position 2"), nie mit Namen. Unsere Spieler auch nicht namentlich.
- Ein bisschen Schwäbisch, dezent und nicht als Karikatur. Höchstens ein, zwei Ausdrücke pro Text.
- Keine Prozentzahlen. Eine Tendenz ist erlaubt (z. B. "eher knapp", "gute Chancen").
- Nur Aussagen, die aus den Fakten folgen – nichts erfinden.
- Doppel nur allgemein erwähnen (etwa, dass sie das Spiel noch drehen können), denn dazu gibt es keine Daten.`;

const SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string" },
  },
  required: ["text"],
  additionalProperties: false,
};

/** API or key problems. The caller leaves the assessment empty and tries again on the next run. */
export class AssessmentError extends Error {}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First of `names` that appears in `text` as a whole word (case-sensitive, Unicode-aware), else null. */
export function mentionsName(text: string, names: string[]): string | null {
  for (const name of names) {
    if (!name) continue;
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "u").test(text)) return name;
  }
  return null;
}

/**
 * The assessment text, or null if Claude named a player twice (do not try again for these facts).
 * Throws AssessmentError on API errors or a missing key.
 */
export async function writeAssessment(facts: ScoutingFacts, forbiddenNames: string[]): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AssessmentError("ANTHROPIC_API_KEY ist nicht eingetragen – ohne Key kann Claude nichts schreiben.");
  }
  const client = new Anthropic();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Fakten (JSON):\n${JSON.stringify(facts)}` },
  ];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await ask(client, messages);
    const text = parse(response);
    if (mentionsName(text, forbiddenNames) === null) return text;

    // Append the whole answer (not just the text) and ask again without names.
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: "Bitte ohne Namen – nenne Spieler nur über ihre Position." });
  }
  return null;
}

async function ask(client: Anthropic, messages: Anthropic.Beta.BetaMessageParam[]) {
  try {
    return await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      // If a safety filter declines (unlikely for tennis), Anthropic retries on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AssessmentError("Der Claude-API-Key ist ungültig.");
    if (err instanceof Anthropic.RateLimitError) throw new AssessmentError("Claude ist gerade ausgelastet.");
    if (err instanceof Anthropic.APIError) {
      console.error("Claude-API-Fehler bei der Gegner-Einschätzung:", err);
      throw new AssessmentError(`Claude hat einen Fehler gemeldet (${err.status ?? "keine Verbindung"}).`);
    }
    throw err;
  }
}

function parse(response: Anthropic.Beta.BetaMessage): string {
  if (response.stop_reason === "refusal") throw new AssessmentError("Claude hat die Anfrage abgelehnt.");
  if (response.stop_reason === "max_tokens") throw new AssessmentError("Claudes Antwort war zu lang und wurde abgeschnitten.");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new AssessmentError("Claude hat keine Einschätzung geliefert.");
  try {
    const text = (JSON.parse(block.text) as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  } catch {
    // fall through
  }
  throw new AssessmentError("Claudes Antwort war keine gültige Einschätzung.");
}
