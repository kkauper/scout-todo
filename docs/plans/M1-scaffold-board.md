# M1-A — Scaffold + static Kanban board

Executor: `executor` (sonnet). Read `docs/ARCHITECTURE.md` first; it is binding.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path — has spaces, `~`, en-dash).
PROBE = `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/cc18d4f2-c0fc-4a54-a724-fb381e8e8496/scratchpad/probe` (verified working scaffold).

DO NOT touch: `CLAUDE.md`, `.claude/`, `docs/`, `docker-compose.yml`, `.env*` (other agent owns those).
DO NOT delete `node_modules`, `.nuxt`, `.output` dirs in root (carry iCloud xattr).

## Steps

1. Copy scaffold from PROBE into root: `package.json`, `nuxt.config.ts`, `tsconfig.json`, `components.json`, `.gitignore`, `public/`, `app/` (entire dir incl. `components/ui`, `lib/utils.ts`, `assets/css/tailwind.css`). Do NOT copy `node_modules`, `package-lock.json`, `README.md`, `init.log`, `add.log`, `.output`.
   In `package.json` set `"name": "scout"`.
2. `npm install` in root. Then:
   `npm i pinia @pinia/nuxt vue-draggable-plus @fontsource-variable/geist @internationalized/date`
   `npm i -D typescript vue-tsc`
   Verify root `node_modules` still has xattr: `xattr -p 'com.apple.fileprovider.ignore#P' node_modules` prints `1`.
3. `nuxt.config.ts` final content:
   ```ts
   import tailwindcss from '@tailwindcss/vite'

   export default defineNuxtConfig({
     compatibilityDate: '2025-07-15',
     devtools: { enabled: true },
     modules: ['shadcn-nuxt', '@pinia/nuxt'],
     css: ['~/assets/css/tailwind.css'],
     vite: { plugins: [tailwindcss()] },
     shadcn: { prefix: '', componentDir: '~/components/ui' },
     app: { head: { title: 'Scout' } },
   })
   ```
4. `app/assets/css/tailwind.css`:
   - Replace the first line `@import url('https://fonts.googleapis.com/...')` with `@import "@fontsource-variable/geist";` (offline requirement). Keep everything else.
   - Append swatch tokens (light in `:root`, dark in `.dark`, same values both):
     ```css
     :root {
       --swatch-slate: oklch(0.554 0.046 257.417);
       --swatch-red: oklch(0.637 0.237 25.331);
       --swatch-orange: oklch(0.705 0.213 47.604);
       --swatch-amber: oklch(0.769 0.188 70.08);
       --swatch-green: oklch(0.723 0.219 149.579);
       --swatch-teal: oklch(0.704 0.14 182.503);
       --swatch-blue: oklch(0.623 0.214 259.815);
       --swatch-indigo: oklch(0.585 0.233 277.117);
       --swatch-violet: oklch(0.606 0.25 292.717);
       --swatch-pink: oklch(0.656 0.241 354.308);
     }
     ```
     (Single `:root` block appended at end of file is enough; do not duplicate for `.dark`.)
5. `app/app.vue`: `<template><NuxtPage /></template>`
6. `shared/types/domain.ts`: exactly the DTO block from ARCHITECTURE.md §DTOs, with concrete values:
   `STATE_LABELS = { backlog: 'Backlog', todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done' }`, `OPEN_STATES = ['backlog','todo'] as const`, `WIP_STATES = ['in_progress','review'] as const` (typed `readonly TaskState[]`).
7. `shared/utils/transitions.ts`: `transitionPatch` per ARCHITECTURE.md §Transition rules. Import types relatively (`../types/domain`).
8. `shared/utils/position.ts`: `positionBetween`, `positionAtIndex` per §Ordering.
9. `shared/utils/dates.ts`: `localDateIso`, `daysBetween`, `isOverdue` per §Dates.
10. `app/utils/fixtures.ts`: export `fixtureBoard(): BoardData` — 3 projects (`Platform` blue, `Design System` violet, `Hiring` amber), 4 tags (`bug` red, `feature` green, `meeting` slate, `docs` teal), 12 tasks spread across all 5 states (≥1 per state, 2 unassigned, 2 with past deadline not done, 3 done with completedAt), ids via `crypto.randomUUID()`, timestamps relative to `new Date()` (created 1–30 days ago). Positions 1000, 2000, … per column.
11. `app/stores/board.ts` — `defineStore('board', () => {...})`:
    - state refs: `projects: Project[]`, `tags: Tag[]`, `tasks: Task[]`, `projectFilter: string | null | 'none'` (null), `loaded: boolean`.
    - computed `projectById: Map<string, Project>`, `tagById: Map<string, Tag>`, `visibleTasks` (apply filter: null all, `'none'` → projectId null, else equal).
    - `tasksByState(state: TaskState): Task[]` → visibleTasks filtered by state, sorted by position asc.
    - `load()`: M1 = assign `fixtureBoard()`; set `loaded = true`.
    - `moveTask(id, toState, toIndex)`: target list = `tasksByState(toState)` without task `id`; `position = positionAtIndex(list.map(t => t.position), toIndex)`; `patch = transitionPatch(task, toState, new Date())`; apply `position`, patch (if not null), `updatedAt`.
    - `createTask(input: { title: string; state: TaskState; projectId?: string | null })`: new Task at end of column (`positionBetween(last?.position ?? null, null)`), projectId defaults to current filter when filter is a uuid, else null. All timestamps now; `completedAt` now if state done.
    - `deleteTask(id)`.
    - Return all of the above.
