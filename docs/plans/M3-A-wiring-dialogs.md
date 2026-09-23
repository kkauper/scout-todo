# M3-A — Wire board to API, quick-create flows, task dialog

Executor: `executor` (sonnet). `docs/ARCHITECTURE.md` binding (§Frontend, §shadcn-vue component map, §Accessibility).
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Prereq: M1 (board, store with fixtures) + M2 (API live, DB seeded). Parallel agent M3-B owns `app/components/kpi/**`, `app/composables/useKpis.ts`, `shared/utils/kpi-summary.ts` — do NOT create/edit those. Your only touchpoint: render `<KpiPanel />` (no props) in layout; if it doesn't exist yet at verify time, create NOTHING for it — report it.
DO NOT touch `server/**`, `shared/utils/kpi.ts`, `docs/`, `CLAUDE.md`, `.claude/`. Keep `typescript` pinned ^6.0.3.

## Contract for M3-B (must implement exactly)

Store exposes `revision: Ref<number>` — incremented after every successful server mutation (task create/update/move/delete, project/tag create). KPI panel watches it.

## Steps

1. `app/stores/board.ts` → API-backed. Remove fixture usage; delete `app/utils/fixtures.ts`.
   - Add `revision = ref(0)`, `lastError = ref<string | null>(null)`.
   - `async load()`: `const data = await $fetch<BoardData>('/api/board')`; assign; `loaded = true`.
   - Helper `async function run<T>(fn: () => Promise<T>): Promise<T | undefined>`: try → result, `revision.value++`; catch → `lastError.value = message` (use `e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Request failed'`), `await load()`, return undefined. Exception: create project/tag rethrow on 409 so picker can show "already exists" (see step 4/5).
   - Helper `upsertTask(t: Task)` replace by id or push.
   - `moveTask(id, toState, toIndex)`: compute position + patch locally exactly as now (optimistic), then `run(() => $fetch<Task>(`/api/tasks/${id}/move`, { method: 'POST', body: { state: toState, position } }))` → upsertTask(result).
   - `createTask(input: { title: string; state: TaskState; projectId?: string | null; description?: string | null; deadline?: string | null; tagIds?: string[] })`: projectId default logic as now; POST `/api/tasks`; upsertTask(result); return result. (No optimistic insert — needs server id.)
   - `updateTask(id, patch: { title?; description?; projectId?; deadline?; tagIds? })`: optimistic merge, PATCH, upsertTask(result).
   - `deleteTask(id)`: optimistic remove, DELETE.
   - `createProject(name: string, color?: ColorKey): Promise<Project>` — POST, push, `revision++`, return. Default color when omitted: `COLOR_KEYS[projects.value.length % COLOR_KEYS.length]`. On error: set nothing, rethrow (caller shows message).
   - `createTag(name, color?)`: same pattern, default color `COLOR_KEYS[(tags.value.length + 3) % COLOR_KEYS.length]`.
   - `fetchEvents(id): Promise<StateEvent[]>` → GET `/api/tasks/${id}/events`.
   - Return new members.
2. `app/pages/index.vue`: replace `if (!store.loaded) store.load()` with `await callOnce('board', () => store.load())` (top-level await in script setup). Layout becomes:
   ```
   <div class="flex h-dvh flex-col">
     header (existing) + right side: "New task" Button (enabled, `Plus` icon) → openCreate('backlog'); KPI toggle Button variant="outline" (`ChartColumn` icon, text "KPIs", `:aria-expanded="kpiOpen"`, `aria-controls="kpi-panel"`)
     lastError banner (if store.lastError): `<div role="alert" class="bg-destructive/10 text-destructive text-sm px-4 py-2 flex justify-between">` message + ghost "Dismiss" button → null
     <div class="flex min-h-0 flex-1">
       <main class="min-w-0 flex-1"><KanbanBoard /></main>
       <Collapsible v-model:open="kpiOpen"><CollapsibleContent as-child><aside id="kpi-panel" aria-label="KPIs" class="w-80 shrink-0 overflow-y-auto border-l"><KpiPanel /></aside></CollapsibleContent></Collapsible>
     </div>
     <TaskDialog />
   </div>
   ```
   `kpiOpen = useState('kpiOpen', () => true)`.
3. `app/composables/useTaskDialog.ts`: `useState('taskDialog', () => ({ open: false, mode: 'create' as 'create' | 'edit', taskId: null as string | null, state: 'backlog' as TaskState }))`; export `useTaskDialog()` returning `{ dialog, openCreate(state: TaskState), openEdit(taskId: string), close() }`.
4. `app/components/task/CommandCreateItem.vue` — "Create …" entry inside a `Command`:
   - props `{ label: string /* 'project' | 'tag' */; existing: string[] }`, emits `create(name: string)`.
   - `const { filterState } = useCommand()` (import from `@/components/ui/command`). `const term = computed(() => filterState.search.trim())`. `show = term !== '' && !existing.some(n => n.toLowerCase() === term.toLowerCase())`.
   - Render `<CommandItem v-if="show" :key="term" :value="`__create__${term}`" @select="emit('create', term)">` with `Plus` icon + `Create {{ label }} “{{ term }}”`.
   - **`:key="term"` is mandatory**: CommandItem registers its text once at mount; remount per term keeps it visible under filtering.
