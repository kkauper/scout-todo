# M6-A2 — Columns UI, click-to-open card, card sub-todo add

Executor: `executor` (sonnet). Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Prereq: M6-A1 done — backend uses `BoardColumn` + `Task.columnId` (read `shared/types/domain.ts`, `shared/utils/{transitions,kpi,kpi-summary}.ts`, `docs/ARCHITECTURE.md`, and the API routes under `server/api/columns`, `server/api/tasks`). M6-C done (theme, header, logo) — keep its header/Sheet changes in `index.vue` intact.
You own all of `app/**` EXCEPT: `app/assets/css/tailwind.css`, `app/components/common/{ScoutLogo,ColorModeToggle}.vue`, `app/components/ui/**`. In `app/pages/index.vue` only change what's needed for state→column (don't touch header layout/Sheet classes).
Goal: `npx nuxi typecheck` → 0 errors in the whole project at the end.
Dev server 3100 belongs to the lead (hot reload) — use it, don't kill it. Never delete/modify DB rows you didn't create; restore anything you change.

## 1. Store (`app/stores/board.ts`)

- State `columns: BoardColumn[]` (from `/api/board`). Computed `columnById`, `sortedColumns` (by position), `visibleColumns` (not hidden), `hiddenColumns`.
- `tasksByColumn(columnId)` replaces `tasksByState` (same filter/sort semantics).
- `moveTask(id, toColumnId, toIndex)`: optimistic using new `transitionPatch(task, fromKind, toColumn, now)`; POST `/api/tasks/:id/move { columnId, position }`.
- `createTask({ title, columnId?, projectId?, description?, deadline?, tagIds? })` → POST with `columnId`.
- Column actions (all through `run()`; `revision++`): `createColumn(name, kind)` (POST, push), `updateColumn(id, patch: { name?; kind?; hidden?; position? })` (optimistic merge; on kind change reload board after success because server adjusts completedAt), `deleteColumn(id, moveTo?: string)` (DELETE `/api/columns/:id?moveTo=…`, then `load()`), `moveColumn(id, direction: -1 | 1)` → swap with neighbour among `sortedColumns` using `positionBetween` of the neighbour's neighbours (single PATCH of `position`).
- Remove every `TaskState` usage.

## 2. Task dialog composable + dialog

- `useTaskDialog`: `state` → `columnId: string | null`; `openCreate(columnId?: string | null, title = '')`.
- `TaskDialog.vue`: create-mode Select lists `visibleColumns` (value = id, label = name, default = dialog.columnId ?? first visible open column ?? first visible). History list: `{from column name ?? 'created'} → {to column name ?? 'deleted column'} · date`, fall back to `COLUMN_KIND_LABELS[toKind]` in parentheses when the column is deleted.

## 3. Board

- `KanbanBoard.vue`: `BoardColumn v-for="c in store.visibleColumns" :column="c"`; after the last column an "add column" slot (w-72 shrink-0): ghost Button `+ Add column` → inline form (`Input` name autofocus + `Select` kind with `COLUMN_KIND_LABELS`, default `open` — show a one-line hint under the Select: Open = not started, Active = counts as WIP, Done = sets completion date) → Enter/"Add" creates; Esc cancels. Below it, when `hiddenColumns.length`: DropdownMenu trigger outline sm `Hidden columns ({n})` listing each with `Eye` icon → `updateColumn(id, { hidden: false })`.
- `BoardColumn.vue`: prop `column: BoardColumn` (replaces `state`). `data-column-id` on the `ul` (replace `data-state`; onEnd reads `evt.to.dataset.columnId`). Header: name (click → inline rename `Input`, Enter/blur saves, Esc cancels, stop propagation), small kind indicator (`Circle` open / `CircleDot` active / `CircleCheck` done icon, `aria-label` = kind label, Tooltip with label), count Badge, then header DropdownMenu (ghost icon `MoreHorizontal`, `aria-label="Column actions for {name}"`): Rename · Type ▸ (`DropdownMenuRadioGroup` open/active/done) · Move left (disabled if first visible) · Move right (disabled if last) · Hide (disabled if it's the last visible column) · separator · Delete… (disabled if it's the only column).
  Delete → `AlertDialog`: title `Delete column “{name}”?`; if column has tasks (count ALL tasks in column, not just filtered): text `It contains {n} tasks. Move them to:` + `Select` of other columns (required, default first other visible column); confirm button destructive "Delete column" → `deleteColumn(id, moveTo)`.
  Column `aria-labelledby` stays; header `h2` id `col-{column.id}`.
