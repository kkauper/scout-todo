# Time correction (TC-1 … TC-5)

Goal: users can edit start/end of a time entry (and stop a running entry at a past time) instead of deleting and re-adding. Scope: DB + validator + PATCH endpoint + store + inline edit UI for finished entries. Out of scope (later): edited badge, running-row UI, long-stop prompt, overlap warnings.

Conventions: follow surrounding code style (no semicolons, single quotes, 2-space indent, `defineEventHandler`, zod v4, Drizzle). Do not touch unrelated code.

---

## TC-1 Schema

File: `server/db/schema.ts`

1. Add enum next to the other `pgEnum`s (line ~19-21):
   ```ts
   export const timeEntrySource = pgEnum('time_entry_source', TIME_ENTRY_SOURCES)
   ```
   `TIME_ENTRY_SOURCES` comes from `shared/types/domain.ts` (see TC-4), imported the same way as `COLUMN_KINDS`.
2. In `timeEntries` table add, after `lastSeenAt`, before `createdAt`:
   ```ts
   source: timeEntrySource('source').notNull().default('timer'),
   editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
   originalStartedAt: timestamp('original_started_at', { withTimezone: true, mode: 'date' }),
   originalEndedAt: timestamp('original_ended_at', { withTimezone: true, mode: 'date' }),
   ```
   No new check constraints.
3. Run `pnpm db:generate`. It writes `server/db/migrations/0009_*.sql` + snapshot + journal. Check the SQL: `CREATE TYPE "public"."time_entry_source" AS ENUM('timer', 'manual')` and 4× `ALTER TABLE "time_entries" ADD COLUMN ...`. Nothing else. Do not hand-edit other migrations.
4. Apply locally: `pnpm db:up` (if the container is not running), then `pnpm db:migrate`. **Only the local DB** (DATABASE_URL from `.env`, localhost:5433). Never run against production.

File: `server/api/tasks/[id]/time-entries.post.ts`
5. In `.values({...})` add `source: 'manual'`.

## TC-2 Shared validator + input helpers

File: `shared/types/domain.ts`
1. Below `TIMER_MIN_ENTRY_SECONDS` add:
   ```ts
   /** Longest duration an edited entry may have. Matches the manual-add cap (1440 min). */
   export const TIMER_MAX_EDIT_SECONDS = 24 * 3600
   /** Tolerance for client/server clock skew when rejecting future timestamps. */
   export const TIMER_FUTURE_TOLERANCE_MS = 60_000
   export const TIME_ENTRY_SOURCES = ['timer', 'manual'] as const
   export type TimeEntrySource = (typeof TIME_ENTRY_SOURCES)[number]
   export type EntryTimesError = 'future' | 'end_before_start' | 'too_short' | 'too_long'
   export const ENTRY_TIMES_ERROR_MESSAGES: Record<EntryTimesError, string> = {
     future: 'Times can\'t be in the future.',
     end_before_start: 'End must be after start.',
     too_short: 'Entries must be at least 1 minute.',
     too_long: 'Entries can be at most 24 hours.',
   }
   ```

File: `shared/utils/timer.ts` — add three exported functions (with short JSDoc like the existing ones):

2. `validateEntryTimes(startedAt: Date | string, endedAt: Date | string | null, now: Date): EntryTimesError | null`
   Checks in this order, returns the first failure:
   - start > now + `TIMER_FUTURE_TOLERANCE_MS` → `'future'`
   - if endedAt !== null:
     - end > now + `TIMER_FUTURE_TOLERANCE_MS` → `'future'`
     - end < start → `'end_before_start'`
     - (end − start) seconds < `TIMER_MIN_ENTRY_SECONDS` → `'too_short'`
     - (end − start) seconds > `TIMER_MAX_EDIT_SECONDS` → `'too_long'`
   - else `null`
   (endedAt === null = running entry; only the start is checked.)
3. `toDateTimeLocalValue(iso: string): string` — ISO → `YYYY-MM-DDTHH:mm` in **local** time (for `<input type="datetime-local">`). Use `getFullYear/getMonth/getDate/getHours/getMinutes` with padStart.
4. `fromDateTimeLocalValue(value: string): Date | null` — returns `null` if value doesn't match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/` or the Date is invalid; otherwise `new Date(value)` (the spec parses it as local time).

File: `tests/unit/timer.test.ts` — add `describe('validateEntryTimes')` and `describe('dateTimeLocal helpers')`, using the existing fixed `NOW`:
5. Cases: valid 1 h entry → null; running entry with past start → null; start 2 min in future → 'future'; end 2 min in future → 'future'; end 30 s in future → null (tolerance); end < start → 'end_before_start'; 59 s → 'too_short'; exactly 60 s → null; exactly 24 h → null; 24 h + 1 s → 'too_long'; entry crossing midnight (23:30 → 00:45 next day) → null; accepts ISO strings as well as Dates.
6. Helpers: round-trip `fromDateTimeLocalValue(toDateTimeLocalValue(iso))` equals the ISO truncated to the minute; `fromDateTimeLocalValue('')` and `('garbage')` → null.

## TC-3 PATCH /api/time-entries/[id]

