// Asks Claude for a Spieltag's lineups. Claude weighs strength against fairness; the WTB rules are checked in code
// (checkProposal) and Claude gets one chance to fix what breaks them.

import Anthropic from "@anthropic-ai/sdk";
import { checkProposal, type CheckedDay, type Proposal, type SimInput } from "@/lib/lineup-sim";

const MODEL = "claude-opus-5-5";
// Claude Opus 5.5 list prices in USD per million tokens — only for the "ca. x Cent" hint on the page.
const PRICE_INPUT = 4;
const PRICE_OUTPUT = 20;

const SYSTEM = `Du hilfst den Mannschaftsführern eines Tennisvereins, die Aufstellungen für einen Spieltag der Winterrunde zu planen.

Du bekommst für einen Spieltag alle Spiele (Teams) und die Spieler, die an dem Tag können. Schlage für jedes Spiel vor, wer im Stamm spielt und wer Ersatz ist.

Feste Regeln – die werden im Code geprüft, ein Verstoß macht den Vorschlag ungültig:
- Für ein Spiel nur Spieler aus dessen "candidates". Nur diese dürfen für das Team spielen und stehen zur Verfügung.
- "fixedStamm" und "fixedErsatz" sind schon aufgestellt. Gib sie NICHT noch einmal aus – nur die Spieler, die du dazunimmst.
- Stamm: zusammen mit fixedStamm genau "playersNeeded" Spieler, sofern genug Kandidaten da sind.
- Ersatz: wenn "ersatz" true ist, 0 oder 1 Spieler pro Spiel, nur wenn nach dem Stamm noch jemand übrig ist. Wenn false: keinen Ersatz.
- Jeder Spieler höchstens einmal am ganzen Tag – auch ein Ersatz zählt (er muss einspringen können).
- Höchstens ein Spieler mit countsAsGerman=false im Stamm eines Spiels.
- Spieler mit pinned=true müssen in einem Stamm stehen – such das passende Team aus.
- Wenn "avoidFestspielen" true ist: Kandidaten mit wouldFestspielen=true nur in den Stamm, wenn sonst niemand für das Team frei wäre (außer sie sind pinned). Dieser Einsatz in der 1. Mannschaft würde den Spieler für die 2. sperren.

Jedes Spiel hat einen Schwerpunkt ("focus"), den der Mannschaftsführer gewählt hat:
- "stark": die stärksten verfügbaren Spieler. Rotation nur, wenn Spieler etwa gleich stark sind.
- "ausgewogen": stark genug, um gut mitzuhalten, aber wer zugesagt und bisher wenig gespielt hat, kommt zum Zug.
- "rotation": Einsätze möglichst gleichmäßig verteilen – wer im Verhältnis zu seinen Zusagen am wenigsten gespielt hat, zuerst. Stärke nur bei Gleichstand.
Kommt ein Spieler für mehrere Teams in Frage, verteile so, dass alle Schwerpunkte möglichst gut erfüllt sind – meist hat ein "stark"-Team Vorrang bei den Besten.

Spielstärke: Niedrigere Position auf der Meldeliste ("positions", "lists") und niedrigere LK bedeuten stärker. Die 1. Mannschaft (rank 1) ist normalerweise stärker besetzt als die 2.
Fairness: "zusagenBisher" ist, wie oft jemand an früheren Spieltagen zugesagt hat, "einsaetzeBisher", wie oft er im Stamm stand. Wer oft zugesagt, aber selten gespielt hat, ist "dran".
Spieler mit status "vielleicht" nur nehmen, wenn es sonst nicht reicht oder es für die Fairness klar besser ist.

Begründung pro Team: 1–2 kurze Sätze auf Deutsch, für Vereinsmitglieder verständlich, Namen statt IDs.
Hinweise: 1–3 Sätze zum ganzen Tag, z. B. wer nicht spielt und warum, oder wer beim nächsten Mal dran ist.`;

const SCHEMA = {
  type: "object",
  properties: {
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          matchId: { type: "integer" },
          stamm: { type: "array", items: { type: "integer" } },
          ersatz: { type: "array", items: { type: "integer" } },
          begruendung: { type: "string" },
        },
        required: ["matchId", "stamm", "ersatz", "begruendung"],
        additionalProperties: false,
      },
    },
    hinweise: { type: "string" },
  },
  required: ["teams", "hinweise"],
  additionalProperties: false,
};

export type AiResult = { day: CheckedDay; hinweise: string; costUsd: number; attempts: number };

export class SimulationError extends Error {}

/** One Spieltag. Throws SimulationError with a message fit for the page. */
export async function proposeLineups(input: SimInput, notes: string): Promise<AiResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new SimulationError("ANTHROPIC_API_KEY ist bei Vercel nicht eingetragen – ohne Key kann Claude nicht rechnen.");
  }
  const client = new Anthropic();

  const task =
    (notes ? `Hinweise vom Mannschaftsführer: ${notes}\n\n` : "") + `Spieltag (JSON):\n${JSON.stringify(input)}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: task }];

  let costUsd = 0;
  let result: { day: CheckedDay; hinweise: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await ask(client, messages);
    costUsd += (response.usage.input_tokens * PRICE_INPUT + response.usage.output_tokens * PRICE_OUTPUT) / 1_000_000;
    const proposal = parse(response);
    result = { day: checkProposal(input, proposal), hinweise: proposal.hinweise };
    if (result.day.errors.length === 0) return { ...result, costUsd, attempts: attempt };

    // Append the whole answer (not just the text) and ask for a corrected version.
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content:
        `Der Vorschlag passt noch nicht:\n- ${result.day.errors.join("\n- ")}\n\n` +
        "Bitte gib den kompletten Vorschlag für alle Spiele korrigiert noch einmal aus.",
    });
  }
  return { ...result!, costUsd, attempts: 2 };
}

async function ask(client: Anthropic, messages: Anthropic.Beta.BetaMessageParam[]) {
  try {
    return await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      // If a safety filter declines (unlikely for tennis), Anthropic retries on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new SimulationError("Der Claude-API-Key ist ungültig.");
    if (err instanceof Anthropic.RateLimitError) throw new SimulationError("Claude ist gerade ausgelastet – gleich noch mal versuchen.");
    if (err instanceof Anthropic.APIError) {
      console.error("Claude-API-Fehler bei der Aufstellungs-Simulation:", err);
      throw new SimulationError(`Claude hat einen Fehler gemeldet (${err.status ?? "keine Verbindung"}).`);
    }
    throw err;
  }
}

function parse(response: Anthropic.Beta.BetaMessage): Proposal {
  if (response.stop_reason === "refusal") throw new SimulationError("Claude hat die Anfrage abgelehnt.");
  if (response.stop_reason === "max_tokens") throw new SimulationError("Claudes Antwort war zu lang und wurde abgeschnitten.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new SimulationError("Claude hat keinen Vorschlag geliefert.");
  try {
    return JSON.parse(text.text) as Proposal;
  } catch {
    throw new SimulationError("Claudes Antwort war kein gültiger Vorschlag.");
  }
}
