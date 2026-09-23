# M6-A1 — Configurable columns: data model, migration, API, KPI logic

Executor: `executor` (sonnet). Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Goal: replace the fixed `task_state` enum with user-managed **board columns**. Each column has a `kind` (`open` | `active` | `done`) that drives KPIs and completion dates. Existing data MUST survive the migration.
You own: `shared/**`, `server/**`, `tests/unit/**`, `docs/ARCHITECTURE.md` (update the Domain/Database/API/KPI sections to the new model). Frontend (`app/**`) is the NEXT task — do not edit it; the frontend will be type-broken after your change, that is expected. `nuxi typecheck` will therefore fail in `app/**`; your acceptance uses a server/shared-only check (step 11).
Parallel agent edits only `app/assets/css`, `app/app.vue`, `nuxt.config.ts`, `app/pages/index.vue`, `app/components/common/*`, `app/components/ui/{sheet,dialog,alert-dialog}/*Overlay.vue`, `docs/THEMING.md` — don't touch.
Dev server on 3100 belongs to lead; don't kill it. Rule: never delete/modify DB rows you didn't create, except via the migration itself.

## 1. Shared types (`shared/types/domain.ts`)

Remove `TASK_STATES`, `TaskState`, `STATE_LABELS`, `OPEN_STATES`, `WIP_STATES`. Add:
```ts
export const COLUMN_KINDS = ['open', 'active', 'done'] as const
export type ColumnKind = (typeof COLUMN_KINDS)[number]
export const COLUMN_KIND_LABELS: Record<ColumnKind, string> = { open: 'Open', active: 'Active', done: 'Done' }
export interface BoardColumn { id: string; name: string; kind: ColumnKind; position: number; hidden: boolean; createdAt: string; updatedAt: string }
```
`Task`: replace `state: TaskState` with `columnId: string`. Keep `stateChangedAt` (now = last column change) and `completedAt`.
`StateEvent` → `{ taskId: string; fromColumnId: string | null; toColumnId: string | null; toKind: ColumnKind; changedAt: string }` (`toColumnId` null when that column was deleted later).
`BoardData` → add `columns: BoardColumn[]` (sorted by position, includes hidden).
Default columns constant (used by migration reasoning + seed):
```ts
export const DEFAULT_COLUMNS: { name: string; kind: ColumnKind }[] = [
  { name: 'Backlog', kind: 'open' }, { name: 'To do', kind: 'open' },
  { name: 'In progress', kind: 'active' }, { name: 'Review', kind: 'active' }, { name: 'Done', kind: 'done' },
]
```

## 2. Transitions (`shared/utils/transitions.ts`)

```ts
export function transitionPatch(
  task: Pick<Task, 'columnId' | 'completedAt'>, fromKind: ColumnKind,
  to: Pick<BoardColumn, 'id' | 'kind'>, now: Date,
): { columnId: string; stateChangedAt: string; completedAt: string | null } | null
```
- same column id → `null`.
- `to.kind === 'done'`: `completedAt = fromKind === 'done' ? task.completedAt ?? now : now` (moving between two done columns keeps the original completion date).
- `to.kind !== 'done'` → `completedAt = null`.
- `stateChangedAt = now`.

Add `kindAfterKindChange(tasksCompletedAt: string | null, oldKind, newKind, now)` → returns new `completedAt` for tasks in a column whose kind is edited: to done from non-done → `now`; from done to non-done → `null`; else unchanged.

## 3. KPIs (`shared/utils/kpi.ts`)

`computeKpis(tasks, projects, columns: BoardColumn[], now, opts?)`. Kind of a task = kind of its column (tasks whose column is unknown count as `open`). Changes to `KpiReport`:
- `counts: { byColumn: { columnId: string; name: string; kind: ColumnKind; hidden: boolean; count: number }[]; open: number; wip: number; done: number; total: number }` — byColumn in column position order, all columns (hidden too). `wip` = kind `active`.
- `overdue`: deadline passed and kind ≠ done. `cycleTime`: tasks of kind done with completedAt.
- `aging.wipAvgDays`: over kind active. `aging.oldest`: kind ≠ done, `{ taskId; title; columnName; days }`.
- `projects[].byKind: Record<ColumnKind, number>` (replaces `byState`).
- Everything else (throughput, rounding, sorting, scope) unchanged.
`shared/utils/kpi-summary.ts`: adapt (`wip = byKind.active`, done = `byKind.done`). Keep output format.

## 4. Schema (`server/db/schema.ts`)

- `columnKind = pgEnum('column_kind', COLUMN_KINDS)`.
- `boardColumns` (`board_columns`): `id uuid pk defaultRandom`, `name text notNull`, `kind column_kind notNull`, `position double notNull default 1000`, `hidden boolean notNull default false`, `created_at`, `updated_at` timestamptz notNull defaultNow.
- `tasks`: drop `state`; add `column_id uuid notNull → board_columns.id onDelete restrict`; index `(column_id, position)` replaces `(state, position)`.
- `task_state_events`: drop `from_state`/`to_state`; add `from_column_id uuid → board_columns onDelete set null` (nullable), `to_column_id uuid → board_columns onDelete set null` (nullable), `to_kind column_kind notNull`.
- Drop `task_state` enum. Relations updated.

## 5. Migration (data-preserving)

