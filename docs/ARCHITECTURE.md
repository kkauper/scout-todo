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
  components/task/*.vue        TaskDialog, ProjectPicker, TagPicker, DeadlinePicker
  components/kpi/*.vue         KpiPanel, KpiStat, KpiStateBar, ThroughputBars
  components/common/*.vue      ColorBadge, ColorPicker
  stores/board.ts              Pinia store
  lib/utils.ts                 shadcn `cn()`
shared/                        imported by app AND server (Nuxt 4 `#shared` alias)
  types/domain.ts              states, colors, DTOs
  utils/transitions.ts         state transition patch logic
  utils/position.ts            fractional ordering
  utils/dates.ts               day math, overdue
  utils/kpi.ts                 KPI computation (pure)
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
export interface Task {
  id: string; title: string; description: string | null
  projectId: string | null; columnId: string; position: number
  deadline: string | null
  createdAt: string; updatedAt: string; stateChangedAt: string; completedAt: string | null
  tagIds: string[]
}
export interface StateEvent { taskId: string; fromColumnId: string | null; toColumnId: string | null; toKind: ColumnKind; changedAt: string }
// fromColumnId/toColumnId null when that column was later deleted (FK ON DELETE SET NULL).
export interface BoardData { projects: Project[]; tags: Tag[]; tasks: Task[]; columns: BoardColumn[] }
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

`computeKpis(tasks: Task[], projects: Project[], columns: BoardColumn[], now: Date, opts?: { projectId?: string | null | 'none'; weeks?: number /*default 8*/ }): KpiReport`
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
    weekly: { weekStart: string; count: number }[]   // last `weeks` ISO weeks (Mon start, local), oldest first, includes current week
    last30Days: number
    thisMonth: number
  }
  aging: {
    wipAvgDays: number | null                        // avg days since stateChangedAt over kind-active tasks
    oldest: { taskId: string; title: string; columnName: string; days: number }[]  // top 5 kind non-done by days in column, desc
  }
  projects: { projectId: string | null; name: string; color: ColorKey | null; byKind: Record<ColumnKind, number>; total: number }[]
  // global only (empty array when scoped). Unassigned row: projectId null, name 'No project', color null. Sorted by total desc.
}
```
Round day values to 1 decimal. Median of even sample = mean of middle two.

## Database (Drizzle, `server/db/schema.ts`)

- `pgEnum('column_kind', COLUMN_KINDS)`
- `projects`: `id uuid pk defaultRandom`, `name text notNull unique`, `color text notNull default 'blue'`, `created_at timestamptz notNull defaultNow`, `updated_at timestamptz notNull defaultNow`
- `tags`: `id uuid pk defaultRandom`, `name text notNull unique`, `color text notNull default 'slate'`, `created_at timestamptz notNull defaultNow`
- `board_columns`: `id uuid pk defaultRandom`, `name text notNull`, `kind column_kind notNull`, `position double precision notNull default 1000`, `hidden boolean notNull default false`, `created_at timestamptz notNull defaultNow`, `updated_at timestamptz notNull defaultNow`
- `tasks`: `id uuid pk defaultRandom`, `title text notNull`, `description text`, `project_id uuid references projects.id onDelete set null`, `column_id uuid notNull references board_columns.id onDelete restrict`, `position double precision notNull default 1000`, `deadline date (mode 'string')`, `created_at`, `updated_at`, `state_changed_at` (all timestamptz notNull defaultNow), `completed_at timestamptz`
  - indexes: `(column_id, position)`, `(project_id)`, `(completed_at)`
- `task_tags`: `task_id` → tasks cascade, `tag_id` → tags cascade, composite pk
- `task_state_events`: `id uuid pk`, `task_id` → tasks cascade, `from_column_id uuid` → board_columns onDelete set null (nullable), `to_column_id uuid` → board_columns onDelete set null (nullable), `to_kind column_kind notNull`, `changed_at timestamptz notNull defaultNow`; index `(task_id, changed_at)`
  - Row written on create (from null) and on every column change (move, or column deletion moving its tasks). `to_kind` is the kind of the destination column at the time of the event, kept even if that column is later deleted (columns become null via FK, `to_kind` does not). Source for history/audit + future analytics.

Deleting a column with tasks in it requires `moveTo` another column; deleting a column that ends up referenced by past events sets the corresponding `from_column_id`/`to_column_id` to null (`ON DELETE SET NULL`) — history is preserved, just anonymized on the deleted column's identity. `tasks.column_id` itself uses `ON DELETE RESTRICT`: a column can only be deleted once it has no tasks left (the API enforces the `moveTo` step before deleting).

All timestamptz columns use `{ withTimezone: true, mode: 'date' }`; mappers convert to ISO.