- `QuickAddTask.vue`: prop `columnId`; `openCreate(columnId, title)`.

## 4. Card: click opens detail

- `BoardColumn.vue` `<li>`: add `@click="onCardClick($event, t.id)"`: open edit dialog unless the click target is inside an interactive element: `(e.target as HTMLElement).closest('button, a, input, textarea, select, [role="checkbox"], [role="menuitem"], [data-no-open]')` → then return. Keep `@keydown.enter.self.prevent` and `@dblclick` (remove dblclick handler — click covers it).
- `TaskCard.vue` title: the title becomes plain text (not a button) so a click on it opens the dialog. Inline title edit moves to a small ghost icon Button (`Pencil`, `size-6`, `aria-label="Rename task"`, visible on `group-hover/card` / `group-focus-within/card`, else `opacity-0`) placed before the actions menu; it switches to the existing inline `Input` edit mode. Keep `data-no-drag` on the Input only.
- Bug (visible in screenshots): the hover-only "+ Project" chip uses `opacity-0` and still takes space, so cards without a project show a gap before the tag badges. Fix: render order = project badge (if any) → tag badges → then the hover-only chips "+ Project" (only when no project) and "+ Tag"/"+"; hover-only chips use `hidden group-hover/card:inline-flex group-focus-within/card:inline-flex` instead of opacity. The "+" after existing tags stays always visible but subtle (`text-muted-foreground`).
- Card root styling: `cursor-pointer` on the li (drag still works — native drag starts on movement).
- Move-to submenu: lists `visibleColumns` except current (`store.moveTask(task.id, c.id, store.tasksByColumn(c.id).length)`).
- Footer: `"{n}d in {column name}"` for non-done kinds; done kind shows `Done {date}`; overdue check uses kind (`deadline < today && kind !== 'done'`) — update `isOverdue` call sites: `shared/utils/dates.ts isOverdue` signature is owned by A1 — read what it is now and adapt callers.

## 5. Card sub-todos (`CardChecklist.vue`)

- Keep collapsed summary + expand. Inside the expanded list add a last row: small `Input` (`h-7 text-xs`, placeholder `Add sub-todo…`, `data-no-drag`) → Enter adds via `store.addChecklistItems(task.id, [title])`, clears, keeps focus.
- Expanded state persists per task in `useState('checklistOpen', () => ({} as Record<string, boolean>))` so it survives re-render/refresh of the list.
- Root keeps `data-no-open` (add it) so clicks inside never open the dialog.

## 6. KPI components

Adapt to new `KpiReport`: `KpiStateBar.vue` → iterate `counts.byColumn` (label = name, hidden columns suffixed ` (hidden)` in muted text); `ProjectBreakdown.vue` → stacked bar by `byKind` (open `bg-muted-foreground/40`, active `bg-[var(--swatch-blue)]`, done `bg-[var(--swatch-green)]`), aria-label from `COLUMN_KIND_LABELS`; `KpiPanel.vue` aging list shows `columnName`; section title "By column".

## 7. Verify (report each)

- `npx nuxi typecheck` → 0 errors (whole project).
- `npx vitest run` → pass.
- `npx nuxi build` → pass; re-apply `.output` xattr.
- Update e2e scripts in `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/cc18d4f2-c0fc-4a54-a724-fb381e8e8496/scratchpad/e2e/` to the new DOM (`ul[data-column-id=…]`, look up column ids by name via `/api/board`; server state checks use `columnId` → name; edit-dialog opening via Enter still; inline title edit via the Rename button; section selectors `section[aria-labelledby="col-<id>"]`). Run `smoke.mjs`, `ux.mjs`, `ai.mjs` → all pass; include outputs.
- New `columns.mjs`: add column "QA" (Active) via UI → appears before add-button; rename to "QA2" inline; move left; hide → disappears, "Hidden columns (1)" shows, unhide; create a task in it via quick add; delete column via UI choosing move target "Backlog" → task now in Backlog; single click on a card body opens the edit dialog; click on a tag badge does NOT open the dialog. Clean up everything created. Include output.
