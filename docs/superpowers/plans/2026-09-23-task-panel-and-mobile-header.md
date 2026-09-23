# Task Panel + Mobile Header Plan

**Goal:** (A) Header fits on phones (≥360px) with every control reachable. (B) Editing a task happens in a docked, non-modal side panel that autosaves, so the user can click through cards without closing anything. Creating a task stays a modal.

**Stack facts:** Nuxt 4.5, Vue 3.5 `<script setup lang="ts">`, shadcn-vue (reka-ui) components in `app/components/ui/**`, Tailwind v4 tokens, lucide icons from `@lucide/vue`, Pinia store `app/stores/board.ts`, auth via `nuxt-auth-utils` (`useUserSession()`). Components are auto-imported without path prefix. No component-test infra (Vitest is node-only, `tests/unit/**`) — verification is typecheck + browser.

**Global rules:** design tokens only (no hardcoded colors); every icon-only button has `aria-label`; keep existing keyboard paths working; no new dependencies.

---

## Task A: Mobile header + account menu

### A.1 `app/components/common/AccountMenu.vue` (new)
- `DropdownMenu` → trigger: `Button variant="ghost" size="icon" aria-label="Account"` with `CircleUser` icon.
- `DropdownMenuContent align="end" class="w-56"`:
  1. `DropdownMenuLabel` with `useUserSession().user.value?.name` (fallback text "Signed in"), `class="font-normal text-muted-foreground truncate"`.
  2. `DropdownMenuSeparator`.
  3. `DropdownMenuLabel` "Theme", then `DropdownMenuRadioGroup v-model="store"` with Light (`Sun`), Dark (`Moon`), System (`Monitor`, value `auto`) — move the logic from `app/components/common/ColorModeToggle.vue` verbatim (`useColorMode({ emitAuto: true })` from `@vueuse/core`).
  4. `DropdownMenuSeparator`.
  5. `DropdownMenuItem` "Sign out" with `LogOut` icon → `await useUserSession().clear(); await navigateTo('/login')` (move `onSignOut` from `app/pages/index.vue`).
- Delete `app/components/common/ColorModeToggle.vue` (only used in index.vue).

