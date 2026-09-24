# Scout — Architecture

Local-first personal Kanban with proof-of-work KPIs. Single screen. Owner: lead architect (Opus). Subagents implement against this doc; deviations need architect approval.

## Stack (pinned decisions)

| Concern | Choice | Why |
|---|---|---|
| Framework | Nuxt 4.5 (Vue 3.5, `<script setup lang="ts">`) | user expertise, Nitro server routes |
| UI | shadcn-vue 2.x (reka-ui base, style `reka-nova`, lucide icons) | copy-in components, a11y via reka |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`, CSS-variable tokens | shadcn-vue 2 targets v4 |
| State | Pinia (`@pinia/nuxt`), setup-store style | |
| DnD | `vue-draggable-plus` (SortableJS) | maintained, Vue 3 native |
| ORM | Drizzle ORM 0.45 + drizzle-kit, `postgres` (postgres-js) driver | stable, pure TS, SQL-close |
| Validation | `zod` + h3 `readValidatedBody` / `getValidatedQuery` | |
| DB | PostgreSQL 17 in Docker, host port **5433** (5432 taken by other project) | |
| Tests | Vitest 5, node env, pure logic in `shared/` | |
| Package manager | npm | |
| Fonts | `@fontsource-variable/geist` (bundled) — NO Google Fonts (offline requirement) | |

iCloud: `node_modules`, `.nuxt`, `.output` carry xattr `com.apple.fileprovider.ignore#P=1` so they don't sync. Never delete + recreate these dirs without re-applying the xattr.

## Directory layout

```
app/
  app.vue                      <NuxtPage />
  pages/index.vue              the single screen
  assets/css/tailwind.css      tokens (shadcn vars + --swatch-* colors)
  components/ui/**             shadcn-vue generated — do not hand-edit except theming
  components/board/*.vue       KanbanBoard, BoardColumn, TaskCard, QuickAddTask
  components/task/*.vue        TaskDialog, ProjectPicker, TagPicker, DeadlinePicker, SizePicker, TaskLinks, TaskTime
  components/kpi/*.vue         KpiPanel, KpiStat, KpiStateBar, ThroughputBars
  components/common/*.vue      ColorBadge, ColorPicker, RunningTimer
  stores/board.ts              Pinia store
  plugins/board-sync.client.ts cross-tab sync; plugins/timer.client.ts timer ticker/heartbeat
  lib/utils.ts                 shadcn `cn()`
shared/                        imported by app AND server (Nuxt 4 `#shared` alias)
  types/domain.ts              states, colors, DTOs
  utils/transitions.ts         state transition patch logic
  utils/position.ts            fractional ordering
  utils/dates.ts               day math, overdue
  utils/kpi.ts                 KPI computation (pure)
  utils/links.ts                task link normalize/group/isBlocked (pure)
  utils/timer.ts                timer/time-entry pure logic (formatDuration, formatClock, taskTrackedSeconds, isStale)
