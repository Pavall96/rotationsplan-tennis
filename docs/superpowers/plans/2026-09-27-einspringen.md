# Einspringen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any rotation player who is free that evening can take a place a starter cancelled, first come first served, from their personal page or from a "Platz frei" email sent with the day's reminders.

**Architecture:** A new `session_assignments.role` value `'einspringer'` records who jumped in (plus an `rsvps` row `ja`). Pure functions in `src/lib/vacancy.ts` (slot counting, status text) and a new `src/lib/einspringen.ts` (who may jump in) drive UI, actions and emails. The only race-sensitive writes (claiming a place, taking a cancellation back) live in a new `src/lib/slots.ts` and run as one Neon HTTP transaction behind a per-session advisory lock.

**Tech Stack:** Next.js 16 App Router (server components + server actions, `after()`), Drizzle ORM 0.45 over `drizzle-orm/neon-http`, Resend, Tailwind v4, `node --test` via `tsx`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-einspringen-design.md`. UI copy is German; code comments are English, matching the codebase.
- Never show the designated Ersatz's name in the UI (existing product rule). Einspringer names ARE shown.
- `DATABASE_URL` in `.env.local` points at the **production** database. Do not click "Ich springe ein", RSVP buttons, or run write scripts against it during development. Read-only page loads are fine.
- The production schema change (Task 8) is run only after Pablo confirms in chat.
- Tests: `npm test` (runs `tsx --test src/**/*.test.ts`). Type check: `npx tsc --noEmit`. Lint: `npm run lint`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `src/db/schema.ts` (modify) | Allow role `'einspringer'` |
| `drizzle/manual-migrations.sql` (modify) | Record the production `ALTER` |
| `src/lib/queries.ts` (modify) | `SessionView.einspringer`, role helpers know the new role |
| `src/lib/vacancy.ts` (modify) | `openSlots`, `vacancyStatus`, `ersatzNeeded`, `ersatzNoLongerNeeded` |
| `src/lib/vacancy.test.ts` (create) | Tests for the above |
| `src/lib/test-fixtures.ts` (create) | `SessionView` builder shared by tests |
| `src/lib/einspringen.ts` (create) | `canJumpIn`, `jumpInOptions`, `openSlotRecipients` |
| `src/lib/einspringen.test.ts` (create) | Tests for the above |
| `src/lib/slots.ts` (create) | `claimSlot`, `retractCancellation`, `leaveSlot` (locked transactions) |
| `scripts/check-slots-sql.ts` (create) | Runs the slot SQL in a transaction that is forced to roll back |
| `src/lib/ersatz-alert.ts` (modify) | New `notifyErsatzTakenOver` |
| `src/lib/email.ts` (modify) | `uebernommen` alert kind, single-button shell, "Platz frei" email |
| `src/lib/format.ts` (modify) | `rsvpLabels` accepts `einspringer` |
| `src/app/spieler/[token]/actions.ts` (modify) | `jumpIn`, `jumpInFromEmail`, einspringer/retract branches in `saveRsvp` |
| `src/components/JumpInForm.tsx` (create) | "Ich springe ein" button form |
| `src/components/FreeSlotCard.tsx` (create) | Card in the "Freie Plätze" section |
| `src/app/spieler/[token]/page.tsx` (modify) | "Freie Plätze" section, einspringer cards, "Platz übernommen" |
| `src/app/spieler/[token]/antwort/page.tsx` (modify) | Jump-in view, "Schon vergeben", einspringer, "übernommen" |
| `src/components/SessionCard.tsx` (modify) | Einspringer rows, hint |
| `src/lib/reminders.ts` (modify) | Remind einspringer, send "Platz frei" mails |
| `src/lib/ics.ts`, `src/app/api/ics/[token]/rotationsplan.ics/route.ts` (modify) | Einspringer sessions in the calendar |

---

### Task 1: Data model — role `einspringer` and `SessionView.einspringer`

**Files:**
- Modify: `src/db/schema.ts:80-82`
- Modify: `drizzle/manual-migrations.sql` (append)
- Modify: `src/lib/queries.ts`
- Create: `src/lib/test-fixtures.ts`

**Interfaces:**
- Produces: `type AssignmentRole = "starter" | "ersatz" | "trainer" | "einspringer"`; `SessionView.einspringer: SessionAssignmentView[]` (sorted by name); `myRoleInSession(...)` returns `AssignmentRole | null`; `sessionsForPlayer` includes einspringer sessions; test helpers `assignment(playerId, rsvpStatus?, role?)` and `makeSession(overrides?)`.

- [ ] **Step 1: Widen the check constraint in the schema**

In `src/db/schema.ts`, replace

```ts
    check("session_assignments_role_check", sql`${table.role} in ('starter', 'ersatz', 'trainer')`),
```

with

```ts
    // 'einspringer': a rotation player who took a place a starter cancelled (always paired with an rsvps 'ja').
    check("session_assignments_role_check", sql`${table.role} in ('starter', 'ersatz', 'trainer', 'einspringer')`),
```

- [ ] **Step 2: Record the production migration**

Append to `drizzle/manual-migrations.sql`:

```sql

-- 2026-09-27: allow the 'einspringer' session_assignments role (a player who took a cancelled place).
ALTER TABLE session_assignments DROP CONSTRAINT session_assignments_role_check;
ALTER TABLE session_assignments ADD CONSTRAINT session_assignments_role_check
  CHECK (role in ('starter', 'ersatz', 'trainer', 'einspringer'));
```

- [ ] **Step 3: Extend the query layer**

In `src/lib/queries.ts`:

Replace the `SessionAssignmentView` type with

```ts
export type AssignmentRole = "starter" | "ersatz" | "trainer" | "einspringer";

export type SessionAssignmentView = {
  playerId: number;
  displayName: string;
  role: AssignmentRole;
  slot: number | null;
  rsvpStatus: RsvpStatus;
};
```

In `SessionView`, after `trainer: SessionAssignmentView | null;` add

```ts
  /** Players who took a place a starter cancelled, first come first served. */
  einspringer: SessionAssignmentView[];
```

In `getFullSchedule`, change `role: a.role as "starter" | "ersatz" | "trainer",` to `role: a.role as AssignmentRole,` and replace the final `return sessionRows.map(...)` body with

```ts
  return sessionRows.map((s) => {
    const all = bySession.get(s.id) ?? [];
    const starters = all.filter((a) => a.role === "starter").sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const ersatz = all.find((a) => a.role === "ersatz") ?? null;
    const trainer = all.find((a) => a.role === "trainer") ?? null;
    const einspringer = all
      .filter((a) => a.role === "einspringer")
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
    return { ...s, starters, ersatz, trainer, einspringer };
  });
```

Replace `sessionsForPlayer` and `myRoleInSession` with

```ts
export function sessionsForPlayer(schedule: SessionView[], playerId: number) {
  return schedule.filter((s) => myRoleInSession(s, playerId) !== null);
}