5. `app/components/task/ProjectPicker.vue`: `v-model` = `string | null`.
   - `Popover` → trigger `Button variant="outline" size="sm"` showing ColorBadge-style dot + project name or "No project"; `aria-label="Project"`.
   - `PopoverContent class="p-0 w-60"` → `Command` → `CommandInput placeholder="Search or create…"` → `CommandList` → `CommandEmpty` "No projects." → `CommandGroup`: item "No project" (value `__none`), each project (dot + name, `Check` icon when selected) → `CommandCreateItem label="project" :existing="projects names" @create="onCreate"`.
   - Select → set model, close popover. `onCreate(name)`: `try { const p = await store.createProject(name); model = p.id; close } catch (e) { errorText = statusCode 409 ? 'Project already exists' : 'Could not create project' }`; show `errorText` as `<p class="px-2 py-1 text-xs text-destructive" role="alert">` inside popover.
6. `app/components/task/TagPicker.vue`: `v-model` = `string[]`. Same structure; multi-select: selecting toggles id in array, popover stays open; checked items show `Check` icon; trigger shows selected ColorBadges (or "Add tags"). Create → createTag → append id. `aria-label="Tags"`.
7. `app/components/task/DeadlinePicker.vue`: `v-model` = `string | null` (YYYY-MM-DD).
   - Popover trigger Button outline sm with `CalendarDays` icon + value or "No deadline"; `aria-label="Deadline"`.
   - Content: `Calendar` with `:model-value="value ? parseDate(value) : undefined"`, `@update:model-value="(d) => { model = d ? d.toString() : null; open = false }"`, `initial-focus`. Below: ghost Button "Clear" (only when value) → null.
   - `parseDate` from `@internationalized/date`.
8. `app/components/task/TaskDialog.vue` — single instance, driven by `useTaskDialog()`.
   - `Dialog v-model:open`. Title "New task" / "Edit task". `DialogDescription` sr-only.
   - Local form state reset whenever dialog opens (watch `dialog.open`): create → defaults (projectId from store filter if uuid, else null; state = dialog.state); edit → copy from task.
   - Fields: `Label`+`Input` Title (required, autofocus, `maxlength=200`); row with `ProjectPicker` + `DeadlinePicker`; `TagPicker`. Create mode: `Select` State (all states). Description `Textarea` (rows 4).
     Create mode: description + tags + deadline hidden behind ghost Button "More details" (`aria-expanded`) — minimal by default. Edit mode: all visible.
   - Edit mode only: section "History" (`Separator` above): `dl` grid with Created, Last state change, Completed (if any) formatted `toLocaleString()`; then event list from `store.fetchEvents(id)` loaded on open: `"{from ?? 'created'} → {to} · {date}"` using STATE_LABELS.
   - Footer: Cancel (outline) + Save (submit). `<form @submit.prevent="save">`. Save disabled when title trimmed empty. create → `store.createTask({...})`; edit → `store.updateTask(id, {...})` (only changed fields ok to send all). Close on success.
9. `app/components/board/TaskCard.vue`:
   - Card `@keydown.enter.self="openEdit(task.id)"` and `@dblclick="openEdit(task.id)"`; add DropdownMenu item "Edit" (first) → openEdit.
   - Delete: DropdownMenu item opens `AlertDialog` (controlled `confirmOpen` ref; open via `@select` after menu closes — use `@select="() => nextTick(() => (confirmOpen = true))"`). AlertDialog: title "Delete task?", description = task title, Cancel / Action "Delete" (destructive styling) → `store.deleteTask`.
   - Card title `aria-label` not needed; add `:aria-label="`${task.title}, ${STATE_LABELS[task.state]}`"` on Card root.
   - Replace `const now = new Date()` with `const now = useNow({ interval: 60_000 })` from `@vueuse/core` and use `now.value` in computeds (aging stays fresh).
10. `app/components/board/QuickAddTask.vue`: `store.createTask` now async — `await`; keep input open for next entry. Add small ghost icon Button (`Maximize2`, `aria-label="Open full form"`) next to input → `openCreate(state)` with typed title carried: extend `useTaskDialog` state with `title: string` prefill (openCreate(state, title = '')).
11. Verify (report each):
    - `npx nuxi typecheck` → 0 errors (errors in M3-B files: report only).
    - `npx nuxi build` → pass; re-apply `.output` xattr (`xattr -w 'com.apple.fileprovider.ignore#P' 1 .output`).
    - dev server `--port 3100` backgrounded: `curl -s localhost:3100 | grep -o 'data-task-id' | wc -l` equals task count from `curl -s localhost:3100/api/board` (all projects filter). Kill server.
    - `grep -rn fixtures app/` → no hits.

## Acceptance

- Board loads from DB (SSR via callOnce), all mutations persist (reload shows same state).
- Project/tag creation inline from pickers; no separate admin screens.
- Every card action reachable by keyboard (Enter = edit, menu = move/delete).
