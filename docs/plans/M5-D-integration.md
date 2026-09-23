# M5-D — Integrate checklist card + AI helpers

Executor: `quick-executor` (haiku). Exactly 3 files (explicit exception to 2-file rule): `app/components/task/TaskDialog.vue`, `app/components/board/TaskCard.vue`, `app/components/kpi/KpiPanel.vue`. Components used here already exist — read their props/emits first: `app/components/board/CardChecklist.vue`, `app/components/task/ChecklistEditor.vue`, `app/components/ai/{AiTitleSuggestions,AiDescriptionButton,AiSubtaskSuggestions,AchievementSummary}.vue`.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).

## Steps

1. `TaskCard.vue`: insert `<CardChecklist :task="task" class="px-3" />` directly after the closing `</CardContent>` (before the deadline/aging footer line). Nothing else.
2. `TaskDialog.vue`:
   a. Title field: wrap the Title `Label` in a row `div.flex.items-center.justify-between` and put `<AiTitleSuggestions :title="form.title" :description="form.description" :project-name="projectName" @pick="(t) => (form.title = t)" />` on the right. Add `const projectName = computed(() => (form.value.projectId ? store.projectById.get(form.value.projectId)?.name ?? null : null))`.
   b. Description field: same row pattern around its `Label`, right side `<AiDescriptionButton :title="form.title" :project-name="projectName" :tags="tagNames" :existing="form.description" @result="(t) => (form.description = t)" />` with `const tagNames = computed(() => form.value.tagIds.map((id) => store.tagById.get(id)?.name).filter((n): n is string => !!n))`.
   c. Sub-todos section: directly below `<ChecklistEditor ... />` add `<AiSubtaskSuggestions :title="form.title" :description="form.description" @add="onAddSuggested" />` with
      ```ts
      async function onAddSuggested(titles: string[]) {
        if (!titles.length) return
        if (dialog.value.mode === 'edit' && dialog.value.taskId) await store.addChecklistItems(dialog.value.taskId, titles)
        else draftChecklist.value.push(...titles)
      }
      ```
      (use the existing draft ref name in the file — check what it is called.)
3. `KpiPanel.vue`: replace the comment `<!-- slot: achievements -->` with `<Separator />` followed by `<AchievementSummary />`. If the comment is missing, append both at the end of the root element and report.
4. Verify: `npx nuxi typecheck` → 0 errors (Bash allowed for this command and for `npx nuxi build` only). Then `npx nuxi build` → pass, then run `xattr -w 'com.apple.fileprovider.ignore#P' 1 .output`. Report.