export function myRoleInSession(session: SessionView, playerId: number): AssignmentRole | null {
  if (session.starters.some((a) => a.playerId === playerId)) return "starter";
  if (session.ersatz?.playerId === playerId) return "ersatz";
  if (session.trainer?.playerId === playerId) return "trainer";
  if (session.einspringer.some((a) => a.playerId === playerId)) return "einspringer";
  return null;
}
```

- [ ] **Step 4: Widen `rsvpLabels`**

In `src/lib/format.ts`, change the signature line to

```ts
export function rsvpLabels(role: "starter" | "ersatz" | "trainer" | "einspringer", ersatzNeeded = false): { ja: string; nein: string } {
```

- [ ] **Step 5: Add the shared test fixture**

Create `src/lib/test-fixtures.ts`:

```ts
import type { AssignmentRole, RsvpStatus, SessionAssignmentView, SessionView } from "@/lib/queries";

export function assignment(
  playerId: number,
  rsvpStatus: RsvpStatus = "offen",
  role: AssignmentRole = "starter",
): SessionAssignmentView {
  return { playerId, displayName: `P${playerId}`, role, slot: null, rsvpStatus };
}

/** A Platz-1 session on 03.11.2026 with starters 1–4 and Ersatz 5, nobody has answered yet. */
export function makeSession(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: 1,
    courtSlug: "happy-match",
    courtLabel: "Platz 1",
    hallName: "Happy Match",
    withCoach: true,
    address: null,
    sessionNo: 1,
    sessionDate: "2026-11-03",
    startsAt: new Date("2026-11-03T19:30:00Z"),
    endsAt: new Date("2026-11-03T21:00:00Z"),
    lkRange: null,
    note: null,
    starters: [assignment(1), assignment(2), assignment(3), assignment(4)],
    ersatz: assignment(5, "offen", "ersatz"),
    trainer: null,
    einspringer: [],
    ...overrides,
  };
}
```

- [ ] **Step 6: Type check and run the existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc prints nothing; tests `pass 17`, `fail 0`. (If tsc reports a place that builds a `SessionView` literal without `einspringer`, add `einspringer: []` there.)

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts drizzle/manual-migrations.sql src/lib/queries.ts src/lib/format.ts src/lib/test-fixtures.ts
git commit -m "Add the einspringer assignment role to the schema and schedule query

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Slot counting and status text (`vacancy.ts`)

**Files:**
- Modify: `src/lib/vacancy.ts`
- Create: `src/lib/vacancy.test.ts`

**Interfaces:**
- Consumes: `SessionView.einspringer`, `makeSession`, `assignment` (Task 1).
- Produces: `openSlots(session: SessionView): number`; `vacancyStatus(session: SessionView): Vacancy | null` (same `Vacancy` type); `ersatzNeeded(session: SessionView): boolean`; `ersatzNoLongerNeeded(session: SessionView, now: Date): boolean`; `cancelledStarters` unchanged.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/vacancy.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { openSlots, vacancyStatus, ersatzNeeded, ersatzNoLongerNeeded } from "./vacancy";
import { assignment, makeSession } from "./test-fixtures";

const oneCancelled = [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)];
const twoCancelled = [assignment(1, "nein"), assignment(2, "nein"), assignment(3), assignment(4)];

test("no cancellation: no open place and no status", () => {
  const s = makeSession();
  assert.equal(openSlots(s), 0);
  assert.equal(vacancyStatus(s), null);
  assert.equal(ersatzNeeded(s), false);
});

test("a cancellation opens a place while the Ersatz hasn't answered", () => {
  const s = makeSession({ starters: oneCancelled });
  assert.equal(openSlots(s), 1);
  assert.deepEqual(vacancyStatus(s), { open: 1, label: "Ersatz gesucht", short: "Ersatz gesucht" });
  assert.equal(ersatzNeeded(s), true);
});

test("the Ersatz saying yes fills the place", () => {
  const s = makeSession({ starters: oneCancelled, ersatz: assignment(5, "ja", "ersatz") });
  assert.equal(openSlots(s), 0);
  assert.deepEqual(vacancyStatus(s), { open: 0, label: "Ersatz springt ein", short: "Ersatz kommt" });
});

test("someone jumping in fills the place and the session reads as complete", () => {
  const s = makeSession({ starters: oneCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(openSlots(s), 0);
  assert.deepEqual(vacancyStatus(s), { open: 0, label: "Vollständig", short: "Vollständig" });
  assert.equal(ersatzNeeded(s), false);
});

test("an Ersatz yes after someone jumped in doesn't go below zero", () => {
  const s = makeSession({
    starters: oneCancelled,
    ersatz: assignment(5, "ja", "ersatz"),
    einspringer: [assignment(9, "ja", "einspringer")],
  });
  assert.equal(openSlots(s), 0);
  assert.equal(vacancyStatus(s)?.label, "Vollständig");
});

test("two cancellations, one filled: one place still open", () => {
  const s = makeSession({ starters: twoCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(openSlots(s), 1);
  assert.deepEqual(vacancyStatus(s), { open: 1, label: "Ersatz gesucht", short: "Ersatz gesucht" });
  assert.equal(ersatzNeeded(s), true);
});

test("status wording once the Ersatz answered or there is none", () => {
  assert.deepEqual(vacancyStatus(makeSession({ starters: twoCancelled })), {
    open: 2,
    label: "Ersatz gesucht – 2 Spieler fehlen",
    short: "Ersatz gesucht",
  });
  assert.deepEqual(vacancyStatus(makeSession({ starters: twoCancelled, ersatz: assignment(5, "ja", "ersatz") })), {
    open: 1,
    label: "Ersatz springt ein – 1 Spieler fehlt noch",
    short: "1 Spieler fehlt",
  });
  assert.deepEqual(vacancyStatus(makeSession({ starters: oneCancelled, ersatz: assignment(5, "nein", "ersatz") })), {
    open: 1,
    label: "1 Spieler fehlt – Ersatz kann auch nicht",
    short: "1 Spieler fehlt",
  });
  assert.deepEqual(vacancyStatus(makeSession({ starters: oneCancelled, ersatz: null })), {
    open: 1,
    label: "1 Spieler fehlt",
    short: "1 Spieler fehlt",
  });
});

test("the Ersatz gets the all-clear only when a jump-in filled the last place and they hadn't answered", () => {
  const before = new Date("2026-11-03T08:00:00Z");
  const filled = makeSession({ starters: oneCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(ersatzNoLongerNeeded(filled, before), true);

  assert.equal(ersatzNoLongerNeeded({ ...filled, ersatz: assignment(5, "nein", "ersatz") }, before), false);
  assert.equal(ersatzNoLongerNeeded({ ...filled, ersatz: null }, before), false);
  assert.equal(ersatzNoLongerNeeded(filled, new Date("2026-11-03T22:00:00Z")), false);
  const stillOpen = makeSession({ starters: twoCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(ersatzNoLongerNeeded(stillOpen, before), false);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL — `openSlots` / `ersatzNoLongerNeeded` are not exported from `./vacancy`.

- [ ] **Step 3: Implement**

Replace `src/lib/vacancy.ts` with:

```ts
import type { SessionView } from "@/lib/queries";

/** Whether a session is short of players after cancellations, and whether the gap is covered. */
export type Vacancy = {
  /** Places still free after counting players who jumped in and an Ersatz who said yes. */
  open: number;
  /** Full wording for the session card banner. */
  label: string;
  /** Few words for the compact list row. */
  short: string;
};

function spielerFehlen(n: number) {
  return n === 1 ? "1 Spieler fehlt" : `${n} Spieler fehlen`;
}

function cancelledCount(session: SessionView) {
  return session.starters.filter((a) => a.rsvpStatus === "nein").length;
}

/** Places cancelled starters left that nobody has taken yet — neither someone who jumped in nor the Ersatz. */
export function openSlots(session: SessionView): number {
  const ersatzPlays = session.ersatz?.rsvpStatus === "ja" ? 1 : 0;
  return Math.max(0, cancelledCount(session) - session.einspringer.length - ersatzPlays);
}

export function vacancyStatus(session: SessionView): Vacancy | null {
  if (cancelledCount(session) === 0) return null;

  const open = openSlots(session);
  const ersatz = session.ersatz?.rsvpStatus;

  if (open === 0) {
    return ersatz === "ja" && session.einspringer.length === 0
      ? { open, label: "Ersatz springt ein", short: "Ersatz kommt" }
      : { open, label: "Vollständig", short: "Vollständig" };
  }

  if (ersatz === "ja") {
    return { open, label: `Ersatz springt ein – ${spielerFehlen(open)} noch`, short: spielerFehlen(open) };
  }

  if (ersatz === "offen") {
    return {
      open,
      label: open === 1 ? "Ersatz gesucht" : `Ersatz gesucht – ${spielerFehlen(open)}`,
      short: "Ersatz gesucht",
    };
  }

  // No Ersatz assigned, or the Ersatz can't come either.
  return {
    open,
    label: ersatz === "nein" ? `${spielerFehlen(open)} – Ersatz kann auch nicht` : spielerFehlen(open),
    short: spielerFehlen(open),
  };
}

/** True while a cancelled place isn't taken by someone who jumped in, i.e. the Ersatz would actually play. */
export function ersatzNeeded(session: SessionView): boolean {
  return cancelledCount(session) - session.einspringer.length > 0;
}

