"use client";

import { useState, useTransition } from "react";
import {
  simulateLineups,
  type SimPlayerView,
  type SimTeamView,
  type SimulationView,
} from "@/app/spieler/[token]/mannschaftsfuehrer/actions";
import { markProposal } from "@/app/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]/actions";
import { TeamChip } from "@/components/MatchCard";

const FOCI = [
  { key: "ausgewogen", label: "Ausgewogen", hint: "1. Mannschaften stark, aber jeder kommt regelmäßig dran" },
  { key: "stark", label: "Möglichst stark", hint: "Die Besten spielen, Rotation nur bei gleicher Stärke" },
  { key: "rotation", label: "Viel Rotation", hint: "Einsätze möglichst gleich verteilen" },
] as const;

/** Claude proposes the lineups of a whole Spieltag; the captain can mark their own team's part of it. */
export function LineupSimulator({ token, days }: { token: string; days: { date: string; label: string }[] }) {
  const [date, setDate] = useState(days[0]?.date ?? "");
  const [focus, setFocus] = useState<string>("ausgewogen");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<SimulationView | null>(null);
  const [pending, startTransition] = useTransition();

  if (days.length === 0) return <p className="text-sm text-[var(--color-ink-muted)]">Keine anstehenden Spieltage.</p>;

  const run = () =>
    startTransition(async () => {
      setResult(null);
      try {
        setResult(await simulateLineups(token, date, focus, notes));
      } catch {
        setResult({ ok: false, error: "Keine Verbindung – bitte noch einmal versuchen." });
      }
    });

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold">
        Spieltag
        <select
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-3 py-2 text-sm font-normal"
        >
          {days.map((d) => (
            <option key={d.date} value={d.date}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-1 text-xs font-semibold">Schwerpunkt</legend>
        <div className="space-y-1">
          {FOCI.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="focus"
                value={f.key}
                checked={focus === f.key}
                onChange={() => setFocus(f.key)}
                className="mt-1"
              />
              <span>
                {f.label} <span className="text-xs text-[var(--color-ink-muted)]">– {f.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-xs font-semibold">
        Hinweise für Claude (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="z. B. „Tom ist angeschlagen, lieber nur als Ersatz“"
          className="mt-1 block w-full rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-3 py-2 text-sm font-normal"
        />
      </label>

      <button
        type="button"
        disabled={pending || !date}
        onClick={run}
        className="rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Claude überlegt … (bis zu einer Minute)" : "Aufstellung simulieren"}
      </button>

      {result && !result.ok && <p className="text-sm text-[var(--color-nein)]">{result.error}</p>}
      {result?.ok && <SimulationResult token={token} result={result} />}
    </div>
  );
}

function SimulationResult({ token, result }: { token: string; result: Extract<SimulationView, { ok: true }> }) {
  return (
    <div className="space-y-3">
      {result.errors.length > 0 && (
        <div className="rounded-[12px] bg-[var(--color-nein-bg)] p-3 text-xs text-[var(--color-nein)]">
          <p className="mb-1 font-semibold">Der Vorschlag hält nicht alle Regeln ein – so nicht übernehmen:</p>
          <ul className="list-disc pl-4">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.teams.map((t) => (
        <TeamProposal key={t.matchId} token={token} team={t} blocked={result.errors.length > 0} />
      ))}

      {result.leftOut.length > 0 && (
        <div className="text-xs">
          <p className="mb-0.5 font-semibold">Haben zugesagt, spielen aber nicht</p>
          <PlayerList players={result.leftOut} />
        </div>
      )}

      {result.hinweise && <p className="text-sm">{result.hinweise}</p>}

      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-[var(--color-vielleicht)]">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-[var(--color-ink-faint)]">
        Nur ein Vorschlag – gespeichert wird nichts, bis du vormerkst oder aufstellst. Kosten dieser Simulation: ca.{" "}
        {result.costCents} Cent.
      </p>
    </div>
  );
}

function TeamProposal({ token, team, blocked }: { token: string; team: SimTeamView; blocked: boolean }) {
  const [state, setState] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toMark = team.stamm.filter((p) => !p.fixed).map((p) => p.playerId);

  const mark = () =>
    startTransition(async () => {
      const res = await markProposal(token, team.matchId, toMark);
      if ("error" in res) setState(res.error);
      else
        setState(
          `${res.marked} vorgemerkt.${res.skipped.length ? ` Nicht vorgemerkt: ${res.skipped.join("; ")}` : ""}`,
        );
    });

  return (
    <div className="rounded-[14px] border border-[var(--color-border)] p-3">
      <p className="mb-1.5 flex items-center gap-2 text-sm">
        <TeamChip name={team.team} ageClass={team.ageClass} />
        <span className="min-w-0 flex-1 truncate">{team.heading}</span>
      </p>
      <p className="text-xs font-semibold">
        Stamm ({team.stamm.length}/{team.playersNeeded})
      </p>
      <PlayerList players={team.stamm} />
      {team.ersatz.length > 0 && (
        <>
          <p className="mt-1 text-xs font-semibold">Ersatz</p>
          <PlayerList players={team.ersatz} />
        </>
      )}
      {team.begruendung && <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">{team.begruendung}</p>}
      {team.own && toMark.length > 0 && !blocked && !state && (
        <button
          type="button"
          disabled={pending}
          onClick={mark}
          className="mt-2 rounded-full border border-dashed border-[var(--color-border-strong)] px-3 py-1 text-xs font-semibold disabled:opacity-50"
        >
          {pending ? "…" : "Stamm vormerken"}
        </button>
      )}
      {state && <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{state}</p>}
    </div>
  );
}

function PlayerList({ players }: { players: (SimPlayerView & { fixed?: boolean })[] }) {
  return (
    <ul className="text-sm">
      {players.map((p) => (
        <li key={p.playerId} className="flex justify-between gap-2">
          <span className="truncate">
            {p.name}
            {p.fixed && <span className="text-[11px] text-[var(--color-ink-faint)]"> (schon aufgestellt)</span>}
          </span>
          <span className="shrink-0 text-right text-[11px] text-[var(--color-ink-faint)]">
            {p.lists}
            {p.note && <span className="block">{p.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