## API (Nitro, `server/api`)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/api/board` | — | `BoardData` (includes `columns`) |
| POST | `/api/projects` | `{ name, color? }` | `Project` (409 on duplicate name) |
| PATCH | `/api/projects/:id` | `{ name?, color? }` | `Project` |
| DELETE | `/api/projects/:id` | — | 204 (tasks → unassigned) |
| POST | `/api/tags` | `{ name, color? }` | `Tag` (409 dup) |
| PATCH | `/api/tags/:id` | `{ name?, color? }` | `Tag` |
| DELETE | `/api/tags/:id` | — | 204 |
| POST | `/api/columns` | `{ name (1..40), kind }` | `BoardColumn` (appended, position = max + 1000) |
| PATCH | `/api/columns/:id` | `{ name?, kind?, hidden?, position? }` (≥1 field) | `BoardColumn` (kind change recomputes the column's tasks' `completed_at` via `kindAfterKindChange` semantics, one transaction) |
| DELETE | `/api/columns/:id` | `?moveTo=<uuid>` | 204. 404 unknown id; 409 "Cannot delete the last column"; if column has tasks: `moveTo` required (400) and must be another existing column (400) — tasks are moved to the end of the target (positions after its max, relative order kept), `transitionPatch` applied per task, events written (one transaction) |
| POST | `/api/tasks` | `{ title, description?, projectId?, columnId?, deadline?, tagIds? }` | `Task` (position = end of column; `columnId` defaults to the first non-hidden `open` column, else the first column; 400 on unknown `columnId`) |
| PATCH | `/api/tasks/:id` | `{ title?, description?, projectId?, deadline?, tagIds? }` | `Task` (no column move here) |
| POST | `/api/tasks/:id/move` | `{ columnId, position }` | `Task` (400 unknown `columnId`; applies `transitionPatch`, writes event in same transaction) |
| DELETE | `/api/tasks/:id` | — | 204 |
| GET | `/api/tasks/:id/events` | — | `StateEvent[]` asc |
| GET | `/api/kpis` | `?projectId=<uuid>|none` | `KpiReport` |

Validation errors → 400 via zod. Unknown id → 404. `updated_at` set on every mutation.
Analytics hook: server emits `useNitroApp().hooks.callHook('scout:task-moved', { taskId, fromColumnId, toColumnId, toKind, at })` after move; plugin `server/plugins/analytics.ts` logs in dev. Extensible later.

## Frontend

### Store `app/stores/board.ts` (`useBoardStore`, setup style)