/**
 * After someone jumped in: true when that filled the last free place while the Ersatz still hadn't answered,
 * so the Ersatz should hear they're off the hook.
 */
export function ersatzNoLongerNeeded(session: SessionView, now: Date): boolean {
  return (
    session.ersatz?.rsvpStatus === "offen" &&
    session.einspringer.length > 0 &&
    openSlots(session) === 0 &&
    session.endsAt > now
  );
}

/** "Anna hat" / "Anna und Ben haben" — the starters who cancelled, ready to be followed by "abgesagt". */
export function cancelledStarters(session: SessionView): string {
  const names = session.starters.filter((a) => a.rsvpStatus === "nein").map((a) => a.displayName);
  return `${names.join(" und ")} ${names.length === 1 ? "hat" : "haben"}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (17 existing + 8 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vacancy.ts src/lib/vacancy.test.ts
git commit -m "Count players who jumped in when working out open places

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Who may jump in (`einspringen.ts`)

**Files:**
- Create: `src/lib/einspringen.ts`
- Create: `src/lib/einspringen.test.ts`

**Interfaces:**
- Consumes: `openSlots` (Task 2), `makeSession`, `assignment` (Task 1).
- Produces: `canJumpIn(schedule: SessionView[], session: SessionView, playerId: number, now: Date): boolean`; `jumpInOptions(schedule: SessionView[], playerId: number, now: Date): SessionView[]`; `openSlotRecipients(schedule: SessionView[], session: SessionView, now: Date): number[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/einspringen.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canJumpIn, jumpInOptions, openSlotRecipients } from "./einspringen";
import { assignment, makeSession } from "./test-fixtures";

const before = new Date("2026-11-03T08:00:00Z");

// 03.11: Platz 1 (starters 1–4, Ersatz 5) where 1 cancelled; Platz 2 (starters 11–14, Ersatz 15, Trainer 20).
// 10.11: Platz 1 with starters 6–9, Ersatz 10, Trainer 21 — makes 6–10 rotation players too (21 only ever coaches).
const platz1 = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
const platz2 = makeSession({
  id: 2,
  courtSlug: "frankenbach",
  hallName: "Tennishalle Frankenbach",
  starters: [assignment(11), assignment(12), assignment(13), assignment(14)],
  ersatz: assignment(15, "offen", "ersatz"),
  trainer: assignment(20, "offen", "trainer"),
});
const nextWeek = makeSession({
  id: 3,
  sessionDate: "2026-11-10",
  startsAt: new Date("2026-11-10T19:30:00Z"),
  endsAt: new Date("2026-11-10T21:00:00Z"),
  starters: [assignment(6), assignment(7), assignment(8), assignment(9)],
  ersatz: assignment(10, "offen", "ersatz"),
  trainer: assignment(21, "offen", "trainer"),
});
const schedule = [platz1, platz2, nextWeek];

test("a rotation player who is free that evening may jump in", () => {
  assert.equal(canJumpIn(schedule, platz1, 6, before), true);
});

test("the Ersatz in the other hall that evening may jump in", () => {
  assert.equal(canJumpIn(schedule, platz1, 15, before), true);
});

test("nobody already on this session may jump in, including its Ersatz", () => {
  for (const id of [1, 2, 5]) assert.equal(canJumpIn(schedule, platz1, id, before), false, `player ${id}`);
});

test("starters and the coach of the other hall that evening may not", () => {
  assert.equal(canJumpIn(schedule, platz1, 11, before), false);
  assert.equal(canJumpIn(schedule, platz1, 20, before), false);
});

test("players who are only ever coaches, or not on the rotation at all, may not", () => {
  assert.equal(canJumpIn(schedule, platz1, 21, before), false);
  assert.equal(canJumpIn(schedule, platz1, 99, before), false);
});

test("no open place, or the session is over: nobody may", () => {
  assert.equal(canJumpIn(schedule, platz2, 6, before), false);
  assert.equal(canJumpIn(schedule, platz1, 6, new Date("2026-11-03T21:00:00Z")), false);
  const filled = { ...platz1, einspringer: [assignment(7, "ja", "einspringer")] };
  assert.equal(canJumpIn([filled, platz2, nextWeek], filled, 6, before), false);
});

test("having jumped in elsewhere that evening blocks a second place", () => {
  const otherHallShort = {
    ...platz2,
    starters: [assignment(11, "nein"), assignment(12), assignment(13), assignment(14)],
  };
  const tookPlatz1 = { ...platz1, einspringer: [assignment(6, "ja", "einspringer")] };
  assert.equal(canJumpIn([tookPlatz1, otherHallShort, nextWeek], otherHallShort, 6, before), false);
});

test("jumpInOptions lists the sessions a player could take", () => {
  assert.deepEqual(jumpInOptions(schedule, 6, before).map((s) => s.id), [1]);
  assert.deepEqual(jumpInOptions(schedule, 11, before), []);
});

test("openSlotRecipients: every eligible rotation player, nobody else", () => {
  assert.deepEqual(
    openSlotRecipients(schedule, platz1, before).sort((a, b) => a - b),
    [6, 7, 8, 9, 10, 15],
  );
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL — cannot find module `./einspringen`.

- [ ] **Step 3: Implement**

Create `src/lib/einspringen.ts`:

```ts
import type { SessionView } from "@/lib/queries";
import { openSlots } from "@/lib/vacancy";

/** Playing (or coaching) at a session — an Ersatz only stands by, so that doesn't count. */
function playsAt(session: SessionView, playerId: number): boolean {
  return (
    session.starters.some((a) => a.playerId === playerId) ||
    session.trainer?.playerId === playerId ||
    session.einspringer.some((a) => a.playerId === playerId)
  );
}

function isOnSession(session: SessionView, playerId: number): boolean {
  return playsAt(session, playerId) || session.ersatz?.playerId === playerId;
}

/** Players on the training rotation: planned as starter or Ersatz somewhere this season (coaches don't count). */
function rotationPlayerIds(schedule: SessionView[]): Set<number> {
  const ids = new Set<number>();
  for (const s of schedule) {
    for (const a of s.starters) ids.add(a.playerId);
    if (s.ersatz) ids.add(s.ersatz.playerId);
  }
  return ids;
}

/**
 * Whether a player may take a free place at this session: it isn't over and has a place open, they're on the
 * rotation but not on this session, and they aren't already playing in the other hall that evening.
 */
export function canJumpIn(schedule: SessionView[], session: SessionView, playerId: number, now: Date): boolean {
  if (session.endsAt <= now || openSlots(session) === 0) return false;
  if (isOnSession(session, playerId)) return false;
  if (!rotationPlayerIds(schedule).has(playerId)) return false;
  return !schedule.some((s) => s.id !== session.id && s.sessionDate === session.sessionDate && playsAt(s, playerId));
}

/** Upcoming sessions this player could jump into right now. */
export function jumpInOptions(schedule: SessionView[], playerId: number, now: Date): SessionView[] {
  return schedule.filter((s) => canJumpIn(schedule, s, playerId, now));
}

/** Everyone who should get the "Platz frei" email for this session. */
export function openSlotRecipients(schedule: SessionView[], session: SessionView, now: Date): number[] {
  return [...rotationPlayerIds(schedule)].filter((id) => canJumpIn(schedule, session, id, now));
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/einspringen.ts src/lib/einspringen.test.ts
git commit -m "Decide who may jump into a session with an open place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Race-safe writes (`slots.ts`)

**Files:**
- Create: `src/lib/slots.ts`
- Create: `scripts/check-slots-sql.ts`

**Interfaces:**
- Produces: `claimSlot(sessionId: number, playerId: number, source: "web" | "email"): Promise<boolean>`; `retractCancellation(sessionId: number, playerId: number, source: "web" | "email"): Promise<boolean>`; `leaveSlot(sessionId: number, playerId: number): Promise<void>`.

- [ ] **Step 1: Implement**

Create `src/lib/slots.ts`:

```ts
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Namespace for pg_advisory_xact_lock(namespace, session_id), so these locks never collide with other advisory locks.
const SLOT_LOCK = 3011;

/** Same count as openSlots() in vacancy.ts, evaluated inside the locked transaction. */
function openSlotsSql(sessionId: number) {
  return sql`(
    (select count(*) from session_assignments a
       join rsvps r on r.session_id = a.session_id and r.player_id = a.player_id
      where a.session_id = ${sessionId} and a.role = 'starter' and r.status = 'nein')
    - (select count(*) from session_assignments where session_id = ${sessionId} and role = 'einspringer')
    - (select count(*) from session_assignments a
         join rsvps r on r.session_id = a.session_id and r.player_id = a.player_id
        where a.session_id = ${sessionId} and a.role = 'ersatz' and r.status = 'ja')
  )`;
}

function lockSession(sessionId: number) {
  return getDb().execute(sql`select pg_advisory_xact_lock(${SLOT_LOCK}, ${sessionId})`);
}

// Each function runs as one transaction (neon-http batch). The advisory lock makes two clicks on the same session
// run one after the other, and every statement after it sees what the earlier transaction committed.

/** Takes a free place for the player. False when no place was left (someone else was quicker). */
export async function claimSlot(sessionId: number, playerId: number, source: "web" | "email"): Promise<boolean> {
  const db = getDb();
  const [, inserted] = await db.batch([
    lockSession(sessionId),
    db.execute(sql`
      insert into session_assignments (session_id, player_id, role)
      select ${sessionId}, ${playerId}, 'einspringer'
      where ${openSlotsSql(sessionId)} > 0
      on conflict do nothing
      returning id`),
    db.execute(sql`
      insert into rsvps (session_id, player_id, status, source)
      select ${sessionId}, ${playerId}, 'ja', ${source}
      where exists (select 1 from session_assignments
                     where session_id = ${sessionId} and player_id = ${playerId} and role = 'einspringer')
      on conflict (session_id, player_id) do update set status = 'ja', responded_at = now(), source = excluded.source`),
  ]);
  return inserted.rows.length > 0;
}

/** A starter takes their cancellation back. False when their place has been taken in the meantime. */
export async function retractCancellation(
  sessionId: number,
  playerId: number,
  source: "web" | "email",
): Promise<boolean> {
  const db = getDb();
  const [, updated] = await db.batch([
    lockSession(sessionId),
    db.execute(sql`
      update rsvps set status = 'ja', responded_at = now(), source = ${source}
      where session_id = ${sessionId} and player_id = ${playerId} and status = 'nein'
        and ${openSlotsSql(sessionId)} > 0
      returning id`),
  ]);
  return updated.rows.length > 0;
}

/** Someone who jumped in can't come after all: the place is free again. */
export async function leaveSlot(sessionId: number, playerId: number): Promise<void> {
  const db = getDb();
  await db.batch([
    db.execute(sql`delete from rsvps where session_id = ${sessionId} and player_id = ${playerId}`),
    db.execute(sql`
      delete from session_assignments
      where session_id = ${sessionId} and player_id = ${playerId} and role = 'einspringer'`),
  ]);
}
```

- [ ] **Step 2: Write a rollback-only SQL check**

`DATABASE_URL` is production, so the check runs the real statements inside a transaction that ends with a deliberate error — Postgres rolls everything back. It proves the SQL parses and plans against the live schema without writing anything. Run it only after Task 8's migration if you want the `'einspringer'` insert itself exercised; before the migration it still checks the lock and the count query.

Create `scripts/check-slots-sql.ts`:

```ts
// Runs the slot SQL against the configured database inside a transaction that is forced to fail, so nothing is kept.
// Usage: node --env-file=<path to .env.local> --import tsx scripts/check-slots-sql.ts <sessionId>
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

async function main() {
  const sessionId = Number(process.argv[2]);
  if (!sessionId) throw new Error("Usage: check-slots-sql.ts <sessionId>");
  const db = getDb();
  try {
    await db.batch([
      db.execute(sql`select pg_advisory_xact_lock(3011, ${sessionId})`),
      db.execute(sql`select (
        (select count(*) from session_assignments a
           join rsvps r on r.session_id = a.session_id and r.player_id = a.player_id
          where a.session_id = ${sessionId} and a.role = 'starter' and r.status = 'nein')
        - (select count(*) from session_assignments where session_id = ${sessionId} and role = 'einspringer')
        - (select count(*) from session_assignments a
             join rsvps r on r.session_id = a.session_id and r.player_id = a.player_id
            where a.session_id = ${sessionId} and a.role = 'ersatz' and r.status = 'ja')
      ) as open`),
      db.execute(sql`select 1 / 0 as force_rollback`),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("division by zero")) {
      console.log("OK – statements ran and were rolled back.");
      return;
    }
    throw err;
  }
  throw new Error("Expected the forced rollback error.");
}

main();
```

- [ ] **Step 3: Run the check read-only**

Run: `node --env-file=../../../.env.local --import tsx scripts/check-slots-sql.ts 5`
Expected: `OK – statements ran and were rolled back.` (session 5 = 03.11 Platz 1).

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: no output. If tsc complains that `inserted.rows` doesn't exist on the batch tuple type, type the destructured results as `NeonHttpQueryResult<{ id: number }>` imported from `drizzle-orm/neon-http`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slots.ts scripts/check-slots-sql.ts
git commit -m "Claim and give back places under a per-session lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Server actions and the Ersatz all-clear

**Files:**
- Modify: `src/lib/email.ts` (ErsatzAlertInput + renderErsatzAlert)
- Modify: `src/lib/ersatz-alert.ts`
- Modify: `src/app/spieler/[token]/actions.ts`

**Interfaces:**
- Consumes: `claimSlot`, `retractCancellation`, `leaveSlot` (Task 4); `canJumpIn` (Task 3); `ersatzNoLongerNeeded` (Task 2).
- Produces: server actions `jumpIn(formData)` and `jumpInFromEmail(formData)` (form fields `token`, `sessionId`); `notifyErsatzTakenOver({ sessionId, einspringerId, baseUrl })`; `ErsatzAlertInput["kind"]` gains `"uebernommen"`. Redirect contract: success → `/spieler/<token>#termin-<id>`; `jumpIn` failure → `/spieler/<token>?vergeben=<id>#freie-plaetze`; `jumpInFromEmail` failure → `/spieler/<token>/antwort?termin=<id>&vergeben=1`.

- [ ] **Step 1: Add the `uebernommen` alert wording**

In `src/lib/email.ts`, change the `kind` field of `ErsatzAlertInput` to

```ts
  /**
   * "gebraucht": a starter just cancelled. "entwarnung": the cancellation was taken back.
   * "uebernommen": someone else jumped in and took the last free place. Both of the latter mean nobody is missing.
   */
  kind: "gebraucht" | "entwarnung" | "uebernommen";
```

and in `renderErsatzAlert` replace

```ts
  if (kind === "entwarnung") {
    const subject = `Entwarnung für ${shortDate} – du wirst doch nicht gebraucht`;
    const line = `${changedBy} kommt doch – am ${date} fehlt niemand mehr. Du musst nicht einspringen.`;
```

with

```ts
  if (kind === "entwarnung" || kind === "uebernommen") {
    const subject = `Entwarnung für ${shortDate} – du wirst doch nicht gebraucht`;
    const line =
      kind === "entwarnung"
        ? `${changedBy} kommt doch – am ${date} fehlt niemand mehr. Du musst nicht einspringen.`
        : `${changedBy} springt ein – am ${date} fehlt niemand mehr. Du musst nicht einspringen.`;
```

- [ ] **Step 2: Add `notifyErsatzTakenOver`**

Replace `src/lib/ersatz-alert.ts` from `/** Emails the session's Ersatz after a starter cancelled` to the end with:

```ts
async function emailErsatz(
  session: SessionView,
  kind: ErsatzAlertInput["kind"],
  changedBy: string,
  baseUrl: string,
): Promise<void> {
  const ersatz = await getPlayerById(session.ersatz!.playerId);
  if (!ersatz?.email) return;

  const from = process.env.MAIL_FROM;
  if (!from) {
    console.warn("MAIL_FROM ist nicht gesetzt – Ersatz-Benachrichtigung übersprungen.");
    return;
  }

  const result = await sendErsatzAlert(
    { to: ersatz.email, playerName: playerLabel(ersatz), session, token: ersatz.token, baseUrl, kind, changedBy },
    { from, replyTo: process.env.REPLY_TO },
  );
  if (result.error) console.error(`Ersatz-Benachrichtigung (${kind}) fehlgeschlagen:`, result.error);
}

/** Emails the session's Ersatz after a starter cancelled or took a cancellation back. Never throws. */
export async function notifyErsatz(opts: {
  sessionId: number;
  starterId: number;
  previous: Answer | null;
  status: Answer;
  baseUrl: string;
}): Promise<void> {
  try {
    const schedule = await getFullSchedule();
    const session = schedule.find((s) => s.id === opts.sessionId);
    if (!session) return;

    const kind = ersatzAlertKind(session, opts.previous, opts.status, new Date());
    if (!kind) return;

    const changedBy = session.starters.find((a) => a.playerId === opts.starterId)?.displayName ?? "Jemand";
    await emailErsatz(session, kind, changedBy, opts.baseUrl);
  } catch (err) {
    console.error("Ersatz-Benachrichtigung fehlgeschlagen:", err);
  }
}

/** Tells the Ersatz they're off the hook when someone else jumped into the last free place. Never throws. */
export async function notifyErsatzTakenOver(opts: {
  sessionId: number;
  einspringerId: number;
  baseUrl: string;
}): Promise<void> {
  try {
    const schedule = await getFullSchedule();
    const session = schedule.find((s) => s.id === opts.sessionId);
    if (!session || !ersatzNoLongerNeeded(session, new Date())) return;

    const changedBy = session.einspringer.find((a) => a.playerId === opts.einspringerId)?.displayName ?? "Jemand";
    await emailErsatz(session, "uebernommen", changedBy, opts.baseUrl);
  } catch (err) {
    console.error("Ersatz-Benachrichtigung fehlgeschlagen:", err);
  }
}
```

and change the imports at the top of the file to

```ts
import { getFullSchedule, getPlayerById, type SessionView } from "@/lib/queries";
import { sendErsatzAlert, type ErsatzAlertInput } from "@/lib/email";
import { playerLabel } from "@/lib/format";
import { ersatzNoLongerNeeded } from "@/lib/vacancy";
```

- [ ] **Step 3: Rewrite the actions**

Replace `src/app/spieler/[token]/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { players, sessionAssignments, rsvps } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { getFullSchedule, getPlayerByToken } from "@/lib/queries";
import { canJumpIn } from "@/lib/einspringen";
import { claimSlot, leaveSlot, retractCancellation } from "@/lib/slots";
import { notifyErsatz, notifyErsatzTakenOver } from "@/lib/ersatz-alert";

type Source = "web" | "email";

function revalidateSchedule() {
  revalidatePath("/");
  revalidatePath("/spieler/[token]", "page");
}

async function alertErsatzAfterStarterAnswer(
  sessionId: number,
  starterId: number,
  previous: "ja" | "nein" | null,
  status: "ja" | "nein",
) {
  const baseUrl = await getBaseUrl();
  // Sent after the response so a slow mail provider never delays saving the answer.
  after(() => notifyErsatz({ sessionId, starterId, previous, status, baseUrl }));
}

async function saveRsvp(formData: FormData, source: Source) {
  const token = String(formData.get("token") ?? "");
  const sessionId = Number(formData.get("sessionId"));
  const status = String(formData.get("status") ?? "");

  if (!token || !sessionId || (status !== "ja" && status !== "nein")) {
    throw new Error("Ungültige Anfrage.");
  }

  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.token, token)).limit(1);
  if (!player) {
    throw new Error("Ungültiger Link.");
  }

  const [assignment] = await db
    .select()
    .from(sessionAssignments)
    .where(and(eq(sessionAssignments.sessionId, sessionId), eq(sessionAssignments.playerId, player.id)))
    .limit(1);
  if (!assignment) {
    throw new Error("Du bist für diesen Termin nicht eingeteilt.");
  }
  const result = { token, sessionId, role: assignment.role };

  if (assignment.role === "einspringer") {
    // Jumping in already was the "ja"; "nein" hands the place back to whoever comes next.
    if (status === "nein") await leaveSlot(sessionId, player.id);
    revalidateSchedule();
    return result;
  }

  const [previousRow] = await db
    .select({ status: rsvps.status })
    .from(rsvps)
    .where(and(eq(rsvps.sessionId, sessionId), eq(rsvps.playerId, player.id)))
    .limit(1);
  const previous = (previousRow?.status as "ja" | "nein" | undefined) ?? null;

  if (assignment.role === "starter" && previous === "nein" && status === "ja") {
    // Someone may have jumped in meanwhile — then the place is theirs and the cancellation stays.
    const retracted = await retractCancellation(sessionId, player.id, source);
    revalidateSchedule();
    if (retracted) await alertErsatzAfterStarterAnswer(sessionId, player.id, previous, status);
    return result;
  }

  await db
    .insert(rsvps)
    .values({ sessionId, playerId: player.id, status, source })
    .onConflictDoUpdate({
      target: [rsvps.sessionId, rsvps.playerId],
      set: { status, respondedAt: new Date(), source },
    });

  revalidateSchedule();

  if (assignment.role === "starter") {
    await alertErsatzAfterStarterAnswer(sessionId, player.id, previous, status);
  }

  return result;
}

export async function setRsvp(formData: FormData) {
  await saveRsvp(formData, "web");
}

/** Submitted from the confirmation page the reminder email links to; lands the player on the updated card. */
export async function confirmRsvpFromEmail(formData: FormData) {
  const { token, sessionId, role } = await saveRsvp(formData, "email");
  const playerPage = `/spieler/${encodeURIComponent(token)}`;
  // Ersatz sessions aren't listed on the player page, so confirm on the answer page instead.
  redirect(
    role === "ersatz"
      ? `${playerPage}/antwort?termin=${sessionId}&gespeichert=1`
      : `${playerPage}#termin-${sessionId}`,
  );
}

/** Takes a free place for a player who isn't on the session. False when it's gone or they may not take it. */
async function tryJumpIn(formData: FormData, source: Source) {
  const token = String(formData.get("token") ?? "");
  const sessionId = Number(formData.get("sessionId"));
  if (!token || !sessionId) throw new Error("Ungültige Anfrage.");

  const player = await getPlayerByToken(token);
  if (!player) throw new Error("Ungültiger Link.");

  const schedule = await getFullSchedule();
  const session = schedule.find((s) => s.id === sessionId);
  const ok =
    !!session && canJumpIn(schedule, session, player.id, new Date()) && (await claimSlot(sessionId, player.id, source));

  if (ok) {
    revalidateSchedule();
    const baseUrl = await getBaseUrl();
    after(() => notifyErsatzTakenOver({ sessionId, einspringerId: player.id, baseUrl }));
  }
  return { playerPage: `/spieler/${encodeURIComponent(token)}`, sessionId, ok };
}

export async function jumpIn(formData: FormData) {
  const { playerPage, sessionId, ok } = await tryJumpIn(formData, "web");
  redirect(ok ? `${playerPage}#termin-${sessionId}` : `${playerPage}?vergeben=${sessionId}#freie-plaetze`);
}

/** The "Ich springe ein" button on the answer page the "Platz frei" email links to. */
export async function jumpInFromEmail(formData: FormData) {
  const { playerPage, sessionId, ok } = await tryJumpIn(formData, "email");
  redirect(ok ? `${playerPage}#termin-${sessionId}` : `${playerPage}/antwort?termin=${sessionId}&vergeben=1`);
}
```

- [ ] **Step 4: Type check, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type or lint errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/ersatz-alert.ts "src/app/spieler/[token]/actions.ts"
git commit -m "Let rotation players jump in and give the place back, and tell the Ersatz

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: UI — personal page, answer page, public card

**Files:**
- Create: `src/components/JumpInForm.tsx`
- Create: `src/components/FreeSlotCard.tsx`
- Modify: `src/app/spieler/[token]/page.tsx`
- Modify: `src/app/spieler/[token]/antwort/page.tsx`
- Modify: `src/components/SessionCard.tsx`

**Interfaces:**
- Consumes: `jumpIn`, `jumpInFromEmail` (Task 5); `jumpInOptions`, `canJumpIn` (Task 3); `openSlots`, `vacancyStatus` (Task 2).
- Produces: `<JumpInForm token sessionId action />`, `<FreeSlotCard token session />`; DOM anchor `#freie-plaetze`.

- [ ] **Step 1: The button form**

Create `src/components/JumpInForm.tsx`:

```tsx
import { SubmitButton } from "@/components/SubmitButton";
import { CheckIcon } from "@/components/icons";

export function JumpInForm({
  token,
  sessionId,
  action,
}: {
  token: string;
  sessionId: number;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton className="flex w-full items-center justify-center gap-1.5 rounded-[14px] bg-[var(--color-ja)] px-4 py-3 text-sm font-semibold text-white">
        <CheckIcon className="h-3.5 w-3.5" />
        Ich springe ein
      </SubmitButton>
    </form>
  );
}
```

- [ ] **Step 2: The free-slot card**

Create `src/components/FreeSlotCard.tsx`:

```tsx
import type { SessionView } from "@/lib/queries";
import { formatDate, formatTimeRange } from "@/lib/format";
import { openSlots } from "@/lib/vacancy";
import { jumpIn } from "@/app/spieler/[token]/actions";
import { JumpInForm } from "@/components/JumpInForm";
import { PinIcon } from "@/components/icons";

export function FreeSlotCard({ token, session }: { token: string; session: SessionView }) {
  const open = openSlots(session);
  const playing = [...session.starters.filter((a) => a.rsvpStatus !== "nein"), ...session.einspringer].map(
    (a) => a.displayName,
  );
  const isPlatz1 = session.courtSlug === "happy-match";
  const chipColorClasses = isPlatz1
    ? "text-[var(--color-platz1)] bg-[var(--color-platz1-bg)]"
    : "text-[var(--color-platz2)] bg-[var(--color-platz2-bg)]";

  return (
    <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-[18px]">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-bold whitespace-nowrap">{formatDate(session.startsAt)}</p>
          <p className="text-sm text-[var(--color-ink-muted)]">{formatTimeRange(session.startsAt, session.endsAt)}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-semibold ${chipColorClasses}`}
        >
          <PinIcon />
          {session.hallName}
          {session.withCoach ? " · mit Trainer" : ""}
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--color-nein)]">
        {open === 1 ? "1 Platz frei" : `${open} Plätze frei`}
      </p>
      <p className="text-sm">Mit dabei: {playing.join(", ")}</p>
      <JumpInForm token={token} sessionId={session.id} action={jumpIn} />
    </div>
  );
}
```

- [ ] **Step 3: Personal page**

In `src/app/spieler/[token]/page.tsx`:

(a) Imports — add

```ts
import { FreeSlotCard } from "@/components/FreeSlotCard";
import { jumpInOptions } from "@/lib/einspringen";
import { openSlots } from "@/lib/vacancy";
```

(b) Signature and search params — change the first lines of the component to

```ts
export default async function PlayerPage({ params, searchParams }: PageProps<"/spieler/[token]">) {
  const { token } = await params;
  const { vergeben } = await searchParams;
```

(c) After `const trains = mySessions.length > 0;` add

```ts
  const freeSlots = jumpInOptions(schedule, player.id, new Date());
  // Set when "Ich springe ein" lost the race; the place went to someone quicker.
  const missedSlot = vergeben ? schedule.find((s) => s.id === Number(vergeben)) : undefined;
```

(d) Directly after `{calendarSection}` inside the `trains ?` branch, add

```tsx
          {(freeSlots.length > 0 || missedSlot) && (
            <section id="freie-plaetze" className="mb-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Freie Plätze
              </h2>
              {missedSlot && (
                <p
                  role="status"
                  className="mb-3 rounded-2xl bg-[var(--color-offen-bg)] px-4 py-3 text-sm text-[var(--color-offen)]"
                >
                  Der Platz am {formatDate(missedSlot.startsAt)} ist schon vergeben. Danke trotzdem!
                </p>
              )}
              <div className="space-y-3">
                {freeSlots.map((s) => (
                  <FreeSlotCard key={s.id} token={token} session={s} />
                ))}
              </div>
            </section>
          )}
```

(e) In the `upcoming.map` callback, replace

```ts
              const myAssignment = [s.trainer, ...s.starters].find((a) => a?.playerId === player.id)!;
              const myStatus = myAssignment.rsvpStatus;
              const others = s.starters.filter((a) => a.playerId !== player.id).map((a) => a.displayName);
```

with

```ts
              const myAssignment = [s.trainer, ...s.starters, ...s.einspringer].find(
                (a) => a?.playerId === player.id,
              )!;
              const myStatus = myAssignment.rsvpStatus;
              const others = [...s.starters, ...s.einspringer]
                .filter((a) => a.playerId !== player.id)
                .map((a) => a.displayName);
              // A starter who cancelled can't take it back once someone else has their place.
              const placeTaken = role === "starter" && myStatus === "nein" && openSlots(s) === 0;
```

(f) Replace the `role === "trainer" ? ... : ...` block and the `<RsvpForm ... />` line with

```tsx
                  {role === "trainer" ? (
                    <p className="mb-1 text-sm font-medium">Du bist als Trainer eingeteilt.</p>
                  ) : (
                    <>
                      {role === "einspringer" && <p className="mb-1 text-sm font-medium">Du bist eingesprungen.</p>}
                      <p className="text-sm">
                        Mit dabei: {others.join(", ")}
                        {s.trainer && ` · Trainer: ${s.trainer.displayName}`}
                      </p>
                    </>
                  )}

                  {placeTaken ? (
                    <p className="mt-3 rounded-[14px] bg-[var(--color-offen-bg)] px-4 py-3 text-sm text-[var(--color-offen)]">
                      Du hast abgesagt, dein Platz wurde übernommen.
                    </p>
                  ) : (
                    <RsvpForm token={token} sessionId={s.id} current={myStatus} />
                  )}
```

- [ ] **Step 4: Answer page**

In `src/app/spieler/[token]/antwort/page.tsx`:

(a) Imports — replace the `vacancy` and `actions` imports with

```ts
import { cancelledStarters, ersatzNeeded, openSlots, vacancyStatus } from "@/lib/vacancy";
import { canJumpIn } from "@/lib/einspringen";
import { confirmRsvpFromEmail, jumpInFromEmail } from "@/app/spieler/[token]/actions";
import { JumpInForm } from "@/components/JumpInForm";
```

(b) Change `const { termin, antwort, gespeichert } = await searchParams;` to `const { termin, antwort, gespeichert, vergeben } = await searchParams;`.

(c) Directly before `if (!session || !role) {` add

```tsx
  const sessionHeader = session && (
    <>
      <p className="font-display text-lg font-bold">{formatDate(session.startsAt)}</p>
      <p className="text-sm text-[var(--color-ink-muted)]">{formatTimeRange(session.startsAt, session.endsAt)}</p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
        <PinIcon />
        {session.hallName}
        {session.withCoach ? " · mit Trainer" : ""}
      </p>
    </>
  );
  const cardClasses =
    "rounded-[20px] border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[0_10px_24px_-16px_rgba(21,32,28,0.28)]";

  // Landing from the "Platz frei" email: not on this session, but may take the free place.
  if (session && !role && !vergeben && canJumpIn(schedule, session, player.id, new Date())) {
    return (
      <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
        {backLink}
        <header className="my-4">
          <h1 className="font-display text-2xl font-bold">Hallo {playerLabel(player)}!</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">Springst du ein?</p>
        </header>
        <div className={cardClasses}>
          {sessionHeader}
          <p className="mt-2 text-sm">
            {cancelledStarters(session)} abgesagt. Wer zuerst zusagt, spielt – mit „Ich springe ein“ ist der Platz
            deiner.
          </p>
          <JumpInForm token={token} sessionId={session.id} action={jumpInFromEmail} />
        </div>
      </main>
    );
  }

  // Someone was quicker (or the email was opened after the place was filled).
  if (session && !role && (vergeben || vacancyStatus(session))) {
    return (
      <main className="max-w-md mx-auto w-full px-4 py-6 flex-1">
        {backLink}
        <h1 className="font-display my-4 text-2xl font-bold">Schon vergeben, danke!</h1>
        <div className={cardClasses}>
          {sessionHeader}
          <p className="mt-2 text-sm">Der Platz ist inzwischen besetzt. Danke, dass du einspringen wolltest!</p>
        </div>
      </main>
    );
  }
```

(d) Replace

```ts
  const myAssignment = [session.trainer, session.ersatz, ...session.starters].find(
    (a) => a?.playerId === player.id,
  )!;
```

with

```ts
  const myAssignment = [session.trainer, session.ersatz, ...session.starters, ...session.einspringer].find(
    (a) => a?.playerId === player.id,
  )!;
  const placeTaken = role === "starter" && myAssignment.rsvpStatus === "nein" && openSlots(session) === 0;
```

(e) Replace the date/time/hall block inside the card (the three `<p>` elements from `formatDate(session.startsAt)` through the hall `<p>`) with `{sessionHeader}`, and change the card's `className` to `{cardClasses}`.

(f) In the role text chain, replace

```tsx
        ) : role === "trainer" ? (
          <p className="mt-2 text-sm">Du bist als Trainer eingeteilt.</p>
        ) : (
```

with

```tsx
        ) : role === "trainer" ? (
          <p className="mt-2 text-sm">Du bist als Trainer eingeteilt.</p>
        ) : role === "einspringer" ? (
          <p className="mt-2 text-sm">
            Du bist an diesem Termin <span className="font-semibold">eingesprungen</span>. Mit „Nein“ gibst du den
            Platz wieder frei.
          </p>
        ) : (
```

and in the final starter branch change `session.starters` to `[...session.starters, ...session.einspringer]`.

(g) Wrap the answer buttons: replace `<div className="mt-4 flex flex-col gap-2">` … its closing `</div>` with

```tsx
        {placeTaken ? (
          <p className="mt-4 rounded-2xl bg-[var(--color-offen-bg)] px-4 py-3 text-sm text-[var(--color-offen)]">
            Du hast abgesagt, dein Platz wurde übernommen.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {/* existing options.map(...) unchanged */}
          </div>
        )}
```

keeping the existing `options.map(...)` body exactly as it is inside the new `<div>`.

- [ ] **Step 5: Public session card**

In `src/components/SessionCard.tsx`:

(a) Replace the `goingCount` line with

```ts
  const goingCount = [...session.starters, ...session.einspringer].filter((a) => a.rsvpStatus === "ja").length;
  const canStillJumpIn = !!vacancy && vacancy.open > 0 && session.endsAt > new Date();
```

and move `const vacancy = vacancyStatus(session);` above it.

(b) Inside the full-variant `<ul>`, after the `session.starters.map(...)`, add

```tsx
        {session.einspringer.map((a) => (
          <li key={a.playerId} className={`flex items-center justify-between text-sm ${a.playerId === highlightPlayerId ? "font-semibold" : ""}`}>
            <span>
              {a.displayName} <span className="text-xs text-[var(--color-ink-muted)]">· eingesprungen</span>
            </span>
            <RsvpBadge status={a.rsvpStatus} />
          </li>
        ))}
```

(c) After the closing `)}` of the full-variant `{vacancy && (...)}` banner, add

```tsx
      {canStillJumpIn && (
        <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">Einspringen kannst du über deine persönliche Seite.</p>
      )}
