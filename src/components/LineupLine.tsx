import Link from "next/link";
import type { MatchView } from "@/lib/matches";
import type { LineupEntry } from "@/lib/lineups";
import { activeMatchCaptain, type MatchCaptain } from "@/lib/match-captain";
import { respondToLineup } from "@/app/spieler/[token]/punktspiele/actions";
import { ActionForm } from "@/components/ActionForm";
import { CheckIcon, XIcon } from "@/components/icons";

/**
 * The published lineup on a match card, plus Zu-/Absage for players in it. Names only for players with their
 * personal link, and the Ersatz only to the Ersatz themself — same as for training.
 */
export function LineupLine({
  match,
  entries,
  viewer,
  matchCaptain = null,
  showMeldeliste = false,
}: {
  match: MatchView;
  entries: LineupEntry[];
  viewer: { token: string; playerId: number } | null;
  /** The Spieltags-Mannschaftsführer, if one is set; shown only while they're in the published lineup. */
  matchCaptain?: MatchCaptain | null;
  /** The viewer is a Mannschaftsführer and may open the Meldeliste for any match. */
  showMeldeliste?: boolean;
}) {
  if (!match.lineupPublishedAt) return null;
  if (!viewer) return <p className="mt-3 text-xs text-[var(--color-ink-muted)]">Aufstellung steht.</p>;

  const stamm = entries.filter((e) => e.role === "stamm");
  const doppel = entries.filter((e) => e.role === "doppel");
  const mine = entries.find((e) => e.playerId === viewer.playerId);
  const someoneMissing = stamm.some((e) => e.response === "nein");
  const dayCaptain = activeMatchCaptain(matchCaptain, entries);
  const iAmDayCaptain = dayCaptain?.playerId === viewer.playerId;

  let labels: { ja: string; nein: string } | null = null;
  if (mine?.role === "stamm" || mine?.role === "doppel") labels = { ja: "Ich bin dabei", nein: "Ich kann doch nicht" };
  if (mine?.role === "ersatz") {
    labels = someoneMissing
      ? { ja: "Ich springe ein", nein: "Ich kann nicht" }
      : { ja: "Ich halte mich bereit", nein: "Ich kann nicht" };
  }

  return (
    <div className="mt-3 text-sm">
      {mine && (
        <p
          className={`mb-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
            mine.response === "nein"
              ? "bg-[var(--color-nein-bg)] text-[var(--color-nein)]"
              : mine.role === "stamm" || mine.role === "doppel"
                ? "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
                : "bg-[var(--color-vielleicht-bg)] text-[var(--color-vielleicht)]"
          }`}
        >
          {mine.response === "nein"
            ? "Du hast abgesagt – der Mannschaftsführer weiß Bescheid"
            : mine.role === "stamm"
              ? "Du spielst"
              : mine.role === "doppel"
                ? "Du spielst Doppel – kein Einzel"
                : someoneMissing
                ? "Du bist Ersatz – es fehlt jemand!"
                : "Du bist Ersatz – halt dir den Termin frei"}
        </p>
      )}
      <p>
        <span className="font-semibold">Aufstellung:</span>{" "}
        {stamm.map((e, i) => (
          <span key={e.playerId}>
            {i > 0 && ", "}
            <span className={e.response === "nein" ? "text-[var(--color-nein)] line-through" : ""}>{e.name}</span>
            {e.response === "ja" && <CheckIcon className="ml-0.5 inline h-3 w-3 text-[var(--color-ja)]" />}
          </span>
        ))}
      </p>
      {doppel.length > 0 && (
        <p className="mt-1">
          <span className="font-semibold">Nur Doppel:</span>{" "}
          {doppel.map((e, i) => (
            <span key={e.playerId}>
              {i > 0 && ", "}
              <span className={e.response === "nein" ? "text-[var(--color-nein)] line-through" : ""}>{e.name}</span>
              {e.response === "ja" && <CheckIcon className="ml-0.5 inline h-3 w-3 text-[var(--color-ja)]" />}
            </span>
          ))}
        </p>
      )}
      {dayCaptain && (
        <p className="mt-1">
          <span className="font-semibold">Mannschaftsführer am Spieltag:</span> {iAmDayCaptain ? "du" : dayCaptain.name}
        </p>
      )}
      {(iAmDayCaptain || showMeldeliste) && (
        <Link
          href={`/spieler/${viewer.token}/punktspiele/meldeliste/${match.id}`}
          className="mt-1 inline-block text-xs font-semibold text-[var(--color-brand)] underline underline-offset-2"
        >
          Meldeliste ansehen ›
        </Link>
      )}

      {mine && labels && (
        <ActionForm
          action={respondToLineup}
          hidden={{ token: viewer.token, matchId: match.id }}
          className="mt-2.5 flex flex-wrap gap-2"
        >
          <button
            type="submit"
            name="response"
            value="ja"
            aria-pressed={mine.response === "ja"}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5 text-sm font-semibold ${
              mine.response === "ja" ? "bg-[var(--color-ja)] text-white" : "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
            }`}
          >
            <CheckIcon className="h-3.5 w-3.5" />
            {labels.ja}
          </button>
          <button
            type="submit"
            name="response"
            value="nein"
            aria-pressed={mine.response === "nein"}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5 text-sm font-semibold ${
              mine.response === "nein"
                ? "bg-[var(--color-nein)] text-white"
                : "bg-[var(--color-nein-bg)] text-[var(--color-nein)]"
            }`}
          >
            <XIcon className="h-3.5 w-3.5" />
            {labels.nein}
          </button>
        </ActionForm>
      )}
    </div>
  );
}