State: `projects`, `tags`, `tasks`, `columns: BoardColumn[]`, `projectFilter: string | null | 'none'` (null = all), `loaded`.
Getters: `projectById`, `tagById`, `columnById` (Map lookups); `sortedColumns` (by position, includes hidden), `visibleColumns` (not hidden), `hiddenColumns`; `visibleTasks`; `tasksByColumn(columnId)` (filtered by `visibleTasks`, sorted by position).
Actions: `load()`, `createTask({ title, columnId?, projectId?, description?, deadline?, tagIds? })`, `updateTask`, `moveTask(id, toColumnId, toIndex)` (resolves `fromKind` from the task's current column, applies `transitionPatch`), `deleteTask`, `createProject`, `createTag`, `addChecklistItems`/`updateChecklistItem`/`deleteChecklistItem`, `fetchEvents`.
Column actions (all through the shared `run()` optimistic-then-reconcile wrapper, bump `revision`): `createColumn(name, kind)`, `updateColumn(id, patch: { name?; kind?; hidden?; position? })` (optimistic merge; reloads the whole board after a successful `kind` change since the server recomputes affected tasks' `completedAt`), `deleteColumn(id, moveTo?)` (always reloads the board after), `moveColumn(id, direction: -1 | 1)` (swaps with the neighbour in `sortedColumns` via a single `position` PATCH computed with `positionBetween` of the neighbour's neighbours).
Mutations optimistic: apply locally (using `shared/` logic), call API, replace with server DTO; on error reload board and surface error.

### Screen layout (`pages/index.vue`)

```
┌ Header: "Scout" | Project filter (Select) | [+ Task] | [KPIs toggle] ┐
├ Board: user-managed columns, horizontal scroll ───┬ KPI panel (Sheet, right) ┤
│ [Column header: kind icon, label, count Badge,    │  scope follows project filter        │
│  actions DropdownMenu]                            │                                      │
│ TaskCards (draggable, click opens edit dialog)    │                                      │
│ + Add task (inline input)                         │                                      │
│ … + Add column / Hidden columns (n) ──────────────┘                                      │
└───────────────────────────────────────────────────┴──────────────────────────────────────┘
```

Columns themselves are rendered by `KanbanBoard.vue` from `store.visibleColumns`; after the last column sits an "add column" widget (ghost button → inline name + kind form) and, when any columns are hidden, a "Hidden columns (n)" `DropdownMenu` to unhide them.

### shadcn-vue component map

| UI pattern | Component(s) |
|---|---|
| Task card | `Card`, `CardHeader`, `CardTitle`, `CardContent` |
| Project label, tag chips | `Badge variant="outline"` wrapped in `common/ColorBadge` (color dot via `--swatch-*`) |
| Column count | `Badge variant="secondary"` |
| Column kind indicator | `Circle`/`CircleDot`/`CircleCheck` (lucide) + `Tooltip`, `aria-label` = kind label |
| Column actions (rename, type, move, hide, delete) | `DropdownMenu` + `DropdownMenuSub` › `DropdownMenuRadioGroup` for "Type" |
| Task actions (edit, move to…, delete) | `DropdownMenu` + `DropdownMenuSub` for "Move to" (keyboard alternative to drag) |
| Delete confirm (task or column) | `AlertDialog`; column delete shows a `Select` of other columns when it still has tasks |
| Create/edit task (expanded) | `Dialog` + `Input`, `Textarea`, `Label`, `Button`, `Select` (create-mode column picker) |
| Inline quick-add | `Input` + `Button` inside column |
| Project / tag pick + inline create | `Popover` + `Command` (combobox; "Create “xyz”" item when no exact match) |
| Color choice on inline create | `common/ColorPicker` (radio group of swatch buttons) |
| Deadline | `Popover` + `Calendar` (`@internationalized/date`, CalendarDate ↔ `YYYY-MM-DD`) |
| Project filter | `Select` |
| KPI panel | `Sheet`, `Card`, `Progress`, `Separator`, `Tooltip` |
| Scroll areas | column `ul` scrolls itself (native overflow) |

### Card click behavior

The task `<li>` has a single `click` handler (`BoardColumn.vue`'s `onCardClick`): it opens the edit dialog unless `event.target` is inside an interactive element — `closest('button, a, input, textarea, select, [role="checkbox"], [role="menuitem"], [data-no-open]')` — in which case it returns early and lets that element's own handler run (project/tag pickers, the rename button, the actions menu, checklist controls). `dblclick` is not used any more; dragging still starts on pointer movement (SortableJS) independent of the click handler. `CardChecklist`'s root carries `data-no-open` so any click inside the sub-todo list (toggle, add-row) never opens the dialog. Keyboard: the `<li>` is focusable and `Enter` opens the edit dialog via `@keydown.enter.self.prevent`.

Card title is plain text (not a button); renaming happens via a small ghost `Pencil` icon button (visible on card hover/focus-within) that switches to an inline `Input`. The project/tag "add" affordances are hover-only chips positioned *after* the real badges (via flex `order-*` utilities) using `hidden …:inline-flex` rather than `opacity-0`, so an empty state doesn't reserve visual space before the badges.

### Accessibility

- Column: `<section aria-labelledby>` pointing at the column's `h2#col-{id}`; list `role="list"`, card `role="listitem"`.
- Every drag action has a keyboard path via the card's DropdownMenu "Move to" (lists `visibleColumns` except the current one) and the column's DropdownMenu "Move left"/"Move right".
- Card focusable (`tabindex="0"`), Enter opens edit dialog; click anywhere on the card body (see above) does the same.
- Color never sole carrier of meaning: badges always show text; overdue shows text "Overdue" + icon; column kind icon always pairs with a `Tooltip` + `aria-label` text.

## Sub-todos (checklist)

- Table `checklist_items` (`id`, `task_id` → tasks cascade, `title`, `done`, `position`, `created_at`, `completed_at`); index `(task_id, position)`.
- DTO `ChecklistItem`; embedded as `Task.checklist` (sorted by position), loaded in `/api/board` with one query.
- API: `POST /api/tasks/:id/checklist { titles[] }`, `PATCH /api/checklist/:id { title?, done?, position? }`, `DELETE /api/checklist/:id`. Mutations bump parent `tasks.updated_at`.
- UI: `board/CardChecklist` (progress `n/m` + expandable checkbox list on card), `task/ChecklistEditor` (dialog; draft mode before task exists).

## Local AI (Ollama)

- Optional. Config `OLLAMA_URL` (default `http://127.0.0.1:11434`), `OLLAMA_MODEL` (default `qwen3:8b`).
- `server/utils/ollama.ts` (status + non-streaming chat, `think: false`, 90 s timeout, 503 when offline), `server/utils/ai-prompts.ts` (pure prompt builders; forbid invented facts/metrics; answer in input language).
- Routes `server/api/ai/`: `status.get`, `improve-title.post`, `draft-description.post`, `suggest-subtasks.post`, `achievement-summary.post` (done tasks in date range → manager-ready Markdown).
- UI `app/components/ai/*` + `useAi()`; buttons disabled with reason tooltip when AI not ready.

## UX decisions (M5)

- KPIs in right `Sheet` drawer (`sm:max-w-3xl`, overlay `bg-black/60`), closed by default.
- Card: inline title edit (click title), inline project/tag pickers (picker trigger slot), `data-no-drag` on every interactive child (Sortable `filter`).
- Columns scroll individually (list `ul` is the scroll container); page never scrolls.
- Global `cursor: pointer` for interactive elements (Tailwind v4 dropped it for buttons).

## Extensibility notes

Time tracking → new `time_entries` table keyed on task. Dependencies → `task_links`. Team → `owner_id` columns. Event table already supports history/timeline views.