New file: `server/api/time-entries/[id].patch.ts`. Model it on `[id].delete.ts`.

```ts
const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  startedAt: z.iso.datetime({ offset: true }).optional(),
  endedAt: z.iso.datetime({ offset: true }).optional(),
}).refine((b) => b.startedAt !== undefined || b.endedAt !== undefined, { message: 'Nothing to update' })
```

Handler (returns `Promise<TimeEntry>`), inside `db.transaction`:
1. `await closeStaleTimer(tx, userId, now)` first.
2. Load the entry scoped by `id` AND `userId`. Not found → `createError({ statusCode: 404 })`.
3. `newStart = body.startedAt ? new Date(body.startedAt) : existing.startedAt`
   `newEnd = body.endedAt ? new Date(body.endedAt) : existing.endedAt` (stays `null` for a running entry when no endedAt is sent; sending endedAt on a running entry stops it at that time).
4. `const err = validateEntryTimes(newStart, newEnd, now)`; if err → `createError({ statusCode: 422, statusMessage: ENTRY_TIMES_ERROR_MESSAGES[err], data: { code: err } })`.
5. If `newStart` and `newEnd` equal the existing values (compare `getTime()`, null-safe) → return `toTimeEntry(existing)` without writing.
6. Otherwise update where `id` and `userId` match:
   ```ts
   {
     startedAt: newStart,
     endedAt: newEnd,
     editedAt: now,
     originalStartedAt: existing.originalStartedAt ?? existing.startedAt,
     originalEndedAt: existing.editedAt ? existing.originalEndedAt : existing.endedAt,
   }
   ```
   `.returning()`; no row → 404. Return `toTimeEntry(updated)`.
   Note: `originalEndedAt` uses `editedAt` as the "already edited" flag because an original end can legitimately be null (running entry).
7. Auto-imports: `closeStaleTimer`, `toTimeEntry`, `schema`, `useDb`, `requireUserId` are auto-imported in `server/` as in the delete handler; import `validateEntryTimes` from `#shared/utils/timer` and `ENTRY_TIMES_ERROR_MESSAGES`/`TimeEntry` from `#shared/types/domain`.

## TC-4 Domain type, mapper, store

1. `shared/types/domain.ts`: extend `TimeEntry`:
   ```ts
   export interface TimeEntry {
     id: string; taskId: string; startedAt: string; endedAt: string | null; lastSeenAt: string
     source: TimeEntrySource; editedAt: string | null; originalStartedAt: string | null; originalEndedAt: string | null
   }
   ```
2. `server/utils/mappers.ts` `toTimeEntry`: map the 4 new fields (dates → `toISOString()` or null).
3. `app/stores/board.ts`: add next to `deleteTimeEntry`, and export it in the store's return object:
   ```ts
   async function updateTimeEntry(entry: TimeEntry, patch: { startedAt?: string; endedAt?: string }): Promise<TimeEntry | undefined>
   ```
   - `const result = await run(() => $fetch<TimeEntry>(\`/api/time-entries/${entry.id}\`, { method: 'PATCH', body: patch }))`
   - If no result → return undefined.
   - Totals: `oldSec = entry.endedAt ? durationSeconds(entry.startedAt, entry.endedAt) : 0`; `newSec = result.endedAt ? durationSeconds(result.startedAt, result.endedAt) : 0`; `timeTotals.value[entry.taskId] = Math.max(0, (timeTotals.value[entry.taskId] ?? 0) - oldSec + newSec)`.
   - If `runningTimer.value?.entryId === entry.id`: if `result.endedAt` → `runningTimer.value = null`; else `runningTimer.value = { ...runningTimer.value, startedAt: result.startedAt }`.
   - Return result.
4. Fix any type errors the new required `TimeEntry` fields cause (e.g. test fixtures or other places that construct a `TimeEntry` literal) by adding the fields — nothing else.

## TC-5 Inline edit UI

File: `app/components/task/TaskTime.vue`. Only finished entries (`entry.endedAt !== null`) get an edit button.

Script:
1. Import `Pencil` from `@lucide/vue`; import `validateEntryTimes`, `toDateTimeLocalValue`, `fromDateTimeLocalValue` from `#shared/utils/timer`; `ENTRY_TIMES_ERROR_MESSAGES` from `#shared/types/domain`.
2. State: `editingId = ref<string | null>(null)`, `startDraft = ref('')`, `endDraft = ref('')`, `editError = ref<string | null>(null)`, `saving = ref(false)`.
3. `draftStart`/`draftEnd` computed = `fromDateTimeLocalValue(...)`. `draftSeconds` computed = both valid ? `durationSeconds(start.toISOString(), end.toISOString())` : null.
4. `editingEntry` computed = `entries.value.find(e => e.id === editingId.value) ?? null`.
5. `deltaSeconds` computed = editingEntry and draftSeconds !== null ? `draftSeconds − durationSeconds(entry.startedAt, entry.endedAt!)` : 0.
   `saveLabel` computed = `Math.abs(deltaSeconds) >= 7200` ? `` `Save (${deltaSeconds < 0 ? '−' : '+'}${formatDuration(Math.abs(deltaSeconds))})` `` : `'Save'`.