1. `npm run db:generate` → new SQL file. It will NOT preserve data. **Hand-edit that generated file** (keep drizzle's snapshot/journal as generated) so it does, in this order (use `--> statement-breakpoint` separators like the file does):
   1. `CREATE TYPE column_kind`; `CREATE TABLE board_columns (...)` + temp column `legacy_state text`.
   2. `INSERT INTO board_columns (name, kind, position, legacy_state) VALUES ('Backlog','open',1000,'backlog'),('To do','open',2000,'todo'),('In progress','active',3000,'in_progress'),('Review','active',4000,'review'),('Done','done',5000,'done');`
   3. `ALTER TABLE tasks ADD COLUMN column_id uuid;` → `UPDATE tasks t SET column_id = c.id FROM board_columns c WHERE c.legacy_state = t.state::text;` → `ALTER TABLE tasks ALTER COLUMN column_id SET NOT NULL;` → FK constraint + new index (names as drizzle generated).
   4. Events: add `from_column_id`, `to_column_id` (nullable), `to_kind column_kind`; fill via joins on `legacy_state` (`to_kind` from the to-column's kind); `SET NOT NULL` on `to_kind`; FKs.
   5. Drop old index, `tasks.state`, `from_state`, `to_state`, `DROP TYPE task_state`, `ALTER TABLE board_columns DROP COLUMN legacy_state`.
2. Before migrating: `docker exec scout-db pg_dump -U scout scout > "<scratchpad>/pre-m6-backup.sql"` with scratchpad = `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/cc18d4f2-c0fc-4a54-a724-fb381e8e8496/scratchpad`. Report backup path + size.
3. `npm run db:migrate`. Verify with psql: task count unchanged; tasks per column name equal previous per-state counts (capture counts BEFORE migrating via `SELECT state, count(*) FROM tasks GROUP BY 1`); events count unchanged, no null `to_kind`.
4. `npm run db:generate` again → must report "No schema changes" (snapshot consistent). If not, fix.

## 6. API

- `GET /api/board` → include `columns`. Tasks carry `columnId`.
- `POST /api/columns` `{ name: trim 1..40, kind: enum }` → appended (max position + 1000). Returns `BoardColumn`.
- `PATCH /api/columns/:id` `{ name?, kind?, hidden?, position? }` (≥1 field). If `kind` changes: in one transaction update `completed_at` of the column's tasks via `kindAfterKindChange` semantics (SQL `UPDATE … SET completed_at = now()` where null for →done; `= NULL` for done→). Return `BoardColumn`.
- `DELETE /api/columns/:id?moveTo=<uuid>`: 404 unknown; 409 `Cannot delete the last column` if it's the only column; if column has tasks: `moveTo` required (400 `moveTo required`) and must be another existing column (400); in one transaction move tasks to end of target (positions after target's max, keep relative order), apply `transitionPatch` per task, insert events (`from_column_id` = deleted id before delete — then FK set null handles it); then delete column. 204.
- `POST /api/tasks`: body `columnId?: uuid` replaces `state`; default = first column by position with kind `open` and not hidden, else first column. 400 on unknown columnId. Event `{ fromColumnId: null, toColumnId, toKind }`. completedAt now if kind done.
- `POST /api/tasks/:id/move` body `{ columnId: uuid, position }` (400 unknown column). Uses new `transitionPatch`; event with `toKind`; hook payload `{ taskId, fromColumnId, toColumnId, toKind, at }`.
- `GET /api/tasks/:id/events` → new `StateEvent` shape.
- `GET /api/kpis` → loads columns, passes to `computeKpis`.
- `POST /api/ai/achievement-summary`: "done" = tasks whose column kind is `done` with completed_at in range (join board_columns). Adjust only the query.
- `server/utils/mappers.ts`: `toColumn(row)`; `toTask` uses `columnId`.

## 7. Seed (`server/db/seed.ts`)

- `--reset` truncates `board_columns` too (CASCADE order: events, checklist, task_tags, tasks, board_columns, tags, projects).
- Insert `DEFAULT_COLUMNS` first (positions 1000..5000), map old per-state logic to these column ids. Keep checklist seeding; ensure ≥ 3 open/active tasks have mixed done/undone sub-todos (so the card checklist is visible).
- Do NOT run the seed (lead does it).

## 8. Tests (`tests/unit/`)

Rewrite to the new API, same coverage:
- `domain.test.ts`: transitionPatch — same column → null; open→active; active→done sets now; done→open clears; done→other done column keeps original completedAt; done column A → done column B when completedAt null → now. `kindAfterKindChange` 3 cases. Position + dates tests unchanged.
- `kpi.test.ts`: columns fixture = DEFAULT_COLUMNS with ids + one extra hidden `open` column 'Icebox' (1 task). Port all existing cases (counts via byColumn/open/wip/done, overdue, cycle 14.3/8, weekly, aging (columnName), projects byKind + sort, scoped, empty, weeks) with exact assertions; add: hidden column still counted; task with unknown columnId counts as open.
- `makeTask` factory uses `columnId`.

## 9. Docs

`docs/ARCHITECTURE.md`: update Domain (columns + kinds, transition rules), Database, API table, KPI report shape. Remove state enum mentions. Short and precise.

## 10. Verify (report each)

- Backup + before/after counts (step 5).
- `npx vitest run` → all pass (list counts).
- Server/shared typecheck: `npx vue-tsc --noEmit -p .nuxt/tsconfig.server.json` (run `npx nuxi prepare` first). 0 errors. (`app/**` errors expected — don't fix, list count only.)
- Own dev server on port **3104** (background; kill after): `GET /api/board` → 5 columns, all tasks have columnId; create column `{name:"QA",kind:"active"}`; move a temp task into it and to Done (completedAt set) and back (null); PATCH QA kind→done → its tasks get completedAt; DELETE QA without moveTo while non-empty → 400; with moveTo=<Backlog id> → 204 and task moved; DELETE last column scenario not testable safely → skip; `GET /api/kpis` shape matches; events endpoint shape. Clean up temp task + QA column.
- `npm run db:generate` → no changes.