```

- [ ] **Step 6: Type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Look at it in the browser (read-only)**

Start the dev server with the preview tool (`preview_start` name `dev`; it needs `.env.local` — copy `../../../.env.local` into the worktree first and never commit it). Then, without clicking any answer or jump-in button:
- `/` — 03.11 Platz 1 card shows "Ersatz gesucht" and the hint "Einspringen kannst du über deine persönliche Seite."
- A rotation player's page who is free on 03.11 (get a token with `npm run tokens:list`, e.g. a Platz-2 player from another week who isn't playing 03.11) — a "Freie Plätze" section lists 03.11 with "1 Platz frei" and "Ich springe ein".
- Martin's page — 03.11 card still shows the RSVP buttons (place not taken).
- `/spieler/<free player token>/antwort?termin=5&antwort=ja` — the jump-in view.
- Check both light and dark mode at mobile width (375px).

- [ ] **Step 8: Commit**

```bash
git add src/components/JumpInForm.tsx src/components/FreeSlotCard.tsx "src/app/spieler/[token]/page.tsx" "src/app/spieler/[token]/antwort/page.tsx" src/components/SessionCard.tsx
git commit -m "Show free places with an Ich-springe-ein button and who jumped in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Emails and calendar — "Platz frei" on match day, einspringer everywhere

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/reminders.ts`
- Modify: `src/lib/ics.ts`
- Modify: `src/app/api/ics/[token]/rotationsplan.ics/route.ts`

**Interfaces:**
- Consumes: `openSlotRecipients` (Task 3), `openSlots` (Task 2).
- Produces: `OpenSlotEmailInput` type; `sendReminderBatch` accepts `(ReminderEmailInput | OpenSlotEmailInput)[]`; `renderOpenSlot` exported for tests.

- [ ] **Step 1: Write the failing email test**

Create `src/lib/open-slot-email.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOpenSlot } from "./email";
import { assignment, makeSession } from "./test-fixtures";

