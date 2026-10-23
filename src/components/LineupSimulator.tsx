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
import type { AgeClass } from "@/lib/matches";

export type SimDay = {
  date: string;
  label: string;
  matches: { matchId: number; team: string; ageClass: AgeClass; rank: number }[];
  /** Said kann/vielleicht and aren't lined up yet. */
  players: { playerId: number; name: string; status: "ja" | "vielleicht" }[];
};

const FOCI = [
  { key: "stark", label: "Stark" },
  { key: "ausgewogen", label: "Mitte" },
  { key: "rotation", label: "Rotation" },
] as const;

type Choice = "pin" | "out";

/** Claude proposes the lineups of a whole Spieltag; the captain can mark their own team's part of it. */
export function LineupSimulator({
  token,
  days,
  initialDate,
}: {
  token: string;
  days: SimDay[];
  /** Preselected Spieltag, e.g. when coming from a match page. */
  initialDate?: string;
}) {
  const [date, setDate] = useState(days.find((d) => d.date === initialDate)?.date ?? days[0]?.date ?? "");
  const [focus, setFocus] = useState<Record<number, string>>({});
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [allowMaybe, setAllowMaybe] = useState(true);
  const [ersatz, setErsatz] = useState(true);
  const [avoidFestspielen, setAvoidFestspielen] = useState(true);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<SimulationView | null>(null);
  const [pending, startTransition] = useTransition();

  const day = days.find((d) => d.date === date);
  if (!day) return <p className="text-sm text-[var(--color-ink-muted)]">Keine anstehenden Spieltage.</p>;

  const toggle = (playerId: number, choice: Choice) =>
    setChoices((c) => {
      const next = { ...c };
      if (next[playerId] === choice) delete next[playerId];
      else next[playerId] = choice;
      return next;
    });
  const picked = (choice: Choice) =>
    day.players.filter((p) => choices[p.playerId] === choice).map((p) => p.playerId);

  const run = () =>
    startTransition(async () => {
      setResult(null);
      try {
        setResult(
          await simulateLineups(token, {
            date,
            focus: Object.fromEntries(day.matches.map((m) => [m.matchId, focus[m.matchId] ?? "ausgewogen"])),
            pinned: picked("pin"),
            excluded: picked("out"),
            allowMaybe,
            ersatz,
            avoidFestspielen,
            notes,
          }),
        );
      } catch {
        setResult({ ok: false, error: "Keine Verbindung – bitte noch einmal versuchen." });
      }
    });

  // Wide screens: settings on the left, Claude's proposal on the right.
  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="space-y-4">
        <label className="block text-xs font-semibold">
          Spieltag
          <select
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setChoices({});
              setResult(null);
            }}
            className="mt-1 block w-full rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-3 py-2 text-sm font-normal"
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-1.5 text-xs font-semibold">Worauf kommt es an?</p>
          <div className="space-y-2">
            {day.matches.map((m) => (
              <div key={m.matchId} className="flex items-center gap-2">
                <TeamChip name={m.team} ageClass={m.ageClass} />
                <Segmented
                  options={FOCI}
                  value={focus[m.matchId] ?? "ausgewogen"}
                  onChange={(v) => setFocus((f) => ({ ...f, [m.matchId]: v }))}
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--color-ink-faint)]">
            Stark: die Besten spielen. Mitte: gut besetzt, aber wer wenig gespielt hat, kommt dran. Rotation:
            Einsätze möglichst gleich verteilen.
          </p>
        </div>

        <details className="rounded-[12px] border border-[var(--color-border)] px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold">
            Spieler festlegen oder ausschließen
            <span className="font-normal text-[var(--color-ink-muted)]">
              {" "}
              · {picked("pin").length} fest · {picked("out").length} nicht
            </span>
          </summary>
          {day.players.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Noch keine Zusagen für diesen Tag.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {day.players.map((p) => (
                <li key={p.playerId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {p.name}
                    {p.status === "vielleicht" && (
                      <span className="text-[11px] text-[var(--color-vielleicht)]"> vllt.</span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <ChoiceButton active={choices[p.playerId] === "pin"} onClick={() => toggle(p.playerId, "pin")} tone="ja">
                      📌 Muss
                    </ChoiceButton>
                    <ChoiceButton active={choices[p.playerId] === "out"} onClick={() => toggle(p.playerId, "out")} tone="nein">
                      ✖ Nicht
                    </ChoiceButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>

        <div className="space-y-1 text-sm">
          <Toggle checked={allowMaybe} onChange={setAllowMaybe} label="„Vielleicht“-Sager mit einplanen" />
          <Toggle checked={ersatz} onChange={setErsatz} label="Ersatz einplanen" />
          <Toggle
            checked={avoidFestspielen}
            onChange={setAvoidFestspielen}
            label="Festspielen vermeiden"
            hint="niemand spielt sich in der 1. fest, solange ein anderer frei ist"
          />
        </div>

        <label className="block text-xs font-semibold">
          Sonst noch was? (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="z. B. „Tom und Ben wollen zusammen Doppel spielen“"
            className="mt-1 block w-full rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-3 py-2 text-sm font-normal"
          />
        </label>

        <button
          type="button"
          disabled={pending}
          onClick={run}
          className="rounded-full bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Claude überlegt … (bis zu einer Minute)" : "Aufstellung simulieren"}
        </button>
      </div>
      <div className="mt-4 lg:mt-0">
        {result && !result.ok && <p className="text-sm text-[var(--color-nein)]">{result.error}</p>}
        {result?.ok && <SimulationResult token={token} result={result} />}
        {!result && (
          <p className="hidden rounded-[14px] border border-dashed border-[var(--color-border-strong)] p-4 text-sm text-[var(--color-ink-muted)] lg:block">
            {pending ? "Claude überlegt …" : "Hier erscheint der Vorschlag."}
          </p>
        )}
      </div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-1 justify-end gap-0.5 rounded-full bg-[var(--color-tabs-bg)] p-1 text-[11px]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`flex-1 rounded-full px-1.5 py-1 font-semibold ${
            value === o.key ? "bg-[var(--color-card)] shadow-sm" : "text-[var(--color-ink-muted)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "ja" | "nein";
  children: React.ReactNode;
}) {
  const on = tone === "ja" ? "bg-[var(--color-ja-bg)] text-[var(--color-ja)]" : "bg-[var(--color-nein-bg)] text-[var(--color-nein)]";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        active ? `border-transparent ${on}` : "border-[var(--color-border)] text-[var(--color-ink-faint)]"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-[var(--color-ink-faint)]">{hint}</span>}
      </span>
    </label>
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