server/
  db/schema.ts                 Drizzle schema
  db/migrations/               drizzle-kit output (committed)
  db/seed.ts                   sample data
  utils/db.ts                  Drizzle client singleton
  utils/mappers.ts             row -> DTO
  api/**                       routes (below)
tests/unit/*.test.ts
docker-compose.yml, .env.example, drizzle.config.ts, vitest.config.ts
docs/ARCHITECTURE.md, docs/THEMING.md, README.md
```

Rule: files in `shared/` use **relative imports only** and no Nuxt auto-imports, so Vitest runs them without Nuxt.

## Domain

Board columns are user-managed (not a fixed enum). Each column has a `kind` that drives KPIs and completion dates: `open`, `active`, `done`. Columns are ordered by `position`, can be hidden, and can be created/renamed/recolored (kind)/reordered/deleted at will (see API below). Kind of a task = kind of its column (a task whose column no longer exists counts as `open`).

Default columns seeded on a fresh DB: Backlog (open), To do (open), In progress (active), Review (active), Done (done) — same labels/order as the old fixed states, now just data.

Color keys (fixed palette, stored as key string): `slate red orange amber green teal blue indigo violet pink`.

### DTOs (`shared/types/domain.ts`) — all timestamps ISO strings, deadline `YYYY-MM-DD`

```ts
export const COLUMN_KINDS = ['open', 'active', 'done'] as const
export type ColumnKind = (typeof COLUMN_KINDS)[number]
export const COLUMN_KIND_LABELS: Record<ColumnKind, string>
export interface BoardColumn { id: string; name: string; kind: ColumnKind; position: number; hidden: boolean; createdAt: string; updatedAt: string }
export const DEFAULT_COLUMNS: { name: string; kind: ColumnKind }[]  // seed data / migration reference
export const COLOR_KEYS = ['slate','red','orange','amber','green','teal','blue','indigo','violet','pink'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

export interface Project { id: string; name: string; color: ColorKey; createdAt: string; updatedAt: string }
export interface Tag { id: string; name: string; color: ColorKey; createdAt: string }
export const TASK_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const
export type TaskSize = (typeof TASK_SIZES)[number]
export const TASK_SIZE_LABELS: Record<TaskSize, string>   // 'XS' | 'S' | 'M' | 'L' | 'XL'
export const TASK_SIZE_HINTS: Record<TaskSize, string>    // short duration hint per size, shown next to the label in pickers
export const TASK_SIZE_WEIGHTS: Record<TaskSize, number>  // { xs: 1, s: 2, m: 4, l: 8, xl: 16 } — relative effort, each size ≈ double the previous; used only for KPI sums
export interface Task {
  id: string; title: string; description: string | null
  projectId: string | null; columnId: string; position: number
  deadline: string | null
  size: TaskSize | null                        // optional t-shirt size; null = unsized
  createdAt: string; updatedAt: string; stateChangedAt: string; completedAt: string | null
  tagIds: string[]
}
export interface StateEvent { taskId: string; fromColumnId: string | null; toColumnId: string | null; toKind: ColumnKind; changedAt: string }
// fromColumnId/toColumnId null when that column was later deleted (FK ON DELETE SET NULL).

export const TASK_LINK_TYPES = ['blocks', 'relates', 'duplicates'] as const
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number]
export interface TaskLink { id: string; fromTaskId: string; toTaskId: string; type: TaskLinkType; createdAt: string }

export const TIMER_STALE_AFTER_MS = 10 * 60_000   // 10 min
export const TIMER_HEARTBEAT_MS = 60_000          // client heartbeat interval
export const TIMER_MIN_ENTRY_SECONDS = 60         // entries ending shorter than this are discarded, not saved
export interface TimeEntry { id: string; taskId: string; startedAt: string; endedAt: string | null; lastSeenAt: string }
export interface RunningTimer { entryId: string; taskId: string; startedAt: string; lastSeenAt: string }
export interface TimerState {
  running: RunningTimer | null
  staleClosed: { taskId: string; endedAt: string; discarded: boolean } | null
  stopped: { taskId: string; discarded: boolean } | null   // the entry this request ended (manual stop or switch), if any
}

export interface BoardData {
  projects: Project[]; tags: Tag[]; tasks: Task[]; columns: BoardColumn[]; links: TaskLink[]
  timeTotals: Record<string, number>              // seconds of FINISHED entries per taskId
  runningTimer: RunningTimer | null
  timerStaleClosed: { taskId: string; endedAt: string; discarded: boolean } | null   // set when this request's stale close ended something
}
// columns sorted by position, includes hidden ones.
```

### Transition rules (`shared/utils/transitions.ts`)

`transitionPatch(task: Pick<Task,'columnId'|'completedAt'>, fromKind: ColumnKind, to: Pick<BoardColumn,'id'|'kind'>, now: Date)` returns `{ columnId, stateChangedAt, completedAt } | null`.
- `to.id === task.columnId` → `null` (reorder only, no timestamps touched).
- `to.kind === 'done'` → `completedAt = fromKind === 'done' ? (task.completedAt ?? now) : now` (moving between two done columns keeps the original completion date unless it was somehow missing).
- `to.kind !== 'done'` → `completedAt = null`.
- `stateChangedAt = now.toISOString()` whenever not null.
Any column → any column allowed (Kanban freedom).

`kindAfterKindChange(taskCompletedAt: string | null, oldKind: ColumnKind, newKind: ColumnKind, now: Date): string | null` — used when a column's `kind` itself is edited, to recompute each of its tasks' `completedAt`: non-done → done sets `now`; done → non-done clears to `null`; otherwise unchanged.

### Ordering (`shared/utils/position.ts`)

Float `position`, ascending within a column. `positionBetween(before: number | null, after: number | null)`: both null → 1000; before null → after − 1000; after null → before + 1000; else midpoint.
`positionAtIndex(sortedPositions: number[], index: number)` → `positionBetween(sortedPositions[index-1] ?? null, sortedPositions[index] ?? null)` where list excludes the moved task.

### Dates (`shared/utils/dates.ts`)

- `localDateIso(d: Date): string` → local `YYYY-MM-DD`.
- `daysBetween(fromIso: string, to: Date): number` → fractional days `(to - from) / 86_400_000`.
- `isOverdue(task: Pick<Task,'deadline'>, kind: ColumnKind, now: Date)` → `deadline !== null && kind !== 'done' && deadline < localDateIso(now)`. `kind` is the kind of the task's column, resolved by the caller.

### KPIs (`shared/utils/kpi.ts`)

`computeKpis(tasks: Task[], projects: Project[], columns: BoardColumn[], now: Date, opts?: { projectId?: string | null | 'none'; weeks?: number /*default 8*/; timeEntries?: { taskId: string; startedAt: string; endedAt: string }[] }): KpiReport`
Filter: `undefined` = all; `'none'` = unassigned; id = that project. Kind of a task = kind of its column; unknown columnId counts as `open`.

```ts
interface KpiReport {
  generatedAt: string
  scope: { projectId: string | null | 'none' }   // null = global
  counts: {
    byColumn: { columnId: string; name: string; kind: ColumnKind; hidden: boolean; count: number }[]  // position order, includes hidden
    open: number; wip: number; done: number; total: number   // wip = kind active
  }
  overdue: number
  cycleTime: { avgDays: number | null; medianDays: number | null; sample: number }   // kind-done tasks: completedAt - createdAt
  throughput: {
    weekly: { weekStart: string; count: number; weight: number }[]   // last `weeks` ISO weeks (Mon start, local), oldest first, includes current week; weight = sum of TASK_SIZE_WEIGHTS for tasks completed that week, unsized = 0
    last30Days: number
    thisMonth: number
  }
  aging: {
    wipAvgDays: number | null                        // avg days since stateChangedAt over kind-active tasks
    oldest: { taskId: string; title: string; columnName: string; days: number }[]  // top 5 kind non-done by days in column, desc
  }
  projects: { projectId: string | null; name: string; color: ColorKey | null; byKind: Record<ColumnKind, number>; total: number }[]
  // global only (empty array when scoped). Unassigned row: projectId null, name 'No project', color null. Sorted by total desc.
  size: {
    weights: Record<TaskSize, number>                          // TASK_SIZE_WEIGHTS, re-exported for convenience
    wip: Record<TaskSize | 'none', number>                     // kind-active tasks by size
    open: Record<TaskSize | 'none', number>                    // kind-open tasks by size
    doneLast30: Record<TaskSize | 'none', number>              // completed in the same window as throughput.last30Days, by size
    doneLast30Weight: number                                   // sum of TASK_SIZE_WEIGHTS over doneLast30 (unsized = 0)
    wipWeight: number                                          // sum of TASK_SIZE_WEIGHTS over wip (unsized = 0)
    unsizedShare: number | null                                // unsized / (open + wip) not-done tasks; null when there are none
  }
  time: {
    last30DaysSeconds: number                                  // sum of finished time-entry durations with `endedAt` in (now-30d, now]; entries straddling the window boundary are clipped to the part inside it
    avgDoneSecondsBySize: Record<TaskSize | 'none', number | null>  // for scoped done tasks with tracked > 0: average total tracked seconds per size; null when no such task
    trackedDoneTasks: number                                   // scoped done tasks with tracked > 0
    doneTasksWithoutTime: number                               // scoped done tasks with 0 tracked seconds
  }
}
```
`opts.timeEntries?: { taskId: string; startedAt: string; endedAt: string }[]` (finished entries only, any scope) drives `time`; entries for out-of-scope tasks are ignored. When omitted, `time` is all zeros/nulls.
Round day values to 1 decimal. Median of even sample = mean of middle two.

## Database (Drizzle, `server/db/schema.ts`)

- `pgEnum('column_kind', COLUMN_KINDS)`
- `projects`: `id uuid pk defaultRandom`, `name text notNull unique`, `color text notNull default 'blue'`, `created_at timestamptz notNull defaultNow`, `updated_at timestamptz notNull defaultNow`
- `tags`: `id uuid pk defaultRandom`, `name text notNull unique`, `color text notNull default 'slate'`, `created_at timestamptz notNull defaultNow`
- `board_columns`: `id uuid pk defaultRandom`, `name text notNull`, `kind column_kind notNull`, `position double precision notNull default 1000`, `hidden boolean notNull default false`, `created_at timestamptz notNull defaultNow`, `updated_at timestamptz notNull defaultNow`
- `pgEnum('task_size', TASK_SIZES)`
- `tasks`: `id uuid pk defaultRandom`, `title text notNull`, `description text`, `project_id uuid references projects.id onDelete set null`, `column_id uuid notNull references board_columns.id onDelete restrict`, `position double precision notNull default 1000`, `deadline date (mode 'string')`, `size task_size` (nullable), `created_at`, `updated_at`, `state_changed_at` (all timestamptz notNull defaultNow), `completed_at timestamptz`
  - indexes: `(column_id, position)`, `(project_id)`, `(completed_at)`
- `task_tags`: `task_id` → tasks cascade, `tag_id` → tags cascade, composite pk
- `pgEnum('task_link_type', TASK_LINK_TYPES)` — `blocks | relates | duplicates`
- `task_links`: `id uuid pk defaultRandom`, `from_task_id uuid notNull` → tasks cascade, `to_task_id uuid notNull` → tasks cascade, `type task_link_type notNull`, `created_at timestamptz notNull defaultNow`
  - unique index `(from_task_id, to_task_id, type)`, index `(to_task_id)`, check `from_task_id <> to_task_id`
  - Semantics: `blocks` from A to B = "A blocks B" (B is blocked by A). `duplicates` from A to B = "A duplicates B". `relates` is symmetric and always stored with `from_task_id < to_task_id` (string compare) so a pair is only ever stored once. `shared/utils/links.ts` (pure, unit-tested): `normalizeLink(fromTaskId, toTaskId, type)` (null on self-link; sorts `relates` pairs), `groupLinksForTask(taskId, links)` → `{ blocks, blockedBy, relates, duplicates, duplicatedBy }` (each `{ link, otherTaskId }[]`), `isBlocked(taskId, links, isDone)` → true if any non-done `blocks` link points at the task.
- `task_state_events`: `id uuid pk`, `task_id` → tasks cascade, `from_column_id uuid` → board_columns onDelete set null (nullable), `to_column_id uuid` → board_columns onDelete set null (nullable), `to_kind column_kind notNull`, `changed_at timestamptz notNull defaultNow`; index `(task_id, changed_at)`
  - Row written on create (from null) and on every column change (move, or column deletion moving its tasks). `to_kind` is the kind of the destination column at the time of the event, kept even if that column is later deleted (columns become null via FK, `to_kind` does not). Source for history/audit + future analytics.
- `time_entries`: `id uuid pk defaultRandom`, `user_id uuid notNull` → users cascade, `task_id uuid notNull` → tasks cascade, `started_at timestamptz notNull`, `ended_at timestamptz` (nullable — null means running), `last_seen_at timestamptz notNull`, `created_at timestamptz notNull defaultNow`
  - index `(task_id)`; unique partial index `(user_id) WHERE ended_at IS NULL` — enforces one running timer per user at the DB level; check `ended_at IS NULL OR ended_at >= started_at`.

### Time tracking

One running timer per user, enforced by the partial unique index above. Starting a timer on task B stops any timer already running on task A first (in the same transaction); starting a timer on the task that's already running is a no-op that returns the current state. All timestamps (`started_at`, `ended_at`, `last_seen_at`) are server-set, never client-supplied.

While a timer runs, the client calls `POST /api/timer/heartbeat` every `TIMER_HEARTBEAT_MS` (60 s) to bump `last_seen_at`. A running entry whose `last_seen_at` is older than `TIMER_STALE_AFTER_MS` (10 min) is considered dead (computer asleep, browser closed, tab killed) — the **stale close** ends it at `ended_at = last_seen_at` (not `now`, so the recorded duration reflects when the client was last known alive). `server/utils/timer.ts#closeStaleTimer(tx, userId, now)` implements this and is called first, inside the same transaction, by every timer/time-entry endpoint and by `GET /api/board`; when it fires, the response's `staleClosed`/`timerStaleClosed` field is filled so the UI can announce it.