6. `async function startEdit(entry)`: set editingId, drafts via `toDateTimeLocalValue(entry.startedAt / entry.endedAt!)`, `editError = null`; `await nextTick()`; focus `document.getElementById(\`time-entry-start-${entry.id}\`)`.
7. `async function cancelEdit()`: remember id, `editingId = null`, `editError = null`; `await nextTick()`; focus `time-entry-edit-${id}`.
8. `async function saveEdit()`:
   - entry = editingEntry; return if missing or `saving`.
   - start/end = draftStart/draftEnd; if either null → `editError = 'Enter a valid start and end.'`; return.
   - `const err = validateEntryTimes(start, end, new Date())`; if err → `editError = ENTRY_TIMES_ERROR_MESSAGES[err]`; return.
   - saving = true; `const result = await store.updateTimeEntry(entry, { startedAt: start.toISOString(), endedAt: end.toISOString() })`; saving = false.
   - If no result → `editError = store.lastError ?? 'Couldn\'t save the entry.'`; return (keep form open).
   - `announce(\`Entry updated, ${formatDuration(durationSeconds(result.startedAt, result.endedAt!))}\`)`; `await loadEntries()`; then `await cancelEdit()` (closes + returns focus).
9. If the watched `props.taskId` changes, reset `editingId` to null (add to the existing watcher callback or a separate watcher).

Template, inside the existing `<li v-for>`:
10. When `editingId !== entry.id`: current row unchanged, plus a pencil `Button` **before** the delete button, same styling as delete (`variant="ghost" size="icon" class="size-6 shrink-0"`), `v-if="entry.endedAt !== null"`, `:id="\`time-entry-edit-${entry.id}\`"`, `:aria-label="\`Edit entry ${entryLabel(entry)}\`"`, `@click="startEdit(entry)"`, icon `<Pencil class="size-3.5" />`.
11. When `editingId === entry.id`: render instead a `<form class="w-full space-y-2 py-1" @submit.prevent="saveEdit" @keydown.esc.prevent.stop="cancelEdit">` with:
    - A row `flex flex-col gap-2 sm:flex-row`, two fields each `space-y-1`:
      `<Label :for="\`time-entry-start-${entry.id}\`">Start</Label>` + `<Input :id=... v-model="startDraft" type="datetime-local" step="60" :aria-invalid="editError ? 'true' : undefined" :aria-describedby="editError ? \`time-entry-edit-error-${entry.id}\` : undefined" />`; same for End (`time-entry-end-${entry.id}`, `endDraft`).
    - `<p class="text-xs text-muted-foreground tabular-nums">Duration: {{ draftSeconds !== null && draftSeconds >= 0 ? formatDuration(draftSeconds) : '—' }}</p>`
    - Error: `<p v-if="editError" :id="\`time-entry-edit-error-${entry.id}\`" role="alert" class="text-xs text-destructive">{{ editError }}</p>`
    - Buttons row `flex gap-2`: `<Button type="submit" size="sm" :disabled="saving">{{ saveLabel }}</Button>` and `<Button type="button" variant="ghost" size="sm" @click="cancelEdit">Cancel</Button>`.
    Enter submits via the form; Esc cancels.
12. Don't change the start/stop, add-time or delete behaviour.

---

## Verification (run all, report pass/fail)

1. `pnpm test` — all unit tests pass, including the new ones.
2. `pnpm typecheck` — no errors.
3. Integration test: add to `tests/integration/isolation.test.ts` a new `it('12. time entry edit: ...')` inside the `multi-user isolation` describe, after test 11:
   - alice `POST /api/tasks/${aliceTaskId}/time-entries` `{ minutes: 30 }` → 201, get `entry`; check `entry.source === 'manual'`, `entry.editedAt === null`.
   - bob `PATCH /api/time-entries/${entry.id}` with a valid body → 404.
   - alice PATCH `{ startedAt: <entry.startedAt − 15 min ISO> }` → 200; `json.editedAt` not null; `json.originalStartedAt === entry.startedAt`; `json.originalEndedAt === entry.endedAt`.
   - alice PATCH a second time `{ endedAt: <entry.endedAt − 5 min ISO> }` → 200; `json.originalStartedAt` still `entry.startedAt`.
   - alice PATCH `{ endedAt: <startedAt of the current entry − 1 min> }` → 422.
   - alice PATCH `{ endedAt: <now + 1 h> }` → 422.
   - alice PATCH `{}` → 400.
   - Running entry: alice `POST /api/tasks/${aliceTaskId}/timer` → running entryId; PATCH `{ startedAt: <now − 2 h> }` → 200 with `endedAt === null`; PATCH `{ endedAt: <now − 1 h> }` → 200 with `endedAt` set; then `GET /api/board` → `runningTimer === null`.
   - Clean up: DELETE the entries alice created in this test.
   Run: start local stack (`pnpm db:up`, `pnpm db:migrate`, `pnpm dev` in background on port 3000; the dev server may be started/restarted), then `pnpm test:isolation`. All tests pass. Stop the dev server if you started it.
4. Do not commit.
