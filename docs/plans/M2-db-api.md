# M2-A — Database layer, API routes, KPI logic

Executor: `executor` (sonnet). `docs/ARCHITECTURE.md` binding (§Database, §API, §KPIs).
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Prereq: M1 done (Nuxt scaffold, `shared/types/domain.ts`, `shared/utils/{transitions,position,dates}.ts`). `docker-compose.yml` + `.env` exist (DB on localhost:5433).
DO NOT touch: `CLAUDE.md`, `.claude/`, `docs/`, `app/` (frontend is M3). DO NOT delete `node_modules`/`.nuxt`/`.output`.

## Steps

1. Deps: `npm i drizzle-orm postgres zod` and `npm i -D drizzle-kit tsx dotenv vitest`.
2. `package.json` scripts (add, keep existing):
   ```json
   "db:up": "docker compose up -d --wait",
   "db:down": "docker compose down",
   "db:generate": "drizzle-kit generate",
   "db:migrate": "drizzle-kit migrate",
   "db:seed": "tsx server/db/seed.ts",
   "db:studio": "drizzle-kit studio",
   "test": "vitest run",
   "test:watch": "vitest",
   "typecheck": "nuxi typecheck"
   ```
3. `drizzle.config.ts`:
   ```ts
   import 'dotenv/config'
   import { defineConfig } from 'drizzle-kit'

   export default defineConfig({
     dialect: 'postgresql',
     schema: './server/db/schema.ts',
     out: './server/db/migrations',
     dbCredentials: { url: process.env.DATABASE_URL! },
     strict: true,
   })
   ```
4. `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config'

   export default defineConfig({
     test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
   })
   ```
5. `server/db/schema.ts`: exactly per ARCHITECTURE §Database. Import `TASK_STATES` via relative path `../../shared/types/domain`. Table vars: `projects`, `tags`, `tasks`, `taskTags`, `taskStateEvents`, enum `taskState`. Timestamps `timestamp(name, { withTimezone: true, mode: 'date' })`; deadline `date('deadline', { mode: 'string' })`. Export `relations` for tasks↔project, tasks↔taskTags↔tags (for relational queries).
6. `server/utils/db.ts`:
   ```ts
   import { drizzle } from 'drizzle-orm/postgres-js'
   import postgres from 'postgres'
   import * as schema from '../db/schema'

   let _db: ReturnType<typeof drizzle<typeof schema>> | undefined

   export function useDb() {
     if (!_db) {
       const url = process.env.DATABASE_URL
       if (!url) throw createError({ statusCode: 500, statusMessage: 'DATABASE_URL not set' })
       _db = drizzle(postgres(url, { max: 5 }), { schema })
     }
     return _db
   }
   export { schema }
   export function isUniqueViolation(e: unknown): boolean {
     const err = e as { code?: string; cause?: { code?: string } }
     return err?.code === '23505' || err?.cause?.code === '23505'
   }
   ```
7. `server/utils/mappers.ts`: `toProject(row)`, `toTag(row)`, `toTask(row, tagIds: string[])` → DTOs from `#shared/types/domain` (Dates → `toISOString()`, null-safe). Also `loadTaskDto(db, id): Promise<Task | null>` (task row + its tag ids).
8. `shared/utils/kpi.ts`: `computeKpis` + `KpiReport` type exactly per ARCHITECTURE §KPIs. Relative imports only. Details:
   - "now" param drives everything; never call `new Date()` inside except to build dates from inputs.
   - Week start = local Monday 00:00. `weekly` = `weeks` buckets (default 8), oldest first, last bucket = current week; `weekStart` as `localDateIso`.
   - `last30Days`: completedAt within `(now − 30d, now]`. `thisMonth`: completedAt in same local year+month as now.
   - `cycleTime` over done tasks with non-null completedAt in scope. `avgDays`/`medianDays` null when sample 0.
   - `aging.oldest`: non-done tasks, days = `daysBetween(stateChangedAt, now)`, top 5 desc.
   - `projects` rows only when scope is global (`opts.projectId === undefined`); include unassigned row only if it has ≥1 task; projects with 0 tasks included (total 0) — sorted by total desc, then name asc.
   - Round all day values with `Math.round(x * 10) / 10`.
