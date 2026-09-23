# M5-A — Board UX: cursor, scrolling, inline edit, inline pickers, KPI drawer

Executor: `executor` (sonnet). `docs/ARCHITECTURE.md` binding.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
You own: `app/assets/css/tailwind.css`, `app/pages/index.vue`, `app/components/board/{KanbanBoard,BoardColumn,TaskCard,QuickAddTask}.vue`, `app/components/task/{ProjectPicker,TagPicker}.vue`, `app/components/kpi/{KpiPanel,ProjectBreakdown}.vue`, `app/components/ui/sheet/SheetOverlay.vue`.
Parallel agents own: store (`app/stores/board.ts`), `TaskDialog.vue`, `ChecklistEditor.vue`, `CardChecklist.vue`, server, `app/components/ai/**` — do not edit. `Task` type may gain a `checklist` field during your run — irrelevant to you.
shadcn `sheet` + `checkbox` already installed. Dev server on 3100 is the lead's (hot reload) — don't start/kill it. Keep typescript ^6.0.3.

## Steps

1. **Pointer cursor** — `app/assets/css/tailwind.css` append:
   ```css
   @layer base {
     button:not(:disabled),
     [role="button"]:not([aria-disabled="true"]),
     [role="menuitem"],
     [role="menuitemradio"],
     [role="option"],
     [role="checkbox"],
     [role="tab"],
     label[for],
     select {
       cursor: pointer;
     }
   }
   ```
2. **Column scrolling** (bug: long columns overflow container, "+ Add task" overlaps cards, page gets extra space):
   - `index.vue`: board `<main>` → `class="min-h-0 min-w-0 flex-1 overflow-hidden"`; outer page `h-dvh overflow-hidden`.
   - `KanbanBoard.vue` root: `class="flex h-full items-stretch gap-4 overflow-x-auto overflow-y-hidden p-4"`.
   - `BoardColumn.vue` section: `class="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-xl bg-muted/50"`; header `shrink-0 px-3 pt-3 pb-2`; VueDraggable `ul`: `class="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-2"` (scroll container = list itself, keeps Sortable autoscroll working); QuickAddTask wrapper `div.shrink-0.px-2.pb-2`.
   - Cards must not shrink: li `class="list-none shrink-0"`.
3. **Inline title edit** — `TaskCard.vue`:
   - Title display becomes `<button type="button" data-no-drag class="cursor-text text-left text-sm font-medium line-clamp-2 rounded-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring outline-none" :aria-label="`Edit title: ${task.title}`" @click.stop="startEdit" @dblclick.stop>` inside `CardTitle`.
   - Edit mode: `Input` (`h-7 text-sm`, `data-no-drag`, autofocus + select all on mount via `nextTick(() => el.select())`), `v-model="draft"`; Enter → `commit()`; Escape → cancel; blur → `commit()`. `commit`: trimmed non-empty and changed → `store.updateTask(task.id, { title })`; always exit edit mode. Stop propagation of keydown Enter/Escape/space (`@keydown.stop`) so card handlers don't fire.
   - Card-level `@keydown.enter.self` (open dialog) stays.
4. **Picker trigger slot** — `ProjectPicker.vue` + `TagPicker.vue`:
   - Add optional default slot for the trigger: `<PopoverTrigger as-child><slot><!-- existing Button as fallback --></slot></PopoverTrigger>`. Slot props: ProjectPicker `{ project: Project | null }`, TagPicker `{ tags: Tag[] }`.
   - Add `data-no-drag` on `PopoverContent` root and stop click/dblclick propagation on it (`@click.stop @dblclick.stop @keydown.enter.stop`) — PopoverContent is portalled, but events on Vue component tree still bubble through the card's listeners.
   - No other behavior change (TaskDialog keeps using them without slot).