12. `app/components/common/ColorBadge.vue`: props `{ label: string; color: ColorKey | null }`. Renders `<Badge variant="outline" class="gap-1.5 font-normal">` with leading `<span class="size-2 rounded-full" :style="{ background: color ? `var(--swatch-${color})` : 'var(--muted-foreground)' }" aria-hidden="true" />` then label.
13. `app/components/board/TaskCard.vue`: props `{ task: Task }`.
    - Root: `<Card role="listitem" tabindex="0" :data-task-id="task.id" class="cursor-grab gap-2 py-3 focus-visible:ring-2 focus-visible:ring-ring outline-none">`.
    - Header row: `CardTitle` (text-sm font-medium, line-clamp-2) + `DropdownMenu` trigger (ghost icon Button, `EllipsisVertical` icon from `@lucide/vue`, `aria-label="Task actions"`). Menu: `DropdownMenuSub` "Move to" listing all states except current (click → `store.moveTask(task.id, s, store.tasksByState(s).length)`), `DropdownMenuSeparator`, "Delete" (variant destructive) → `store.deleteTask(task.id)` (confirm dialog comes in M3; plain delete now).
    - `CardContent` (px-3 flex flex-wrap gap-1): project ColorBadge (if project), tag ColorBadges.
    - Footer line (text-xs text-muted-foreground flex gap-3): deadline if set — when `isOverdue(task, now)` show `<span class="text-destructive font-medium">Overdue · {deadline}</span>` with `AlertCircle` icon, else `Due {deadline}`; and `"{n}d in {STATE_LABELS[state]}"` where n = `Math.floor(daysBetween(task.stateChangedAt, now))` (hide for done; show `Done {localDateIso(new Date(completedAt))}` instead).
    - Adjust Card padding classes so card is compact (Card from reka-nova has `py-6 gap-6` defaults; override via class).
14. `app/components/board/QuickAddTask.vue`: props `{ state: TaskState }`. Collapsed: ghost Button "+ Add task" (full width, justify-start, text-muted-foreground). Expanded: `Input` autofocus, placeholder "Task title…", Enter → if trimmed non-empty `store.createTask({ title, state })`, clear input, stay open; Escape or blur with empty value → collapse. `aria-label="New task title in {label}"`.
15. `app/components/board/BoardColumn.vue`: props `{ state: TaskState }`.
    ```ts
    const items = ref<Task[]>([])
    watchEffect(() => { items.value = [...store.tasksByState(props.state)] })
    function onEnd(evt: SortableEvent) {
      const id = (evt.item as HTMLElement).dataset.taskId
      const to = (evt.to as HTMLElement).dataset.state as TaskState | undefined
      if (!id || !to || evt.newIndex == null) return
      store.moveTask(id, to, evt.newIndex)
    }
    ```
    (`SortableEvent` type import from `vue-draggable-plus`; `VueDraggable` component import from `vue-draggable-plus`.)
    Template: `<section :aria-labelledby="`col-${state}`" class="flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2">` → header `<h2 :id>` label + `Badge variant="secondary"` count (`items.length`) → `<VueDraggable v-model="items" group="tasks" :animation="150" tag="ul" role="list" :data-state="state" class="flex min-h-24 flex-1 flex-col gap-2" @end="onEnd">` with `<TaskCard v-for="t in items" :key="t.id" :task="t" />` → `<QuickAddTask :state="state" />`.
    If `data-state` does not land on the `ul` (check rendered HTML in step 19), wrap instead: put `:data-state` on VueDraggable via `v-bind="{ 'data-state': state }"`; report which worked.
16. `app/components/board/KanbanBoard.vue`: `<div class="flex h-full gap-4 overflow-x-auto p-4">` with `BoardColumn v-for="s in TASK_STATES"`.
17. `app/pages/index.vue`: on setup `const store = useBoardStore(); if (!store.loaded) store.load()`. Layout: `<div class="flex h-dvh flex-col">` header (`border-b px-4 h-14 flex items-center gap-3`: `<h1 class="font-semibold">Scout</h1>`, project filter `Select` with items "All projects" (value `__all`), "No project" (`__none`), each project (ColorBadge-like dot + name) — map `__all`→null, `__none`→'none'; spacer; Button "New task" (disabled placeholder, M3)) → `<main class="min-h-0 flex-1"><KanbanBoard /></main>`.
18. Components in subfolders auto-import with path prefix in Nuxt (`board/TaskCard.vue` → `BoardTaskCard`). To keep names short, add to `nuxt.config.ts`: `components: [{ path: '~/components', pathPrefix: false }]`. Verify no name clash with `ui/` components (shadcn-nuxt registers ui separately; if clash/duplicate warnings appear, instead use `components: [{ path: '~/components', pathPrefix: false, ignore: ['ui/**'] }]`).
19. Verify:
    - `npx nuxi typecheck` → 0 errors (fix only errors in files you created).
    - `npx nuxi build` → success.
    - Start `npx nuxi dev --port 3100` in background, `curl -s localhost:3100 | grep -c 'data-task-id'` ≥ 12, `curl -s localhost:3100 | grep -o 'data-state="[a-z_]*"' | sort -u` shows 5 states on list elements. Then kill dev server.
    - `grep -rn 'fonts.googleapis' app/` → no hits.

## Acceptance

- Single page renders 5 columns with counts and 12 fixture cards, project/tag badges with swatch dots, overdue text.
- Typecheck + build pass.
- `shared/` files have zero Nuxt auto-import usage (relative imports only).
