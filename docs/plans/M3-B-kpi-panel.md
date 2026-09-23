# M3-B — KPI panel

Executor: `executor` (sonnet). `docs/ARCHITECTURE.md` binding (§KPIs, §component map, §Accessibility).
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Prereq: M2 (`/api/kpis`, `shared/utils/kpi.ts` with `KpiReport`). Parallel agent M3-A owns store, pages, board/task components — do NOT edit those. You own ONLY: `app/components/kpi/**`, `app/composables/useKpis.ts`, `shared/utils/kpi-summary.ts`.
Contract from M3-A: `useBoardStore()` exposes `projectFilter: string | null | 'none'`, `projects`, `projectById`, and `revision: Ref<number>` (incremented after each successful mutation). M3-A renders `<KpiPanel />` (no props) inside a `w-80` aside. If `revision` not yet present when you typecheck, code against the contract anyway and report.
DO NOT touch `server/**`, `docs/`, `CLAUDE.md`, `.claude/`.

## Steps

1. `shared/utils/kpi-summary.ts` (relative imports only): `formatKpiSummary(r: KpiReport, scopeName: string): string` → Markdown for pasting into manager notes:
   ```
   ## Scout KPIs — {scopeName} ({localDateIso(new Date(r.generatedAt))})
   - Open: {open} · WIP: {wip} · Done: {done} · Overdue: {overdue}
   - Throughput: {thisMonth} this month, {last30Days} in last 30 days
   - Cycle time: avg {avgDays} d, median {medianDays} d (n={sample})      ← "n/a" when null
   - WIP age: avg {wipAvgDays} d                                          ← "n/a" when null
   - Weekly done (oldest→newest): {counts joined by ' · '}
   {if projects non-empty:}
   ### By project
   - {name}: {total} total, {done} done, {wip} in progress   (wip = in_progress + review)
   ```
2. `app/composables/useKpis.ts`:
   ```ts
   export function useKpis() {
     const store = useBoardStore()
     const query = computed(() => (store.projectFilter === null ? {} : { projectId: store.projectFilter }))
     const { data, status, error, refresh } = useFetch<KpiReport>('/api/kpis', { query, key: 'kpis' })
     watch(() => store.revision, () => refresh())
     return { report: data, status, error, refresh }
   }
   ```
   (`useFetch` re-runs on reactive `query` change.)
3. `app/components/kpi/KpiStat.vue`: props `{ label: string; value: number | string; hint?: string; tone?: 'default' | 'destructive' }`. `Card class="gap-1 py-3"` → `CardContent class="px-3"`: label `text-xs text-muted-foreground`, value `text-2xl font-semibold tabular-nums` (`text-destructive` when tone destructive and value not 0), hint `text-xs text-muted-foreground`.
4. `app/components/kpi/KpiStateBar.vue`: props `{ byState: Record<TaskState, number>; total: number }`. For each state in TASK_STATES a row: label (STATE_LABELS) + count right-aligned (`tabular-nums`) + `Progress :model-value="total ? count / total * 100 : 0" class="h-1.5"` with `:aria-label="`${label}: ${count} of ${total}`"`.
5. `app/components/kpi/ThroughputBars.vue`: props `{ weekly: { weekStart: string; count: number }[] }`. Flex row `items-end gap-1 h-20`; each bar `flex-1 rounded-sm bg-primary/80` height `max(count / max * 100, 4)%` (max ≥ 1), `role="img"` `:aria-label="`Week of ${weekStart}: ${count} done`"`, wrapped in `Tooltip` showing same text. Under bars: first and last `weekStart` labels (text-[10px] text-muted-foreground, justify-between).
6. `app/components/kpi/ProjectBreakdown.vue`: props `{ rows: KpiReport['projects'] }`, emits nothing — clicking a row sets `store.projectFilter = row.projectId ?? 'none'`. Each row = `<button type="button" class="w-full text-left rounded-md p-2 hover:bg-muted focus-visible:ring-2 ...">`: `ColorBadge :label="row.name" :color="row.color"` + total right; below stacked bar: `div.flex.h-1.5.overflow-hidden.rounded-full.bg-muted` with one segment per state width `count/total*100%`, colors: backlog `bg-muted-foreground/30`, todo `bg-muted-foreground/60`, in_progress `bg-[var(--swatch-blue)]`, review `bg-[var(--swatch-violet)]`, done `bg-[var(--swatch-green)]`; `aria-label` on the bar summarising counts per state. Button `aria-label="Filter board by {name}"`.
7. `app/components/kpi/KpiPanel.vue`:
   - `const { report, status } = useKpis()`; scope name: filter null → "All projects", 'none' → "No project", else project name.
   - Layout `div.flex.flex-col.gap-4.p-4`:
     - Header: `h2` "KPIs" + scope name (`text-xs text-muted-foreground`) + ghost sm Button "Copy summary" (`ClipboardCopy` icon) → `navigator.clipboard.writeText(formatKpiSummary(report, scopeName))`, button text → "Copied" for 2 s; `aria-live="polite"` on status text.
     - Loading (status pending and no report): 3 muted skeleton blocks (`animate-pulse bg-muted rounded-md h-16`).
     - Grid `grid-cols-2 gap-2`: KpiStat Open (hint "backlog + to do"), WIP (hint "in progress + review"), Done, Overdue (tone destructive).
     - `Separator`; section "By state" → KpiStateBar.
     - `Separator`; section "Flow": KpiStat grid-2: "Cycle time" `{avg} d` (hint `median {m} d · n={sample}`; "—" when null), "WIP age" `{wipAvgDays} d` (hint "avg days in current state"); then "Throughput" line: `{thisMonth} this month · {last30Days} last 30 d` + ThroughputBars.
     - `Separator`; section "Aging" → ordered list of `oldest` (title truncate, state label, `{days} d`), empty → "Nothing waiting."
     - Global only (`report.projects.length`): `Separator`; section "Projects" → ProjectBreakdown.
     - Section headings `h3 text-xs font-medium uppercase tracking-wide text-muted-foreground`.
   - Days display: one decimal as provided by API.
8. Verify (report each):
   - `npx nuxi typecheck` → 0 errors in your files (report others, don't fix).
   - `node -e` not possible for TS; instead add NO test file (tests are another agent's job). Grep your files for `new Date()` inside `shared/utils/kpi-summary.ts` → only `new Date(r.generatedAt)` allowed.
   - `npx nuxi build` → pass; re-apply `.output` xattr (`xattr -w 'com.apple.fileprovider.ignore#P' 1 .output`). If build fails solely because M3-A's `<KpiPanel />` integration or store `revision` is missing, report as blocker (not your file).

## Acceptance

- Panel shows all ARCHITECTURE §KPIs metrics, follows project filter, refreshes after every board mutation.
- Clicking project row filters board.
- Copy summary produces Markdown per step 1.