test("the Platz-frei email names who cancelled and links straight to the jump-in page", () => {
  const session = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const { subject, html, text } = renderOpenSlot({
    kind: "platz-frei",
    to: "p6@example.com",
    playerName: "P6",
    session,
    token: "tok6",
    baseUrl: "https://example.com",
  });
  assert.match(subject, /1 Platz frei – springst du ein\?$/);
  assert.match(text, /P1 hat abgesagt/);
  assert.match(text, /https:\/\/example\.com\/spieler\/tok6\/antwort\?termin=1&antwort=ja/);
  assert.match(html, /Ja, ich springe ein/);
  assert.doesNotMatch(html, /antwort=nein/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL — `renderOpenSlot` is not exported.

- [ ] **Step 3: Single-button shell and the new email**

In `src/lib/email.ts`:

(a) Import `openSlots` next to the existing vacancy import:

```ts
import { cancelledStarters, ersatzNeeded, openSlots } from "@/lib/vacancy";
```

(b) Change `type Buttons` to

```ts
/** A "nein" button is optional: the Platz-frei email only offers to jump in. */
type Buttons = { yesUrl: string; ja: string; noUrl?: string; nein?: string };
```

(c) In `renderShell`, replace the `const buttonRow = buttons ? \`...\` : "";` expression with

```ts
  const yesButton = (b: Buttons) =>
    `<a href="${b.yesUrl}" style="display:block;text-align:center;background:#0e3b2e;color:#fff;text-decoration:none;padding:13px 0;border-radius:6px;font-weight:600;font-size:14px;">${b.ja}</a>`;
  const buttonRow = !buttons
    ? ""
    : buttons.noUrl && buttons.nein
      ? `
      <table role="presentation" width="100%" style="margin-bottom:20px;">
        <tr>
          <td style="padding-right:6px;width:50%;">
            ${yesButton(buttons)}
          </td>
          <td style="padding-left:6px;width:50%;">
            <a href="${buttons.noUrl}" style="display:block;text-align:center;background:#ffffff;color:#b42318;border:1.5px solid #b42318;text-decoration:none;padding:11.5px 0;border-radius:6px;font-weight:600;font-size:14px;">${buttons.nein}</a>
          </td>
        </tr>
      </table>`
      : `
      <div style="margin-bottom:20px;">${yesButton(buttons)}</div>`;
```

(d) In `answerButtons`, the return type stays `Buttons` (it still sets all four fields). In `renderReminder` and `renderErsatzAlert`, the plain-text lines use `buttons.nein` / `buttons.noUrl`; they are always set there, so no change is needed beyond what tsc demands (if tsc flags them as possibly undefined, change `answerButtons`' return type to `Required<Buttons>`).

(e) In `renderReminder`, include players who jumped in: replace `const others = session.starters.map((a) => a.displayName).join(", ");` with

```ts
  const lineup = [...session.starters, ...session.einspringer];
  const others = lineup.map((a) => a.displayName).join(", ");
```

and in `cardBody` change `${session.starters` to `${lineup`.

(f) After `sendErsatzAlert`, add

```ts
export type OpenSlotEmailInput = {
  kind: "platz-frei";
  to: string;
  playerName: string;
  session: SessionView;
  token: string;
  baseUrl: string;
};

/** Match-day email to every rotation player who is free: a starter cancelled and the place is still open. */
export function renderOpenSlot(input: OpenSlotEmailInput): { subject: string; html: string; text: string } {
  const { playerName, session, token, baseUrl } = input;
  const open = openSlots(session);
  const places = open === 1 ? "1 Platz frei" : `${open} Plätze frei`;
  const subject = `Heute ${formatTimeRangeStart(session)} ${session.hallName}: ${places} – springst du ein?`;
  const line = `${cancelledStarters(session)} abgesagt – heute Abend ist ${open === 1 ? "ein Platz" : `${open} Plätze`} frei. Wer zuerst zusagt, spielt.`;
  const yesUrl = `${baseUrl}/spieler/${token}/antwort?termin=${session.id}&antwort=ja`;
  const html = renderShell({
    preheader: line,
    playerName,
    intro: "Für heute Abend wird noch jemand gesucht.",
    session,
    cardBody: strongLine(line),
    buttons: { yesUrl, ja: "Ja, ich springe ein" },
    note: "Du bekommst diese Mail, weil du im Rotationsplan stehst und heute Abend frei bist. Ist der Platz schon vergeben, siehst du das nach dem Klick.",
    token,
    baseUrl,
  });
  const text = [
    `Hallo ${playerName},`,
    ``,
    line,
    `${formatDate(session.startsAt)} · ${formatTimeRange(session.startsAt, session.endsAt)}`,
    `Halle: ${session.hallName}`,
    ``,
    `Ja, ich springe ein: ${yesUrl}`,
    ``,
    `Ganzer Plan: ${baseUrl}/`,
    `Dein persönlicher Link: ${baseUrl}/spieler/${token}`,
  ].join("\n");
  return { subject, html, text };
}
```

(g) Change `sendReminderBatch`'s parameter and render call:

```ts
export async function sendReminderBatch(
  inputs: (ReminderEmailInput | OpenSlotEmailInput)[],
  opts: { from: string; replyTo?: string },
): Promise<SendResult[]> {
  const resend = getResend();
  const messages = inputs.map((input) => {
    const { subject, html, text } = "kind" in input ? renderOpenSlot(input) : renderReminder(input);
```

(the rest of the function is unchanged).

- [ ] **Step 4: Run the email test**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Send the Platz-frei mails from the reminder run**

In `src/lib/reminders.ts`:

(a) Imports:

```ts
import { sendReminderBatch, type OpenSlotEmailInput, type ReminderEmailInput } from "@/lib/email";
import { openSlotRecipients } from "@/lib/einspringen";
import { openSlots } from "@/lib/vacancy";
```

(b) Change `const toSend: { input: ReminderEmailInput; sessionId: number; playerId: number }[] = [];` to

```ts
  const toSend: { input: ReminderEmailInput | OpenSlotEmailInput; sessionId: number; playerId: number }[] = [];
```

(c) Replace the whole `for (const session of todaysSessions) { ... }` loop with

```ts
  // One email per session and player: reminders for everyone on the session, then — while a cancelled place is
  // still free — a "Platz frei" email to every rotation player who is free tonight. reminder_log covers both.
  const queue = (
    sessionId: number,
    playerId: number,
    makeInput: (player: typeof allPlayers[number]) => ReminderEmailInput | OpenSlotEmailInput,
    label: string,
  ) => {
    const key = `${sessionId}:${playerId}`;
    if (alreadySent.has(key)) {
      skippedAlreadySent++;
      return;
    }
    const player = playerById.get(playerId);
    if (!player?.email) {
      skippedNoEmail++;
      return;
    }
    if (opts.dryRun) {
      dryRunList.push({ to: player.email, subject: `(${label}) ${todaysSessions.find((s) => s.id === sessionId)!.hallName} ${today}` });
    } else {
      toSend.push({ input: makeInput(player), sessionId, playerId });
    }
  };

  const now = new Date();
  for (const session of todaysSessions) {
    const recipients = [
      ...session.starters.map((a) => ({ playerId: a.playerId, role: "starter" as const })),
      ...session.einspringer.map((a) => ({ playerId: a.playerId, role: "starter" as const })),
      ...(session.ersatz ? [{ playerId: session.ersatz.playerId, role: "ersatz" as const }] : []),
      ...(session.trainer ? [{ playerId: session.trainer.playerId, role: "trainer" as const }] : []),
    ];
    for (const r of recipients) {
      queue(
        session.id,
        r.playerId,
        (player) => ({
          to: player.email!,
          playerName: playerLabel(player),
          role: r.role,
          session,
          token: player.token,
          baseUrl: opts.baseUrl,
        }),
        r.role,
      );
    }

    if (openSlots(session) === 0) continue;
    for (const playerId of openSlotRecipients(schedule, session, now)) {
      queue(
        session.id,
        playerId,
        (player) => ({
          kind: "platz-frei",
          to: player.email!,
          playerName: playerLabel(player),
          session,
          token: player.token,
          baseUrl: opts.baseUrl,
        }),
        "platz-frei",
      );
    }
  }
```

- [ ] **Step 6: Calendar**

In `src/lib/ics.ts`, `sessionToIcsEvent`: change the "Mit dabei" line to

```ts
    `Mit dabei: ${[...session.starters, ...session.einspringer].map((a) => a.displayName).join(", ")}`,
```

and the `mySelf` array to

```ts
  const mySelf = [
    ...session.starters,
    ...session.einspringer,
    ...(session.ersatz ? [session.ersatz] : []),
    ...(session.trainer ? [session.trainer] : []),
  ].find((a) => a.playerId === player.id);
```

In `src/app/api/ics/[token]/rotationsplan.ics/route.ts` change the filter to

```ts
  // Only real commitments (playing, coaching or jumped in), not standby (Ersatz) sessions.
  const mine = sessionsForPlayer(schedule, player.id).filter((s) => {
    const role = myRoleInSession(s, player.id);
    return role === "starter" || role === "trainer" || role === "einspringer";
  });
```

- [ ] **Step 7: Type check, lint, test, dry-run the cron**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean, all pass.

With the dev server running, dry-run the cron (reads only, sends nothing): `curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/erinnerungen?dryRun=1"` with `CRON_SECRET` from `.env.local`.
Expected: JSON with `sessions: 0` today (27.09 has no session) — confirms the route still runs. The recipient logic itself is covered by the `openSlotRecipients` tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/email.ts src/lib/open-slot-email.test.ts src/lib/reminders.ts src/lib/ics.ts "src/app/api/ics/[token]/rotationsplan.ics/route.ts"
git commit -m "Email free rotation players on match day when a place is still open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Production schema change and final verification

**Files:** none (database + checks)

- [ ] **Step 1: Ask Pablo** in chat to confirm running the constraint change against the production database (it only widens the allowed roles; existing rows are untouched).

- [ ] **Step 2: Apply the ALTER** (after the yes)

```bash
node --env-file=../../../.env.local -e '
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
(async () => {
  await sql.transaction([
    sql`ALTER TABLE session_assignments DROP CONSTRAINT session_assignments_role_check`,
    sql`ALTER TABLE session_assignments ADD CONSTRAINT session_assignments_role_check CHECK (role in ('starter', 'ersatz', 'trainer', 'einspringer'))`,
  ]);
  console.log("done");
})();'
```

Expected: `done`.

- [ ] **Step 3: Re-run the rollback check** (Task 4, Step 3). Expected: `OK – statements ran and were rolled back.`

- [ ] **Step 4: Full checks**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Hand over**

Push the branch, open a PR, and tell Pablo production needs `vercel --prod` to go live (prod only updates on manual deploy).
