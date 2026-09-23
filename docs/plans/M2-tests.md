# M2-B — Unit tests for domain logic

Executor: `quick-executor` (haiku). Exactly 2 new files. No source edits — if a test fails because source looks wrong, do NOT change source; report failing case + actual vs expected as open question.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Read first: `docs/ARCHITECTURE.md` §Transition rules, §Ordering, §Dates, §KPIs; then `shared/types/domain.ts`, `shared/utils/*.ts`.
Imports: relative (`../../shared/utils/kpi`), `import { describe, it, expect } from 'vitest'`.
Fixed clock: `const NOW = new Date(2026, 8, 23, 12, 0, 0)` (local time, Wed 23 Sep 2026). Build all dates relative to NOW with a helper `daysAgo(n) => new Date(NOW.getTime() - n * 86_400_000).toISOString()`.
Task factory helper in each file: `makeTask(overrides: Partial<Task>): Task` with defaults (id `crypto.randomUUID()`, title 't', description null, projectId null, state 'backlog', position 1000, deadline null, createdAt/updatedAt/stateChangedAt `daysAgo(1)`, completedAt null, tagIds []).

## File 1: `tests/unit/domain.test.ts`

transitionPatch:
1. same state → `null`.
2. backlog → in_progress → state set, stateChangedAt = NOW iso, completedAt stays null.
3. review → done → completedAt = NOW iso.
4. done (completedAt set) → todo → completedAt null.
5. done → done → null (completedAt untouched).

positionBetween / positionAtIndex:
6. (null, null) → 1000.
7. (null, 500) → -500.
8. (2000, null) → 3000.
9. (1000, 2000) → 1500.
10. positionAtIndex([1000,2000,3000], 0) → 0; index 1 → 1500; index 3 → 4000; ([] , 0) → 1000.

dates:
11. localDateIso(NOW) → '2026-09-23'.
12. daysBetween(daysAgo(3), NOW) → 3 (toBeCloseTo).
13. isOverdue: deadline '2026-09-22' state todo → true; '2026-09-23' → false (due today not overdue); '2026-09-22' state done → false; deadline null → false.

## File 2: `tests/unit/kpi.test.ts`

Fixture: projects P1 (`blue`, name 'Alpha'), P2 (`green`, name 'Beta'), P3 (`red`, name 'Empty', no tasks). Tasks:
- a: P1, backlog
- b: P1, todo, deadline '2026-09-01' (overdue)
- c: P1, in_progress, stateChangedAt daysAgo(4)
- d: P2, review, stateChangedAt daysAgo(2)
- e: P2, done, createdAt daysAgo(10), completedAt daysAgo(2)
- f: P1, done, createdAt daysAgo(6), completedAt daysAgo(1)
- g: null project, done, createdAt daysAgo(70), completedAt daysAgo(40), deadline '2026-01-01' (done → not overdue)
- h: null project, todo

Cases (`computeKpis(tasks, projects, NOW)` unless noted):
1. counts.byState = { backlog 1, todo 2, in_progress 1, review 1, done 3 }; open 3, wip 2, done 3, total 8.
2. overdue = 1.
3. cycleTime: sample 3; durations 8, 5, 30 → avgDays 14.3, medianDays 8.
4. throughput.weekly length 8, last bucket weekStart '2026-09-21', last bucket count 2 (e: Mon 21 Sep 12:00, f: Tue 22 Sep 12:00); sum of all weekly counts = 2 (g is ~40 days ago, outside 8 weeks? → 40 days < 56 days so INSIDE → sum = 3). Assert sum = 3 and the bucket containing g (weekStart '2026-08-10') has count 1.
5. last30Days = 2; thisMonth = 2.
6. aging.wipAvgDays = 3 (c 4d, d 2d); aging.oldest[0].taskId = the oldest non-done by stateChangedAt (c: 4 days vs defaults 1 day); length ≤ 5; no done tasks in list.
7. projects rows: Alpha total 4, Beta total 2, 'No project' (projectId null, color null) total 2, Empty total 0 → order Alpha, Beta, No project, Empty (total desc, then name asc: 'Beta' < 'No project').
8. scoped `{ projectId: P1.id }` → total 4, done 1, overdue 1, projects `[]`, scope.projectId = P1.id.
9. scoped `{ projectId: 'none' }` → total 2 (g, h), done 1.
10. empty task list → cycleTime avg/median null, sample 0, wipAvgDays null, all counts 0, weekly 8 buckets all 0.
11. `{ weeks: 4 }` → weekly length 4.

Case 4 note: verify weekStart values with the source's week logic (local Monday). If an assertion is wrong because the plan's arithmetic is wrong (not the source), report it as open question with actual value — don't silently change expected values.

## Verify

Run `npx vitest run` in root (Bash allowed for this task). Report pass/fail per file; for failures include test name + expected vs received.