5. **Inline project/tag on card** — `TaskCard.vue` `CardContent` (class `group/badges flex flex-wrap items-center gap-1 px-3`):
   - `<ProjectPicker :model-value="task.projectId" @update:model-value="(v) => store.updateTask(task.id, { projectId: v })">` with slot: if project → `<button type="button" data-no-drag :aria-label="`Project: ${project.name}. Change project`" class="rounded-full focus-visible:ring-2 focus-visible:ring-ring outline-none"><ColorBadge :label :color /></button>`; else → ghost chip button `+ Project` (`text-xs text-muted-foreground rounded-full border border-dashed px-2 h-5.5`, `aria-label="Assign project"`) shown only on card hover/focus-within: `opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100` (add `group/card` class to Card root).
   - `<TagPicker :model-value="task.tagIds" @update:model-value="(v) => store.updateTask(task.id, { tagIds: v })">` with slot: button wrapping existing tag ColorBadges + small `+` chip (`aria-label="Edit tags"`); when no tags → dashed `+ Tag` chip (same hover rule).
   - Card root keeps `cursor-grab`; all interactive children get `cursor-pointer` via step 1 and `data-no-drag`.
6. **Sortable filter** — `BoardColumn.vue` VueDraggable: ensure `:filter="'[data-no-drag]'"` and `:prevent-on-filter="false"` (added by previous fix — verify present, keep).
7. **KPI drawer** — replace Collapsible aside in `index.vue`:
   ```vue
   <Sheet v-model:open="kpiOpen">
     <SheetContent side="right" class="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl">
       <SheetHeader class="sr-only"><SheetTitle>KPIs</SheetTitle><SheetDescription>Metrics for the current project filter</SheetDescription></SheetHeader>
       <KpiPanel />
     </SheetContent>
   </Sheet>
   ```
   `kpiOpen = useState('kpiOpen', () => false)`. Header KPI button: `@click="kpiOpen = true"`, remove `aria-expanded/aria-controls`, add `aria-haspopup="dialog"`.
   - Darker backdrop: `app/components/ui/sheet/SheetOverlay.vue` default class `bg-black/10` → `bg-black/60`, keep the rest. (Check `SheetContent.vue` renders `SheetOverlay`; if it uses its own overlay classes, change there instead and report.)
8. **KpiPanel layout for wide drawer** (`KpiPanel.vue`): root `p-6 flex flex-col gap-6`; header row: `h2 text-lg font-semibold` "KPIs" + scope name + Copy summary button (right). Stat grid `grid grid-cols-2 gap-3 md:grid-cols-4`. Below: `grid gap-6 md:grid-cols-2` with sections: left column = By state + Aging; right column = Flow (cycle/WIP age/throughput bars). Projects section full width below. Keep all existing content/semantics; `Separator`s between rows only (not inside the grid). Leave a clearly marked empty slot for a later "Achievements" section: `<!-- slot: achievements -->` comment at the end of the root.
9. **A11y nits** — `ProjectBreakdown.vue`: stacked-bar div add `role="img"`; button `aria-label` → `` `Filter board by ${row.name} (${row.total} tasks)` ``.
10. Verify (report each):
    - `npx nuxi typecheck` → 0 errors in your files.
    - `npx nuxi build` → pass; re-apply `.output` xattr.
    - Browser: run `node smoke.mjs` in `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/cc18d4f2-c0fc-4a54-a724-fb381e8e8496/scratchpad/e2e` (uses dev server 3100). NOTE: the KPI panel is now closed by default — before running, edit ONLY the KPI check in that script: click `getByRole('button', { name: 'KPIs' })`, then assert `getByRole('dialog').getByText('Cycle time')` visible, then press Escape. Include full script output.
    - Additionally in a new script `ux.mjs` (same dir, Playwright `chromium.launch({ channel: 'chrome' })`, viewport 1400×800): (a) `done` column list `ul[data-state="done"]` has `scrollHeight > clientHeight` and page `document.documentElement.scrollHeight <= innerHeight`; (b) click first card's title button, type new title, Enter → `/api/board` shows new title, then restore original via PATCH; (c) on a card with no project: hover card, click "Assign project", pick first project option → API shows projectId, then restore null via PATCH; (d) `getComputedStyle(button).cursor === 'pointer'` for the "New task" button. Print results; include output.