### A.2 Header in `app/pages/index.vue`
- Header classes: `px-3 sm:px-4 gap-2 sm:gap-3` (keep `h-14 flex items-center border-b bg-background/80 backdrop-blur`).
- Logo `h1`: add `shrink-0`.
- Project filter `SelectTrigger`: `class="min-w-0 flex-1 sm:flex-none sm:w-48"`.
- Spacer `<div class="flex-1" />` → `<div class="hidden sm:block flex-1" />`.
- "New task" button: keep icon; wrap text in `<span class="max-sm:sr-only">New task</span>`; add `class="shrink-0 max-sm:size-9 max-sm:px-0"`.
- "KPIs" button: same pattern (`<span class="max-sm:sr-only">KPIs</span>`, `shrink-0 max-sm:size-9 max-sm:px-0`).
- Replace `<ColorModeToggle />` + sign-out button with `<AccountMenu class="shrink-0" />` (if class passthrough doesn't reach the button, put `shrink-0` on the trigger inside AccountMenu).
- Remove now-unused imports (`LogOut`, `onSignOut`).

### A.3 Docs
`docs/ARCHITECTURE.md` screen-layout block + component map: header is now `Scout | Project filter | [+ Task] | [KPIs] | [Account menu: user, theme, sign out]`; ColorModeToggle row → AccountMenu.

### Acceptance A
- `pnpm run typecheck`, `pnpm run test` green.
- Browser at 360×740, 400×800 and 1280×800 (see "Browser verification" below): no horizontal overflow of the header (`document.querySelector('header').scrollWidth <= clientWidth`), all four controls visible and clickable; account menu opens, theme switch works, sign out goes to `/login`. Desktop still shows button labels.

---

## Task B: Docked task panel (edit) + create-only modal

### B.1 State: `app/composables/useTaskPanel.ts` (new)
```ts
export function useTaskPanel() {
  const taskId = useState<string | null>('taskPanel', () => null)
  function openTask(id: string) { taskId.value = id }
  function closeTask() { taskId.value = null }
  return { taskId, openTask, closeTask }
}
```

### B.2 `app/composables/useTaskDialog.ts` → create-only
Remove `mode`, `taskId`, `openEdit` from state/API. State: `{ open, columnId, title }`; API `{ dialog, openCreate, close }`.

### B.3 Callers
- `app/components/board/BoardColumn.vue`: replace `useTaskDialog().openEdit` with `useTaskPanel().openTask` (click handler line ~35 and `@keydown.enter` line ~180). On the `<li>`: add `:aria-current="taskId === t.id ? 'true' : undefined"` and class `aria-[current=true]:ring-2 aria-[current=true]:ring-primary` so the open card is highlighted.
- `app/components/board/TaskCard.vue:127` "Edit" menu item → `openTask(task.id)`. Rename its label to "Open".
- `QuickAddTask.vue`, `index.vue` keep `openCreate`.

### B.4 `app/components/task/TaskDialog.vue` → create-only
Delete the `Tabs` edit branch, `events`, `activeTab`, `currentTask`, `fromLabel/toLabel`, edit branch of `save()`. Title always "New task". Keep the create form exactly as now. Add `class="sm:max-w-xl"` to `DialogContent` (a bit wider). Keep Cancel/Save footer.

### B.5 `app/components/task/TaskPanel.vue` (new) — the edit UI
Props: none. Uses `useTaskPanel()`, `useBoardStore()`.

`const task = computed(() => taskId.value ? store.tasks.find(t => t.id === taskId.value) ?? null : null)`; if `taskId` is set but `task` becomes null (deleted) → `closeTask()` (watch).

**Layout** (root `<aside v-if="task" aria-labelledby="task-panel-title" class="…">`):
- `md` and up: `relative flex h-full w-[28rem] lg:w-[32rem] shrink-0 flex-col border-l bg-background`.
- below `md`: `fixed inset-0 z-50 flex flex-col bg-background` (full screen).
- Header row (`flex items-center gap-2 border-b px-4 h-12 shrink-0`): `h2#task-panel-title tabindex="-1" class="text-sm font-medium truncate outline-none"` showing column name + " · Task" (e.g. "In progress · Task"); save status `<span aria-live="polite" class="text-xs text-muted-foreground">` ("Saving…" while any save in flight, "Saved" for 2 s after); spacer; close `Button variant="ghost" size="icon" aria-label="Close task"` with `X` icon.
- Body `flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-6`, sections in this order, no tabs:
  1. Title: `Label` + `AiTitleSuggestions` row (as in old dialog), `Input id="task-title"`.
  2. Project + deadline row: `ProjectPicker`, `DeadlinePicker`.
  3. `TagPicker`.
  4. Description: `Label` + `AiDescriptionButton` row, `Textarea rows="6"`.
  5. `ChecklistEditor :task-id="task.id"` + `AiSubtaskSuggestions` (add → `store.addChecklistItems(task.id, titles)`).
  6. "Activity" section (`h3` text-sm font-medium): the Created / Last state change / Completed `dl` and events list, same markup and `fromLabel`/`toLabel` helpers as the old dialog. Events fetched via `store.fetchEvents(id)` whenever `taskId` changes and whenever `task.columnId` changes (moved while open).

**Autosave (no Save button):**
- Project, deadline, tags: bind `v-model` to computed get/set — get from `task.value`, set → `save({ projectId })` / `save({ deadline })` / `save({ tagIds })`.
- Title and description: local refs `titleDraft`, `descriptionDraft`, initialised from the task on open/switch. Also re-sync from the store when the task's stored value changes AND the field is not focused (inline card edits while panel open).
- Title commit on `blur` and on Enter: trimmed; if empty → revert draft to stored title, no save; if unchanged → no save; else `save({ title })`.
- Description commit on `blur`: `''` → `null`; save only if changed.
- AI title pick / AI description result: set the draft and commit immediately.
- `async function save(patch)`: increments `pending`, `await store.updateTask(id, patch)`, decrements, sets `savedAt = Date.now()`. Status text derives from `pending > 0` / `savedAt` within 2 s.
- **Flush on switch/close:** `watch(taskId, async (newId, oldId) => { if (oldId) await flushDrafts(oldId); …load new… })` where `flushDrafts(id)` commits title/description drafts against the OLD task id before drafts are re-initialised. Also flush in `onBeforeUnmount`. This guarantees clicking another card never loses typing.

**Keyboard / focus:**
- When `taskId` changes from null or to another id, `nextTick` → focus `#task-panel-title`.
- `Escape` inside the panel (`@keydown.esc` on `<aside>`, ignored if `event.defaultPrevented` — so open popovers/menus close first) → close.
- Close (button or Esc): remember the id, `closeTask()`, then `nextTick` → focus `li[data-task-id="<id>"]` if present.

### B.6 Mount in `app/pages/index.vue`
Inside `<div class="flex min-h-0 flex-1">` after `<main>`: `<TaskPanel />` (board shrinks; nothing covered on desktop). Opening KPIs closes the panel: `watch(kpiOpen, open => { if (open) closeTask() })`. `<TaskDialog />` stays for create.

### B.7 Docs
`docs/ARCHITECTURE.md`: replace the edit-dialog parts (Card click behavior, component map rows "Edit dialog sections", "Create/edit task") with: click/Enter opens docked `TaskPanel` (non-modal, autosave per field, Activity section, full-screen below md); `TaskDialog` is create-only.

### Acceptance B
- `pnpm run typecheck`, `pnpm run test` green.
- Browser at 1280×800:
  1. Click card A → panel opens right, board still visible & draggable, card A highlighted.
  2. Edit A's title, then click card B WITHOUT blurring first → panel shows B; A's new title persisted (reload page → still there).
  3. Change project/tag/deadline on B → "Saved" appears; reload → persisted.
  4. Activity section lists events; drag B to another column while open → activity updates.
  5. Esc closes panel and focus returns to the card; X button closes too.
  6. Opening KPIs closes the panel. "New task" opens the create modal; creating works.
  7. Delete the open task via its card menu → panel closes.
- Browser at 400×800: clicking a card opens full-screen panel; close returns to board.

---

## Browser verification (both tasks)
Dev server: `pnpm run dev` (if another dev server already runs, use its port — check `lsof -iTCP -sTCP:LISTEN | grep node`; don't kill servers you didn't start). Log in as `kai` / `ScoutTest123!` (local `.env`). Playwright browsers are cached in `~/Library/Caches/ms-playwright`; use `pnpm dlx playwright@<version matching cached chromium>` or a throwaway script in the scratchpad dir `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/35831f3b-97e9-4585-937c-9b73c7704110/scratchpad` — do NOT add playwright to package.json. Save screenshots there and list their paths in the report. If browser automation is impossible, say so explicitly and list which acceptance items are unverified.
