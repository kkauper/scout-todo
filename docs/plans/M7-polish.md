# M7 — UX polish: inline edit, theme toggle, fluid columns, project badges, dialog tabs

Executor: `executor` (sonnet). Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Read first: `docs/ARCHITECTURE.md` (Frontend section), `app/components/board/{KanbanBoard,BoardColumn,TaskCard}.vue`, `app/components/task/{TaskDialog,ProjectPicker}.vue`, `app/components/common/{ColorBadge,ColorModeToggle}.vue`, `app/components/kpi/ProjectBreakdown.vue`, `app/components/ui/tabs/*` (installed).
You own `app/**` (except `app/components/ui/**` — read only) and the Frontend section of `docs/ARCHITECTURE.md`. No server/shared changes.
DB holds the user's data: never delete/modify rows you didn't create; restore what you change. NOTE: the DB currently has only 3 columns (To do, In progress, Done) — the user deleted Backlog/Review. Don't recreate them. Dev server 3100 is the lead's (hot reload) — don't kill it.

## 1. Theme toggle is broken (bug)

`ColorModeToggle.vue`: in the template `mode` is auto-unwrapped to a string, so `mode.store.value` is undefined (typecheck error TS2339 line 23) and selecting Light/Dark/System does nothing. Fix: `const { store } = useColorMode({ emitAuto: true })`; icon computed uses `store.value`; `<DropdownMenuRadioGroup v-model="store">`. Also update `aria-label` to `` `Theme: ${label}` `` (Light/Dark/System).

## 2. Inline title edit (TaskCard)

Current problem: pencil → input focused; clicking elsewhere on the card blurs AND opens the task dialog.
- Editing UI: `Input` + two ghost icon buttons right of it: `Check` (`aria-label="Save title"`) and `X` (`aria-label="Cancel rename"`). Both use `@mousedown.prevent` (keeps focus in the input so blur doesn't fire first) and `@click.stop` → commit / cancel. Enter = save, Escape = cancel, blur = save (keep).
- Input styling: remove the grey fill — classes `h-7 bg-transparent dark:bg-transparent shadow-none px-1.5 text-sm font-medium` (override the shadcn `bg-input/30`-style background; check `ui/input/Input.vue` for the exact bg classes and neutralize them via `cn` override). Same fix for the column rename input in `BoardColumn.vue`.
- "First click only ends editing": add `const inlineEditing = useState('inlineEditing', () => false)`; set true while any inline edit (card title or column rename) is active, false on exit. In `BoardColumn.vue` li: `@pointerdown.capture="wasEditing = inlineEditing"` (store per-li or a module-level ref) and in `onCardClick` return early if `wasEditing` was true at pointerdown. Result: while an inline input is active, the next click anywhere on any card only commits the edit (blur), it never opens a dialog. Next click behaves normally.
- While editing, the card root also gets `data-no-open`.

## 3. Fluid column width

`BoardColumn.vue` section: replace fixed `w-72 shrink-0` with `min-w-72 max-w-[32rem] flex-[1_1_18rem]` (grow to share free space, never below 18rem, cap at 32rem so few columns stay readable). The add-column widget in `KanbanBoard.vue` stays `w-72 shrink-0`. KanbanBoard keeps `overflow-x-auto` (scrolls when columns × 18rem > viewport).

## 4. Project vs tag distinction

- New `app/components/common/ProjectBadge.vue`: props `{ label: string; color: ColorKey | null }`. Filled pill, no dot: `inline-flex items-center gap-1 rounded-md px-2 h-5.5 text-xs font-medium` with inline style `background: color-mix(in oklch, var(--swatch-${color}) 22%, transparent); color: var(--foreground); box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--swatch-${color}) 45%, transparent)`; leading `Folder` icon `size-3` colored `var(--swatch-${color})`. Null color → muted styling, label "No project".
- Tags keep `ColorBadge` (outline + dot) but make them `rounded-full` (pill) so shape differs: project = rounded rectangle, filled, folder icon; tag = pill, outline, dot.
- Use `ProjectBadge` for projects in: `TaskCard.vue` (project trigger), `ProjectPicker.vue` default trigger (dialog), `ProjectBreakdown.vue` rows, `KpiPanel` if projects are shown elsewhere. Picker list items: projects with `Folder` icon in swatch color instead of the dot. Header filter `Select` items: same `Folder` icon instead of dot.

## 5. Task dialog tabs (edit mode)

`TaskDialog.vue`:
- Edit mode: `Tabs default-value="details"` → `TabsList` with `TabsTrigger value="details"` "Details" and `TabsTrigger value="history"` `History ({events.length})`. Details = all fields (title, project/deadline, tags, description, sub-todos + AI). History = the timestamps `dl` (Created, Last column change, Completed) + event list. Reset to `details` each time the dialog opens.
- Create mode: no tabs (as now).
- `DialogContent`: `max-h-[85vh] flex flex-col`; tab content area `overflow-y-auto min-h-0`; footer (Cancel/Save) stays visible outside the scroll area. Save only relevant on Details tab but keep footer always visible.

## 6. Verify (report each)

- `npx nuxi typecheck` → 0 errors (whole project). `npx vitest run` → pass. `npx nuxi build` → pass; re-apply `.output` xattr.
- Fix e2e scripts in `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/cc18d4f2-c0fc-4a54-a724-fb381e8e8496/scratchpad/e2e/` so they don't assume a column named "Backlog" or "Review" exists: pick columns by kind from `/api/board` (first `open`, first `active`, first `done`). Then run `smoke.mjs`, `ux.mjs`, `columns.mjs` (delete-move target = first open column), `ai.mjs` → all pass; include outputs.
- New `polish.mjs`: (a) theme toggle: choose Dark → `html.dark` present; choose Light → absent; choose System; (b) click pencil on a card → input visible; computed background of input is transparent (`rgba(0, 0, 0, 0)`); click on the same card's body → NO dialog opens and title saved (typed change persisted via API), then restore title; (c) Check button saves, Escape cancels; (d) viewport 1600 with 3 visible columns → each column width > 288 px and ≤ 512 px; viewport 900 → columns 288 px and board scrolls horizontally; (e) project badge on a card has a `svg` folder icon and no dot span; (f) edit dialog shows tabs, History tab lists ≥1 event, reopening lands on Details. Include output. Restore all data.
