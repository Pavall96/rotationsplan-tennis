import type { MatchView } from "@/lib/matches";
import type { LineupEntry } from "@/lib/lineups";

/**
 * The published lineup on a match card. Names only for players with their personal link, and the Ersatz only to
 * the Ersatz themself — same as for training.
 */
export function LineupLine({
  match,
  entries,
  viewerId,
}: {
  match: MatchView;
  entries: LineupEntry[];
  viewerId: number | null;
}) {
  if (!match.lineupPublishedAt) return null;
  const stamm = entries.filter((e) => e.role === "stamm");
  const mine = entries.find((e) => e.playerId === viewerId);

  if (viewerId === null) {
    return <p className="mt-3 text-xs text-[var(--color-ink-muted)]">Aufstellung steht.</p>;
  }
  return (
    <div className="mt-3 text-sm">
      {mine && (
        <p
          className={`mb-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
            mine.role === "stamm"
              ? "bg-[var(--color-ja-bg)] text-[var(--color-ja)]"
              : "bg-[var(--color-vielleicht-bg)] text-[var(--color-vielleicht)]"
          }`}
        >
          {mine.role === "stamm" ? "Du spielst" : "Du bist Ersatz – halt dir den Termin frei"}
        </p>
      )}
      <p>
        <span className="font-semibold">Aufstellung:</span> {stamm.map((e) => e.name).join(", ")}
      </p>
    </div>
  );
}