Moving a task into a column of `kind: 'done'` (`POST /api/tasks/:id/move`) stops that task's running timer at `ended_at = now` (`server/utils/timer.ts#stopRunningTimer(tx, userId, now, { taskId })`) — no stale close involved there, it's an immediate, unconditional stop scoped to that task.

**Discard rule:** any entry that would end with a duration under `TIMER_MIN_ENTRY_SECONDS` (60 s) is deleted instead of closed — nothing under a minute is ever recorded. This applies to every way a running entry ends: manual stop (`DELETE /api/timer`), switching the timer to another task (`POST /api/tasks/:id/timer` while another task's timer is running), moving the task to a `done` column (`stopRunningTimer`), and the stale close above (`closeStaleTimer`, using `last_seen_at - started_at`). `server/utils/timer.ts#endEntry(tx, entry, endedAt)` is the single helper implementing this (used by `closeStaleTimer`, `stopRunningTimer`, and the switch branch of `POST /api/tasks/:id/timer`): it deletes the entry (guarded by `ended_at IS NULL`) when `isDiscardable(startedAt, endedAt)` is true, otherwise sets `ended_at` as usual. The decision itself lives in `shared/utils/timer.ts#isDiscardable(startedAt, endedAt)`. Manual "add time" (below) is unaffected — it already has a 1-minute minimum. `TimerState.staleClosed`/`BoardData.timerStaleClosed` and `TimerState.stopped` all carry a `discarded: boolean` flag so the UI can explain when nothing was recorded; `TimerState.stopped: { taskId, discarded } | null` describes the entry this request ended (manual stop or switch) so the client announces it correctly.

Manual time entry: `POST /api/tasks/:id/time-entries { minutes }` (1–1440) inserts an already-finished entry (`started_at = now - minutes`, `ended_at = now`). Deleting an entry (`DELETE /api/time-entries/:id`) only works on finished entries; deleting the running one 409s ("Stop the timer first").

Pure decision logic lives in `shared/utils/timer.ts` (relative imports only, unit-tested in `tests/unit/timer.test.ts`): `isStale(lastSeenAt, now)` (strictly greater than the window), `durationSeconds(startedAt, endedAt)`, `isDiscardable(startedAt, endedAt)` (true when the duration is under `TIMER_MIN_ENTRY_SECONDS`), `formatDuration(seconds)` (`"0 min"` below 60 s, `"12 min"` below an hour, else `"1 h 05 min"`), `formatClock(seconds)` (`"0:12:34"` / `"12:34:56"`), and `taskTrackedSeconds(taskId, totals, running, now)` — finished total plus the live running part when `running.taskId === taskId` (capped at `lastSeenAt` instead of `now` if that running entry has gone stale).

`server/utils/timer.ts` (server-side, DB-touching): `endEntry(tx, entry: { id, startedAt }, endedAt)` (deletes or closes an entry per the discard rule above, returns `{ discarded, entry }`), `closeStaleTimer`, `getRunningTimer(db, userId)`, `stopRunningTimer(tx, userId, now, opts?: { taskId })` (only stops when running on `opts.taskId`, if given; returns `{ taskId, discarded, entry } | null`). Mapper `toTimeEntry(row)` in `server/utils/mappers.ts`.

Deleting a column with tasks in it requires `moveTo` another column; deleting a column that ends up referenced by past events sets the corresponding `from_column_id`/`to_column_id` to null (`ON DELETE SET NULL`) — history is preserved, just anonymized on the deleted column's identity. `tasks.column_id` itself uses `ON DELETE RESTRICT`: a column can only be deleted once it has no tasks left (the API enforces the `moveTo` step before deleting).

All timestamptz columns use `{ withTimezone: true, mode: 'date' }`; mappers convert to ISO.

## API (Nitro, `server/api`)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/board` | — | `BoardData` (includes `columns`, `links`) |
| POST | `/api/projects` | `{ name, color? }` | `Project` (409 on duplicate name) |
| PATCH | `/api/projects/:id` | `{ name?, color? }` | `Project` |
| DELETE | `/api/projects/:id` | — | 204 (tasks → unassigned) |
| POST | `/api/tags` | `{ name, color? }` | `Tag` (409 dup) |
| PATCH | `/api/tags/:id` | `{ name?, color? }` | `Tag` |
| DELETE | `/api/tags/:id` | — | 204 |
| POST | `/api/columns` | `{ name (1..40), kind }` | `BoardColumn` (appended, position = max + 1000) |
| PATCH | `/api/columns/:id` | `{ name?, kind?, hidden?, position? }` (≥1 field) | `BoardColumn` (kind change recomputes the column's tasks' `completed_at` via `kindAfterKindChange` semantics, one transaction) |
| DELETE | `/api/columns/:id` | `?moveTo=<uuid>` | 204. 404 unknown id; 409 "Cannot delete the last column"; if column has tasks: `moveTo` required (400) and must be another existing column (400) — tasks are moved to the end of the target (positions after its max, relative order kept), `transitionPatch` applied per task, events written (one transaction) |
| POST | `/api/tasks` | `{ title, description?, projectId?, columnId?, deadline?, size?, tagIds? }` | `Task` (position = end of column; `columnId` defaults to the first non-hidden `open` column, else the first column; 400 on unknown `columnId`) |
| PATCH | `/api/tasks/:id` | `{ title?, description?, projectId?, deadline?, size?, tagIds? }` | `Task` (no column move here; `size` accepts `TaskSize \| null`, zod 400 on invalid value) |
| POST | `/api/tasks/:id/move` | `{ columnId, position }` | `Task` (400 unknown `columnId`; applies `transitionPatch`, writes event in same transaction) |
| DELETE | `/api/tasks/:id` | — | 204 |
| GET | `/api/tasks/:id/events` | — | `StateEvent[]` asc |
| POST | `/api/tasks/:id/links` | `{ toTaskId, type: TaskLinkType }` | `TaskLink`, 201 (422 self-link or `blocks` cycle; 404 if either task isn't the caller's; 409 duplicate link) |
| DELETE | `/api/links/:id` | — | 204 (404 unless the link's `from_task_id` task belongs to the caller) |
| POST | `/api/checklist/:id/convert` | — | `{ task: Task, link: TaskLink, item: ChecklistItem }` — creates a task from the checklist item (title, parent's `projectId`, first open column), adds a `relates` link to the parent, marks the item done (404 unless the item's task belongs to the caller) |
| GET | `/api/kpis` | `?projectId=<uuid>|none` | `KpiReport` |
| POST | `/api/tasks/:id/timer` | — | `TimerState` — starts a timer on the task (stops any other running timer first); no-op if already running on this task; 409 on a unique-violation race |
| DELETE | `/api/timer` | — | `TimerState` (`running: null`) — stops the caller's running timer, if any (200 either way); `stopped` describes it (`discarded: true` if it ran under `TIMER_MIN_ENTRY_SECONDS`, in which case it was deleted, not saved) |
| POST | `/api/timer/heartbeat` | — | `TimerState` — bumps `last_seen_at` on the running timer; `staleClosed` filled if the stale close fired first |
| GET | `/api/tasks/:id/time-entries` | — | `TimeEntry[]`, newest first |
| POST | `/api/tasks/:id/time-entries` | `{ minutes: 1..1440 }` | `TimeEntry`, 201 — manual finished entry ending now |
| DELETE | `/api/time-entries/:id` | — | 204 (404 unless the entry belongs to the caller; 409 "Stop the timer first" if it's still running) |

Validation errors → 400 via zod. Unknown id → 404. `updated_at` set on every mutation.
Analytics hook: server emits `useNitroApp().hooks.callHook('scout:task-moved', { taskId, fromColumnId, toColumnId, toKind, at })` after move; plugin `server/plugins/analytics.ts` logs in dev. Extensible later.

## Frontend

### Store `app/stores/board.ts` (`useBoardStore`, setup style)

State: `projects`, `tags`, `tasks`, `columns: BoardColumn[]`, `links: TaskLink[]`, `projectFilter: string | null | 'none'` (null = all), `loaded`, `runningTimer: RunningTimer | null`, `timeTotals: Record<string, number>` (finished seconds per task), `timerNotice: string | null` (visible stale-close notice text).
Getters: `projectById`, `tagById`, `columnById` (Map lookups); `sortedColumns` (by position, includes hidden), `visibleColumns` (not hidden), `hiddenColumns`; `visibleTasks`; `tasksByColumn(columnId)` (filtered by `visibleTasks`, sorted by position).
Actions: `load()` (also seeds `runningTimer`/`timeTotals` from `BoardData` and calls `setStaleNotice` if `timerStaleClosed` is set), `createTask({ title, columnId?, projectId?, description?, deadline?, size?, tagIds? })`, `updateTask` (patch incl. `size?: TaskSize | null`), `moveTask(id, toColumnId, toIndex)` (resolves `fromKind` from the task's current column, applies `transitionPatch`; optimistically stops the running timer locally when the destination column's kind is `done` and it belongs to the moved task, folding its live seconds into `timeTotals` only when they reach `TIMER_MIN_ENTRY_SECONDS` — the server performs the real stop/discard), `deleteTask` (also drops local links referencing the task), `createProject`, `createTag`, `addChecklistItems`/`updateChecklistItem`/`deleteChecklistItem`, `fetchEvents`, `addLink(taskId, toTaskId, type)` (POST, pushes the returned `TaskLink`), `removeLink(id)` (optimistic filter, then DELETE), `convertChecklistItem(taskId, itemId)` (POST `/api/checklist/:id/convert`; upserts the new task, pushes the `relates` link, replaces the checklist item; returns the new `Task`).
Column actions (all through the shared `run()` optimistic-then-reconcile wrapper, bump `revision`): `createColumn(name, kind)`, `updateColumn(id, patch: { name?; kind?; hidden?; position? })` (optimistic merge; reloads the whole board after a successful `kind` change since the server recomputes affected tasks' `completedAt`), `deleteColumn(id, moveTo?)` (always reloads the board after), `moveColumn(id, direction: -1 | 1)` (swaps with the neighbour in `sortedColumns` via a single `position` PATCH computed with `positionBetween` of the neighbour's neighbours).
Mutations optimistic: apply locally (using `shared/` logic), call API, replace with server DTO; on error reload board and surface error.

### Time tracking (frontend)

Store: `setStaleNotice({ taskId, endedAt, discarded })` (builds the notice text from the task title and local `HH:MM`; when `discarded` is true the text instead says the timer ran less than a minute and nothing was recorded), `applyTimerState(state: TimerState)` (sets `runningTimer` and calls `setStaleNotice` when `staleClosed` is set — shared by every timer action below), `startTimer(taskId)` (optimistic: if another timer is running, folds its live seconds into `timeTotals` first — only when they reach `TIMER_MIN_ENTRY_SECONDS` — then sets a placeholder `runningTimer`; POSTs `/api/tasks/:id/timer`, applies the server `TimerState`), `stopTimer()` (optimistic local stop, folding live seconds into `timeTotals` only when they reach `TIMER_MIN_ENTRY_SECONDS`, then DELETE `/api/timer`), `heartbeat()` (plain `$fetch` to `/api/timer/heartbeat`, deliberately **not** routed through `run()` so it doesn't bump `revision` or spam other tabs via the sync channel; network errors are swallowed, the next heartbeat retries), `addTime(taskId, minutes)` (POST `/api/tasks/:id/time-entries`, adds `minutes*60` to `timeTotals` on success), `deleteTimeEntry(entry)` (DELETE `/api/time-entries/:id`, subtracts the entry's duration from `timeTotals`, floored at 0), `fetchTimeEntries(taskId)` (GET, used by `TaskTime`).

Ticker/heartbeat plugin `app/plugins/timer.client.ts`: `useState('timerNow', () => Date.now())` is the single shared clock every component reads to compute live seconds (`taskTrackedSeconds`). While `store.runningTimer` is set it runs a 1s `setInterval` updating `timerNow` and a `TIMER_HEARTBEAT_MS` `setInterval` calling `store.heartbeat()`; both are cleared the moment `runningTimer` becomes `null` (`watch(() => store.runningTimer, ..., { immediate: true })`). It also calls `store.heartbeat()` immediately on `visibilitychange` (tab becoming visible) and on the `online` event, whichever fires first after the computer wakes from sleep or the network comes back — this is what makes a reconnect notice the stale-close quickly instead of waiting for the next minute tick. A separate `watch(() => store.timerNotice, ...)` calls `announce()` (`useLiveAnnouncer`) exactly once when the notice text becomes non-null, so the stale-close is announced once by the plugin, not by every component that happens to render the notice bar.

UI: stopping or switching away from a timer that ran under `TIMER_MIN_ENTRY_SECONDS` announces `Timer stopped for "<title>" — under a minute, not recorded` instead of the usual "<duration> tracked" text (`board/TaskCard`, `task/TaskTime`, `common/RunningTimer`); the discarded entry simply doesn't show up when `TaskTime`'s entry list next refreshes. `board/TaskCard` has a `Play`/`Square` icon button in the header actions (before the ⋮ menu) — hover/focus-only when idle, always visible with a ticking `formatClock` next to it (in an `aria-hidden` span, wrapped in `<ClientOnly>`) when running on that card; a muted `Timer` icon + `formatDuration` shows in the meta row when idle with tracked time. `task/TaskTime` (in `TaskPanel`, between the checklist and `TaskLinks`) shows the live/total time, the same Start/Stop control, three quick-add buttons (+15 min/+30 min/+1 h) plus a minutes `Input` + Add form (1–1440, `role="alert"` on out-of-range), and the entry list (newest first, delete button per finished entry, none on the running one). `common/RunningTimer` (page header, before "New task") shows a ticking clock + task title button that opens the task, and a Stop icon button; only rendered while a timer is running. The visible stale-close notice bar lives in `pages/index.vue` (`store.timerNotice`, neutral `bg-muted`, plain markup — no live region, since the plugin already announces it once — with a Dismiss button).

### Cross-tab sync (`app/plugins/board-sync.client.ts`)

A client plugin keeps tabs of the same browser in sync without server involvement. Every successful mutation bumps `store.revision`; a watcher posts an `{ type: 'invalidate' }` message (tagged with a per-tab id) on a `BroadcastChannel('scout-board')`. Other tabs receiving that message (and the tab itself on `visibilitychange` back to visible, throttled to once per 5s) schedule a debounced (300ms) full `store.load()`. The debounce/drag/overlap state machine lives in `shared/utils/sync-scheduler.ts` (pure, unit-tested): bursts of invalidations coalesce into one reload, a reload is deferred while `useState('boardDragging')` is true and runs once right after the drag ends, and an invalidation arriving while a reload is already in flight causes exactly one follow-up reload instead of overlapping requests. `load()` never bumps `revision`, so a reload triggered by a remote message does not echo back out. Reloads are skipped entirely before the board has ever loaded (e.g. on `/login`) to avoid a redirect loop.

### Screen layout (`pages/index.vue`)

```
┌ Header: "Scout" | Project filter (Select) | [+ Task] | [KPIs toggle] | [Account menu] ─┐
├ Board: user-managed columns, horizontal scroll ───┬ TaskPanel (docked, optional) ┤
│ [Column header: kind icon, label, count Badge,    │  edit UI for the open task,          │
│  actions DropdownMenu]                            │  autosave, no Save button            │
│ TaskCards (draggable, click opens TaskPanel)      │                                      │
│ + Add task (inline input)                         │                                      │
│ … + Add column / Hidden columns (n) ──────────────┘                                      │
└───────────────────────────────────────────────────┴──────────────────────────────────────┘
```

KPIs open in a separate `Sheet` (right, overlay) and close the `TaskPanel` if it was open (only one right-side panel at a time).

Columns themselves are rendered by `KanbanBoard.vue` from `store.visibleColumns`; after the last column sits an "add column" widget (ghost button → inline name + kind form) and, when any columns are hidden, a "Hidden columns (n)" `DropdownMenu` to unhide them.

### shadcn-vue component map

| UI pattern | Component(s) |
|---|---|
| Task card | `Card`, `CardHeader`, `CardTitle`, `CardContent` |
| Project label | `common/ProjectBadge` — filled rounded rectangle (swatch tint via `color-mix`), `Folder` icon, no dot |
| Tag chips | `common/ColorBadge` — outline pill (`rounded-full`) with color dot via `--swatch-*` |
| Account menu | `common/AccountMenu` — user name, theme switch (`useColorMode` → `store` ref: light / dark / auto), sign out |
| Task edit (docked panel) | `task/TaskPanel` — non-modal `<aside>`, docked right on `md`+, full-screen below `md`; autosave per field, Activity section (no tabs) |
| Column count | `Badge variant="secondary"` |
| Column kind indicator | `Circle`/`CircleDot`/`CircleCheck` (lucide) + `Tooltip`, `aria-label` = kind label |
| Column actions (rename, type, move, hide, delete) | `DropdownMenu` + `DropdownMenuSub` › `DropdownMenuRadioGroup` for "Type" |
| Task actions (edit, move to…, delete) | `DropdownMenu` + `DropdownMenuSub` for "Move to" (keyboard alternative to drag) |
| Delete confirm (task or column) | `AlertDialog`; column delete shows a `Select` of other columns when it still has tasks |
| Create task (expanded) | `Dialog` (create-only) + `Input`, `Textarea`, `Label`, `Button`, `Select` (column picker) |
| Inline quick-add | `Input` + `Button` inside column |
| Project / tag pick + inline create | `Popover` + `Command` (combobox; "Create “xyz”" item when no exact match) |
| Color choice on inline create | `common/ColorPicker` (radio group of swatch buttons) |
| Deadline | `Popover` + `Calendar` (`@internationalized/date`, CalendarDate ↔ `YYYY-MM-DD`) |
| Task size | `task/SizePicker` — `Select`/`SelectTrigger` (size `sm`) / `SelectItem`; "No size" (`__none`) maps to `null`, other items show `LABEL — hint`; trigger shows just the label (or "Size" placeholder) |
| Task links | `task/TaskLinks` — grouped list (Blocks / Blocked by / Relates to / Duplicates / Duplicated by) with a `Popover` "Add link" (type `Select` + task search `Input`, up to 8 results) |
| Time tracking | `board/TaskCard` timer button (header actions), `task/TaskTime` (panel: Start/Stop, quick-add `Button`s, minutes `Input` + `Label`, entry list), `common/RunningTimer` (header, `Button` pair) |
| Project filter | `Select` |
| KPI panel | `Sheet`, `Card`, `Progress`, `Separator`, `Tooltip` |
| Scroll areas | column `ul` scrolls itself (native overflow) |

### Card click behavior

The task `<li>` has a single `click` handler (`BoardColumn.vue`'s `onCardClick`): it opens the docked `TaskPanel` (`useTaskPanel().openTask`) unless `event.target` is inside an interactive element — `closest('button, a, input, textarea, select, [role="checkbox"], [role="menuitem"], [data-no-open]')` — in which case it returns early and lets that element's own handler run (project/tag pickers, the rename button, the actions menu, checklist controls). `dblclick` is not used any more; dragging still starts on pointer movement (SortableJS) independent of the click handler. `CardChecklist`'s root carries `data-no-open` so any click inside the sub-todo list (toggle, add-row) never opens the panel. Keyboard: the `<li>` is focusable and `Enter` opens the panel via `@keydown.enter.self.prevent`. The `<li>` for the currently open task gets `aria-current="true"` and a ring highlight.

`TaskPanel.vue` is a non-modal `<aside>` (not a `Dialog`): docked to the right of the board on `md`+ screens (`w-[28rem] lg:w-[32rem]`, board still visible/draggable), full-screen (`fixed inset-0`) below `md`. It has no Save button — every field autosaves (`store.updateTask` per changed field), with a "Saving…"/"Saved" status next to the title. Title and description use local drafts that commit on blur/Enter and flush against the previous task's id before switching to a newly opened task, so clicking another card without blurring never loses an edit. `Escape` closes the panel unless a nested popover/menu already handled it (`event.defaultPrevented`); closing (Escape or the X button) returns focus to the task's card. Creating a task still uses the modal `TaskDialog` (`useTaskDialog`).

Inline edits (card title, column rename) set `useState('inlineEditing')`. Each `<li>` records that flag on `pointerdown` (capture); if an inline edit was active, the following click only ends the edit (blur → save) and never opens a dialog. Inline inputs: Enter/`Check` button = save, Escape/`X` button = cancel (commit functions guard against the blur that fires when the input unmounts).

Columns are fluid: `min-w-72 max-w-[32rem] flex-[1_1_18rem]` — they share free width, never shrink below 18rem (board scrolls horizontally instead).

Card title is plain text (not a button); renaming happens via a small ghost `Pencil` icon button (visible on card hover/focus-within) that switches to an inline `Input`. The project/tag "add" affordances are hover-only chips positioned *after* the real badges (via flex `order-*` utilities) using `hidden …:inline-flex` rather than `opacity-0`, so an empty state doesn't reserve visual space before the badges.

### Accessibility

- Column: `<section aria-labelledby>` pointing at the column's `h2#col-{id}`; list `role="list"`, card `role="listitem"`.
- Every drag action has a keyboard path via the card's DropdownMenu "Move to" (lists `visibleColumns` except the current one) and the column's DropdownMenu "Move left"/"Move right".
- Card focusable (`tabindex="0"`), Enter opens edit dialog; click anywhere on the card body (see above) does the same.
- Color never sole carrier of meaning: badges always show text; overdue shows text "Overdue" + icon; column kind icon always pairs with a `Tooltip` + `aria-label` text.

### Search palette (⌘K)

Client-side fuzzy search over everything already in `store.tasks` — no server round-trip. `shared/utils/search.ts` (pure, unit-tested) builds a `SearchDoc` per task (`title`, `description`, `checklist` item titles, `project` name, `tag` names, `done`) via `toSearchDocs`, indexes it with `Fuse` (`createSearchIndex`; weighted keys — title 3, tags 2, project 2, checklist 1.5, description 1; `ignoreLocation`, `threshold: 0.35`, `minMatchCharLength: 2`), and ranks hits with `searchTasks(index, query, limit)`: queries under 2 chars return no hits; done tasks get a `+0.25` score penalty (lower = better) so an otherwise-equal open task ranks above a done one; the best-matching field (title > tags > project > checklist > description) drives the returned `field` and a ≤90-char `snippet` (title matches have no snippet — the title itself is highlighted instead).

`app/components/common/SearchPalette.vue` renders the results in a `CommandDialog`. It intentionally does not use `CommandInput` (that component wires into the shadcn `Command` wrapper's own substring filter via `filterState.search`); instead it renders its own `ListboxFilter`-based input bound to a local `query` ref so our Fuse ranking is the only ranking in play, while still getting `ListboxRoot`'s arrow-key highlight/Enter-to-select/Escape-to-close for free. Each row shows the column-kind icon, the title with matched ranges wrapped in `<mark>` text nodes (never `v-html`), column + project name, and the snippet when present; done tasks render muted. No hits → a "Create task "…"" row that opens `TaskDialog` prefilled with the query; selecting a task that's outside the current project filter resets the filter before opening it in `TaskPanel` and scrolling its card into view. Opened via the header's Search button or the global `⌘K`/`Ctrl+K` shortcut (`useEventListener` on `window` in `pages/index.vue`).

## Sub-todos (checklist)

- Table `checklist_items` (`id`, `task_id` → tasks cascade, `title`, `done`, `position`, `created_at`, `completed_at`); index `(task_id, position)`.
- DTO `ChecklistItem`; embedded as `Task.checklist` (sorted by position), loaded in `/api/board` with one query.
- API: `POST /api/tasks/:id/checklist { titles[] }`, `PATCH /api/checklist/:id { title?, done?, position? }`, `DELETE /api/checklist/:id`. Mutations bump parent `tasks.updated_at`.
- UI: `board/CardChecklist` (progress `n/m` + expandable checkbox list on card), `task/ChecklistEditor` (dialog; draft mode before task exists).
- "Convert to task": in existing-task mode, each non-done checklist row has a `SquareArrowOutUpRight` icon button (`store.convertChecklistItem(taskId, itemId)`) that turns it into a full task (`POST /api/checklist/:id/convert`, see Task links below) and marks the item done.

## Task links (blocks / relates / duplicates)

- Types (`shared/types/domain.ts`): `TASK_LINK_TYPES = ['blocks', 'relates', 'duplicates']`, `TaskLink { id, fromTaskId, toTaskId, type, createdAt }`; embedded in `BoardData.links` (loaded with `/api/board`, one query joined on `from_task_id`'s owner).
- Pure logic + DB shape: see `shared/utils/links.ts` and the `task_links` table above.
- API: `POST /api/tasks/:id/links`, `DELETE /api/links/:id`, `POST /api/checklist/:id/convert` (see API table above). `server/utils/columns.ts#defaultColumn(db, userId)` (first non-hidden `open` column by position, else the first column) backs both task creation (`POST /api/tasks`) and the convert endpoint.
- Store: `board.links: TaskLink[]`, `addLink(taskId, toTaskId, type)`, `removeLink(id)`, `convertChecklistItem(taskId, itemId)` (see Store above).
- UI: `task/TaskLinks` (in `TaskPanel`, between the checklist and Activity) groups links via `groupLinksForTask` and lets you open the other task, remove a link, or add one (Popover: type + fuzzy task search via `shared/utils/search.ts`). `board/TaskCard` shows a `Ban` icon (`role="img" aria-label="Blocked"`, title lists blocker titles) when `isBlocked(task.id, store.links, …)` is true — it clears once every blocking task's column is `kind: 'done'`.

## Auth

Username/password login via `nuxt-auth-utils` sealed httpOnly cookie sessions (no JWT); cookie encryption key from `NUXT_SESSION_PASSWORD` (min 32 chars). Accounts come from the `users` table (see below), passwords stored as PBKDF2-SHA256 hashes (`server/utils/password.ts`). `POST /api/auth/login` looks up the user and checks the password via `verifyCredentials` (`server/utils/login.ts`), which also hashes against a dummy value for unknown users so timing does not reveal which usernames exist, then calls `setUserSession`. `POST /api/auth/password { currentPassword, newPassword }` lets a signed-in user change their own password (UI: account menu → Change password). Server middleware `server/middleware/auth.ts` denies every `/api/**` route by default (`requireUserSession`), except `/api/auth/login` and `/api/_auth/*` (the module's own session endpoints). Sessions carry a server-only `secure.sv`, which is compared against `users.session_version` on every API request (`server/utils/session-guard.ts`, also hooked into `GET /api/_auth/session`); password changes bump `session_version`, which signs out every other session for that user while the device that changed the password gets a fresh one. Client-side, `app/middleware/auth.global.ts` redirects to `/login` when signed out and away from `/login` when signed in; `app/stores/board.ts` uses `useRequestFetch()` for `load()` so the session cookie is forwarded during SSR, and treats any 401 from a mutation as a sign-out (redirects to `/login` instead of reloading the board).

## Accounts & isolation

Accounts live in a `users` table (`id`, `username` unique, `password_hash` nullable, `created_at`); there is no public registration, accounts are created with `pnpm user:add <name>` and reset with `pnpm user:passwd <name>` (both prompt for a password, `server/db/users.ts`). Every `projects`, `tags`, `board_columns`, `tasks`, and `time_entries` row carries a `user_id` (cascade on delete); child tables (`task_tags`, `checklist_items`, `task_state_events`) derive ownership through their parent task. Isolation is enforced in application code, not via Postgres RLS: every handler calls `requireUserId(event)` (`server/utils/owner.ts`) first and scopes its queries with `eq(table.userId, userId)`. An `[id]` route param belonging to another user always 404s; an id referenced in a request body/query (`projectId`, `columnId`, `tagIds`, `moveTo`) belonging to another user 400s — checked up front via `assertOwnedRefs(db, userId, refs, message)`. Session shape is `{ user: { id, name }, loggedInAt }`; a session without `user.id` is cleared and rejected with 401. In production RLS is enabled on every table with no policies for the Data API roles; the app connects as `scout_app`, which has a permissive per-table policy (`scripts/sql/app-role.sql`), so these app-level ownership checks remain the actual isolation mechanism.

## AI (Claude or local Ollama)

- Provider switch per request (`server/utils/ai.ts`, `aiChat`/`aiStatus`): if the signed-in user has a Claude API key configured, requests go to Claude; otherwise they fall back to local Ollama (unchanged behavior, incl. empty `OLLAMA_URL` = disabled). `getUserAnthropicKey(event)` reads and decrypts the user's key, returning `null` when unset, undecryptable, or `NUXT_ENCRYPTION_KEY` is empty.
- Claude call: `@anthropic-ai/sdk`, `client.messages.create` with `model: 'claude-haiku-4-5'` (no `output_config.effort`, no server-side refusal fallback), and `output_config.format = { type: 'json_schema', schema }` for the JSON routes (`additionalProperties: false` on every object). `stop_reason === 'refusal'` → 422; SDK error classes map to 400/403/429/502/503, never exposing the key. Each AI call is rate-limited per user (`AI_LIMITER`, 20/min, `server/utils/rate-limit.ts`). Stored Claude keys are AES-GCM encrypted with the signed-in user's id as additional authenticated data (format `v2`, `server/utils/secret-box.ts`).
- Key at rest: AES-256-GCM (WebCrypto only), key material derived via SHA-256 from `NUXT_ENCRYPTION_KEY` (min 32 chars). Stored as `v2:<ivB64url>:<ciphertextB64url>` in `users.anthropic_api_key`, with the user id as additional authenticated data (legacy `v1` values are rejected) (`server/utils/secret-box.ts`: `encryptSecret`, `decryptSecret` — never throws, returns `null` on any tamper/format issue —, `secretHint`).
- Settings endpoints `server/api/settings/ai.{get,put,delete}`: GET returns `{ claudeKeyConfigured, claudeKeyHint, encryptionConfigured }`; PUT validates the key against Anthropic (`client.models.retrieve`) before encrypting and storing it; DELETE clears the column. UI: `AiSettingsDialog.vue` (Account menu → AI settings).
- Local Ollama fallback unchanged: `server/utils/ollama.ts` (status + non-streaming chat, `think: false`, 90 s timeout, 503 when offline), config `OLLAMA_URL` (default `http://127.0.0.1:11434`), `OLLAMA_MODEL` (default `qwen3:8b`).
- `server/utils/ai-prompts.ts` (pure prompt builders; forbid invented facts/metrics; answer in input language).
- Routes `server/api/ai/`: `status.get`, `improve-title.post`, `draft-description.post`, `suggest-subtasks.post`, `achievement-summary.post` (done tasks in date range → manager-ready Markdown).
- UI `app/components/ai/*` + `useAi()` (`status.provider: 'claude' | 'ollama'`); buttons disabled with reason tooltip when AI not ready.

## UX decisions (M5)

- KPIs in right `Sheet` drawer (`sm:max-w-3xl`, overlay `bg-black/60`), closed by default.
- Card: inline title edit (click title), inline project/tag pickers (picker trigger slot), `data-no-drag` on every interactive child (Sortable `filter`).
- Columns scroll individually (list `ul` is the scroll container); page never scrolls.
- Global `cursor: pointer` for interactive elements (Tailwind v4 dropped it for buttons).

## Extensibility notes

Time tracking → `time_entries` table keyed on task, fully implemented end to end (see Time tracking above, both sections). Dependencies → `task_links`. Shared projects → membership table on top of `user_id` ownership. Event table already supports history/timeline views.
