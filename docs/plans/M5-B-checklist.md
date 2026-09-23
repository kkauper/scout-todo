# M5-B — Sub-todos (checklist) end to end

Executor: `executor` (sonnet). `docs/ARCHITECTURE.md` binding.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Parallel agents: M5-C owns `server/api/ai/**`, `server/utils/ollama.ts`, `app/components/ai/**`, `app/composables/useAi.ts`. Another agent is fixing `app/components/board/BoardColumn.vue`, `TaskCard.vue`, `task/ProjectPicker.vue`, `task/TagPicker.vue` — do NOT edit those four files. Card integration of your `CardChecklist` happens later by another agent.
You own: `shared/types/domain.ts` (additions only), `server/db/schema.ts`, new migration, `server/utils/mappers.ts`, `server/api/board.get.ts`, `server/api/tasks/index.post.ts` (+ other task routes only where DTO mapping requires), new `server/api/tasks/[id]/checklist.post.ts`, `server/api/checklist/**`, `server/db/seed.ts`, `app/stores/board.ts`, `app/components/task/TaskDialog.vue`, new `app/components/task/ChecklistEditor.vue`, new `app/components/board/CardChecklist.vue`, `tests/unit/*.test.ts` (factory fix only).
Dev server runs on port 3100 (owned by lead; hot reloads). Don't start/kill it. Keep typescript ^6.0.3.

## Data

1. `shared/types/domain.ts`: add
   ```ts
   export interface ChecklistItem {
     id: string; taskId: string; title: string; done: boolean; position: number
     createdAt: string; completedAt: string | null
   }
   ```
   and field `checklist: ChecklistItem[]` on `Task` (sorted by position asc).
2. `server/db/schema.ts`: table `checklistItems` (`checklist_items`): `id uuid pk defaultRandom`, `task_id uuid notNull → tasks.id onDelete cascade`, `title text notNull`, `done boolean notNull default false`, `position double precision notNull default 1000`, `created_at timestamptz notNull defaultNow`, `completed_at timestamptz` nullable; index `(task_id, position)`. Relation tasks → many checklistItems.
3. `npm run db:generate` → new migration file; `npm run db:migrate`.
4. `server/utils/mappers.ts`: `toChecklistItem(row)`; `toTask(row, tagIds, checklist = [])`; `loadTaskDto` loads checklist too.
5. `server/api/board.get.ts`: one extra query for all checklist items (ordered task_id, position), grouped in memory — no N+1.

## API

6. `server/api/tasks/[id]/checklist.post.ts` body `{ titles: z.array(z.string().trim().min(1).max(200)).min(1).max(50) }` → appends items at end (position = max+1000, then +1000 each) in one transaction; 404 if task missing; returns `ChecklistItem[]` (the new items).
7. `server/api/checklist/[id].patch.ts` body `{ title?: trim 1..200, done?: boolean, position?: finite number }` (≥1 field else 400). `done` true → `completed_at = now` (only if it was false); false → null. Returns `ChecklistItem`. 404 missing.
8. `server/api/checklist/[id].delete.ts` → 204.
9. Every checklist mutation also bumps parent `tasks.updated_at`.

## Seed

10. `server/db/seed.ts`: add 2–5 checklist items to ~8 tasks (mix done/undone; done tasks all items done). Keep deterministic LCG. (Re-seeding is the user's choice — do NOT run `db:seed -- --reset`.)

## Store (`app/stores/board.ts`)

11. Actions (optimistic where noted, all via existing `run()` so `revision` bumps and errors reload):
    - `addChecklistItems(taskId, titles: string[])` → POST; append results to task.checklist.
    - `updateChecklistItem(taskId, itemId, patch: { title?; done?; position? })` → optimistic (set done/completedAt locally), PATCH, replace item.
    - `deleteChecklistItem(taskId, itemId)` → optimistic remove, DELETE.

## UI

12. shadcn checkbox: `CI=1 npx shadcn-vue@latest add checkbox -y < /dev/null` (writes `app/components/ui/checkbox/**`).
13. `app/components/task/ChecklistEditor.vue`:
    - props `{ taskId: string | null; draft?: string[] }`; when `taskId` set → reads `store.tasks` item's checklist and calls store actions directly; when `taskId` null (create mode) → edits `v-model:draft` string array (added after task creation by TaskDialog).
    - UI: `ul` of rows: `Checkbox` (`:model-value="item.done"`, `@update:model-value`, `:aria-label="`Done: ${item.title}`"`; hidden in draft mode), title as inline `Input` (borderless, `h-7`, blur/Enter saves if changed), ghost icon Button `X` `aria-label="Remove {title}"`. Below: `Input` placeholder "Add sub-todo…" — Enter adds (edit mode: `addChecklistItems(taskId,[title])`; draft: push).
    - Header line: "Sub-todos" + `{done}/{total}`.
14. `app/components/task/TaskDialog.vue`: add section "Sub-todos" (between Description and History; in create mode inside "More details"): `<ChecklistEditor :task-id="mode==='edit' ? taskId : null" v-model:draft="draftChecklist" />`. On create save: after `createTask` returns, if `draftChecklist.length` → `store.addChecklistItems(result.id, draftChecklist)`. Reset draft on open.
15. `app/components/board/CardChecklist.vue` — props `{ task: Task }`; render nothing when `task.checklist.length === 0`.
    - Collapsed: `<button type="button" data-no-drag :aria-expanded="open" :aria-label="`Sub-todos ${done} of ${total}, ${open ? 'collapse' : 'expand'}`" class="flex w-full items-center gap-2 text-xs text-muted-foreground">` → `ListChecks` icon, `{done}/{total}`, `Progress :model-value="done/total*100" class="h-1 flex-1"`, chevron icon rotating.
    - Expanded: `ul` of rows with `Checkbox` + label (`line-through text-muted-foreground` when done) — toggling calls `store.updateChecklistItem`. Entire expanded area `data-no-drag`. Use `@click.stop`/`@dblclick.stop`/`@keydown.enter.stop` on the component root so card handlers (open dialog) don't fire.
    - Open state local ref (default false).

## Tests

16. If `tests/unit/*.test.ts` `makeTask` factories fail typecheck/run because `Task.checklist` is required, add `checklist: []` default there. Nothing else in tests.

## Verify (report each)

- `npx nuxi typecheck` → 0 errors in your files (errors in the four files owned by the other agent: report only).
- `npx vitest run` → all pass.
- curl against running dev server `localhost:3100` (if it isn't responding, start your own on port 3102 and kill it after): create temp task → POST checklist `{"titles":["a","b"]}` → 2 items; PATCH item done true → completedAt set; PATCH done false → null; GET /api/board → task has checklist 2 items sorted; DELETE item → 204; POST checklist to unknown task → 404; `{"titles":[]}` → 400. Delete temp task.
- `npx nuxi build` → pass; re-apply `.output` xattr.