9. Routes (all `defineEventHandler`, zod via `readValidatedBody(event, schema.parse)` / `getValidatedQuery` / `getValidatedRouterParams`; id params `z.object({ id: z.uuid() })`; not found → `createError({ statusCode: 404 })`; dup name → 409 via `isUniqueViolation`; every mutation sets `updatedAt = new Date()` where column exists; DELETE returns `setResponseStatus(event, 204)` + `null`):
   - `server/api/board.get.ts` → `BoardData` (tasks ordered by state, position; tagIds aggregated from task_tags in one query, not N+1).
   - `server/api/projects/index.post.ts` body `{ name: z.string().trim().min(1).max(80), color: z.enum(COLOR_KEYS).optional() }`.
   - `server/api/projects/[id].patch.ts` body `{ name?, color? }` (same rules, at least one field → else 400).
   - `server/api/projects/[id].delete.ts`.
   - `server/api/tags/index.post.ts`, `server/api/tags/[id].patch.ts`, `server/api/tags/[id].delete.ts` — same pattern (`name` max 40).
   - `server/api/tasks/index.post.ts` body `{ title: trim min1 max200, description?: string max 5000 nullable, projectId?: uuid nullable, state?: enum TASK_STATES (default 'backlog'), deadline?: z.iso.date() nullable, tagIds?: uuid[] default [] }`. In one transaction: position = `(max(position) where state) + 1000` or 1000; insert task (completedAt = now if state 'done'); insert task_tags; insert event `{ fromState: null, toState: state }`. Return `Task`. FK violation for unknown projectId/tagId → 400.
   - `server/api/tasks/[id].patch.ts` body `{ title?, description?, projectId?, deadline?, tagIds? }` (no state). If `tagIds` present → replace set in transaction.
   - `server/api/tasks/[id]/move.post.ts` body `{ state: enum, position: z.number().finite() }`. Transaction: select row `.for('update')`, 404 if missing; `patch = transitionPatch({ state: row.state, completedAt: row.completedAt?.toISOString() ?? null }, body.state, now)`; update position + updatedAt + (patch ? state/stateChangedAt/completedAt : nothing); if patch → insert event `{ fromState: row.state, toState: body.state, changedAt: now }`. After commit, when patch: `await useNitroApp().hooks.callHook('scout:task-moved', { taskId, fromState, toState, at: now.toISOString() })`. Return `Task`.
   - `server/api/tasks/[id].delete.ts`.
   - `server/api/tasks/[id]/events.get.ts` → `StateEvent[]` asc by changedAt.
   - `server/api/kpis.get.ts` query `{ projectId?: z.union([z.uuid(), z.literal('none')]) }` → load all projects + tasks (tagIds may be `[]`), return `computeKpis(tasks, projects, new Date(), { projectId })`.
10. `server/plugins/analytics.ts`: `defineNitroPlugin` that hooks `'scout:task-moved'` and in dev (`import.meta.dev`) logs `[analytics] task-moved <payload>`. Add type augmentation in `server/types/hooks.d.ts` declaring the hook on Nitro runtime hooks (`declare module 'nitropack/types' { interface NitroRuntimeHooks { 'scout:task-moved': (p: TaskMovedPayload) => void | Promise<void> } }`). If `nitropack/types` does not resolve in this Nuxt version, try `'nitropack'`; if neither typechecks, drop augmentation and cast `(useNitroApp().hooks as any)` — report which.
11. `server/db/seed.ts` (runs via tsx, outside Nuxt — own client from `process.env.DATABASE_URL`, `import 'dotenv/config'`, relative imports):
    - Refuse if `tasks` has rows unless `process.argv.includes('--reset')` → print hint `npm run db:seed -- --reset` and exit 1. With `--reset`: `TRUNCATE task_state_events, task_tags, tasks, tags, projects CASCADE`.
    - Insert projects `Platform` blue, `Design System` violet, `Hiring` amber, `Ops` teal; tags `bug` red, `feature` green, `meeting` slate, `docs` teal, `urgent` orange.
    - Insert ~30 tasks: ~12 done with completedAt spread over last 8 weeks (createdAt 1–14 days before completedAt), ~5 in_progress, ~3 review, ~5 todo, ~5 backlog; 3 unassigned; 3 open with deadline in past; some with future deadlines; 1–2 tags each on most. Write a realistic `task_state_events` chain per task (created → intermediate states → current), timestamps monotonic, last event = stateChangedAt.
    - Use a deterministic pseudo-random (seeded LCG) so reruns are stable relative to now.
    - Close client at end, print counts.
12. Verify (run all, report results):
    - `npm run db:up` → healthy.
    - `npm run db:generate` → creates migration in `server/db/migrations`; `npm run db:migrate` → applied.
    - `npm run db:seed` → counts printed; run again → refuses; `npm run db:seed -- --reset` → works.
    - `npx nuxi typecheck` → 0 errors in files you created/changed (M1 frontend errors: report, don't fix).
    - Start `npx nuxi dev --port 3100` in background, wait until up, then curl:
      - `GET /api/board` → projects 4, tags 5, tasks ~30.
      - `POST /api/projects {"name":"Test"}` → 200; again → 409; `POST /api/projects {"name":""}` → 400.
      - `POST /api/tasks {"title":"t1"}` → state backlog; `POST /api/tasks/<id>/move {"state":"done","position":5}` → completedAt set; move to `todo` → completedAt null; `GET /api/tasks/<id>/events` → 3 events.
      - `PATCH /api/tasks/<id> {"tagIds":[<tag>]}` → tagIds updated.
      - `GET /api/kpis` → counts/throughput/projects populated; `GET /api/kpis?projectId=none` → projects `[]`; `GET /api/kpis?projectId=bad` → 400.
      - Delete test task + test project → 204.
      - Kill dev server.
    - `npx nuxi build` → success.

## Acceptance

- Migration committed under `server/db/migrations`; schema matches ARCHITECTURE.
- All curl checks pass as specified.
- `shared/utils/kpi.ts` pure (no Nuxt/server imports, relative imports).
