# Multi-User Plan

**Goal:** Several accounts, each with a fully private board. Accounts are created by an admin CLI script (no public registration). Users can change their own password in the UI.

**Decisions (fixed, do not revisit):**
- Isolation: `user_id` column on `projects`, `tags`, `board_columns`, `tasks`, enforced in application code (no RLS). Child tables (`task_tags`, `checklist_items`, `task_state_events`) derive ownership via their task.
- Foreign-ID behavior: an `[id]` route param that belongs to another user → **404** (never 403). An ID in a request body/query (`projectId`, `columnId`, `tagIds`, `moveTo`) that belongs to another user → **400** with the same message as a non-existent ID.
- Accounts live only in the DB. Env login (`NUXT_AUTH_USERNAME`, `NUXT_AUTH_PASSWORD_HASH`, `pnpm auth:hash`) is removed.
- Existing data is migrated to a placeholder user `owner` (fixed id `00000000-0000-4000-8000-000000000001`, `password_hash` NULL). Admin sets its password with `pnpm user:passwd owner`.
- Session shape: `{ user: { id: string, name: string }, loggedInAt: number }`. Sessions without `user.id` are cleared and rejected with 401.
- Password rules: min 8, max 1000 characters. Username: trimmed, lowercased, must match `/^[a-z0-9._-]{1,64}$/`.
- Password change does not invalidate other devices' sealed-cookie sessions (accepted limitation).
- Do NOT commit. The working tree has unrelated uncommitted work.

**Environment facts:** Nuxt 4, Drizzle (pg), postgres-js, `nuxt-auth-utils`, Vitest node env. Nitro auto-imports everything exported from `server/utils/*` into server code (`useDb`, `schema`, `toTask`, …). Files under `server/db/` and `scripts/` are NOT auto-imported — use explicit relative imports. Local DB: `pnpm db:up` (Docker, port 5433), `DATABASE_URL` in `.env`.

---

## Task 1: Schema + migration

### 1.1 `server/db/schema.ts`
- Add `uniqueIndex` to the `drizzle-orm/pg-core` import.
- Add a new table **above** `projects`:
  ```ts
  export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  })
  ```
- Add to `projects`, `tags`, `boardColumns`, `tasks` (first column after `id`):
  ```ts
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ```
- `projects.name`: remove `.unique()`. Add table config: `(t) => [uniqueIndex('projects_user_id_name_unique').on(t.userId, t.name)]`.
- `tags.name`: remove `.unique()`. Add `(t) => [uniqueIndex('tags_user_id_name_unique').on(t.userId, t.name)]`.
- `boardColumns`: add `(t) => [index('board_columns_user_id_position_idx').on(t.userId, t.position)]`.
- `tasks`: add `index('tasks_user_id_idx').on(t.userId)` to its existing index array.
- Add relations: `usersRelations` (many projects, tags, boardColumns, tasks) and add `user: one(users, …)` to `projectsRelations`, `tagsRelations`, `boardColumnsRelations`, `tasksRelations`.

### 1.2 Generate + hand-edit migration
Run `pnpm db:generate --name multi_user` (creates `server/db/migrations/0003_multi_user.sql` + snapshot + journal entry). Keep the snapshot/journal as generated. **Replace the body of the SQL file** with this exact order (use `--> statement-breakpoint` between statements, like earlier migrations; keep any constraint/index names drizzle generated for the FKs if they differ from below — match the snapshot):

1. `CREATE TABLE "users"` (id uuid pk default gen_random_uuid(), username text not null, password_hash text, created_at timestamptz not null default now(), `CONSTRAINT "users_username_unique" UNIQUE("username")`).
2. `INSERT INTO "users" ("id", "username", "password_hash") VALUES ('00000000-0000-4000-8000-000000000001', 'owner', NULL);`
3. For each of `projects`, `tags`, `board_columns`, `tasks`:
   - `ALTER TABLE "<t>" ADD COLUMN "user_id" uuid;`
   - `UPDATE "<t>" SET "user_id" = '00000000-0000-4000-8000-000000000001';`
   - `ALTER TABLE "<t>" ALTER COLUMN "user_id" SET NOT NULL;`
   - `ALTER TABLE "<t>" ADD CONSTRAINT "<t>_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;`
4. `ALTER TABLE "projects" DROP CONSTRAINT "projects_name_unique";` and same for `tags_name_unique`.
5. `CREATE UNIQUE INDEX "projects_user_id_name_unique" ON "projects" USING btree ("user_id","name");` and `tags_user_id_name_unique` likewise.
6. `CREATE INDEX "board_columns_user_id_position_idx" ON "board_columns" USING btree ("user_id","position");` and `CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");`

Acceptance: `pnpm db:up && pnpm db:migrate` succeeds on a DB that already has data (the local one), and `SELECT count(*) FROM tasks WHERE user_id IS NULL` = 0. Then `pnpm db:generate` again reports no changes (schema and snapshot agree). If it generates a new file, delete that file and fix the mismatch.

## Task 2: User management module + CLI

### 2.1 `server/db/users.ts` (new, explicit imports only)
```ts
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DEFAULT_COLUMNS } from '../../shared/types/domain'
import { createPasswordHash } from '../utils/password'
import * as schema from './schema'

type Db = PostgresJsDatabase<typeof schema>

export const USERNAME_RE = /^[a-z0-9._-]{1,64}$/
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 1000

export function normalizeUsername(raw: string): string   // trim + toLowerCase; throws Error('Invalid username') if !USERNAME_RE
export function validatePassword(pw: string): void        // throws Error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`)
export async function createUser(db: Db, username: string, password: string): Promise<{ id: string; username: string }>
  // normalize + validate; in ONE transaction: insert user (hash via createPasswordHash), insert DEFAULT_COLUMNS
  // for that user with position (i + 1) * 1000. Duplicate username → throw Error(`User "${name}" already exists`)
  // (catch pg code 23505 on err.code or err.cause.code).
export async function setUserPassword(db: Db, username: string, password: string): Promise<void>
  // normalize + validate; update password_hash; if no row updated → throw Error(`User "${name}" not found`)
```

### 2.2 `scripts/user.ts` (new)
- `import 'dotenv/config'`; reads `DATABASE_URL` (exit 1 with `DATABASE_URL not set` if missing); `postgres(url, { max: 1 })` + `drizzle(client, { schema })`.
- Usage: `tsx scripts/user.ts <add|passwd> <username>`. Wrong args → print usage, exit 1.
- Prompts `Password: ` and `Repeat password: ` via `node:readline/promises` (same style as current `scripts/hash-password.ts`). Mismatch → `Passwords do not match`, exit 1.
- `add` → `createUser`, prints `Created user "<name>" (<id>)`. `passwd` → `setUserPassword`, prints `Password updated for "<name>"`.
- Errors: print `err.message`, exit 1. Always `await client.end()`.

### 2.3 `package.json`
- Add scripts `"user:add": "tsx scripts/user.ts add"`, `"user:passwd": "tsx scripts/user.ts passwd"`, `"test:isolation": "vitest run --config vitest.integration.config.ts"`.
- Remove the `auth:hash` script. Delete `scripts/hash-password.ts`.

## Task 3: Auth

### 3.1 `auth.d.ts`
`interface User { id: string; name: string }`.

### 3.2 `server/utils/login.ts` (new)
```ts
let dummyHash: Promise<string> | undefined
// Verifies password against the user's hash. For a missing user or a user with null hash it still runs
// checkPasswordHash against a lazily created dummy hash (createPasswordHash(crypto.randomUUID())) so timing
// does not reveal whether the username exists, and returns false.
export async function verifyCredentials(
  user: { passwordHash: string | null } | undefined,
  password: string,
): Promise<boolean>
```
Import `checkPasswordHash`/`createPasswordHash` explicitly from `./password` (so the unit test can import this file directly).

### 3.3 `server/api/auth/login.post.ts`
- Keep body schema and rate limiter block unchanged.
- Remove `useRuntimeConfig` / env check / sha256 username compare.
- `const username = body.username.trim().toLowerCase()`; `const [user] = await useDb().select().from(schema.users).where(eq(schema.users.username, username))`.
- `if (!(await verifyCredentials(user, body.password)) || !user) → 401 'Invalid username or password'`.
- `await setUserSession(event, { user: { id: user.id, name: user.username }, loggedInAt: Date.now() })`; return `{ ok: true }`.

### 3.4 `server/api/auth/password.post.ts` (new)
- Body: `{ currentPassword: z.string().min(1).max(1000), newPassword: z.string().min(8).max(1000) }`.
- Rate limit: same `LOGIN_LIMITER` block as login, but key = `` `pw:${userId}` ``.
- `const userId = await requireUserId(event)`; load user by id; if missing → 401.
- `verifyCredentials(user, currentPassword)` false → 400 `Current password is incorrect`.
- Update `password_hash` with `createPasswordHash(newPassword)`. Return `{ ok: true }`.

### 3.5 `server/middleware/auth.ts`
After the existing path checks:
```ts
const session = await requireUserSession(event)
if (!session.user?.id) {
  await clearUserSession(event)
  throw createError({ statusCode: 401, statusMessage: 'Session expired' })
}
```

### 3.6 `server/utils/owner.ts` (new)
```ts
import type { H3Event } from 'h3'
export type Db = ReturnType<typeof useDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function requireUserId(event: H3Event): Promise<string>
  // (await requireUserSession(event)).user.id; missing → 401

export async function assertOwnedRefs(
  db: Db | Tx,
  userId: string,
  refs: { projectId?: string | null; columnId?: string; tagIds?: string[] },
  message: string,
): Promise<void>
  // For each ref that is present and non-null, check it exists with user_id = userId
  // (tagIds: dedupe, `select count(*) … where id in (…) and user_id = userId` must equal deduped length).
  // Any failure → createError({ statusCode: 400, statusMessage: message }).
```

### 3.7 `nuxt.config.ts`
Remove `authUsername` and `authPasswordHash` from `runtimeConfig`.

## Task 4: Scope every handler

Every handler below calls `const userId = await requireUserId(event)` first. `and`/`eq` from `drizzle-orm`. "owned" = `and(eq(table.id, id), eq(table.userId, userId))`.

| File | Change |
|---|---|
| `server/utils/mappers.ts` | `loadTaskDto(db, userId, id)`: `findFirst` where task id AND `userId`. Update all callers. |
| `api/board.get.ts` | projects/tags/columns/tasks filtered by `userId`. `taskTags` and `checklistItems`: `innerJoin(schema.tasks, eq(child.taskId, schema.tasks.id)).where(eq(schema.tasks.userId, userId))`, select only the child table's columns (`db.select({ ...getTableColumns(schema.checklistItems) })` / `{ taskId, tagId }`). Keep existing ordering. |
| `api/kpis.get.ts` | Same filtering as board for projects, columns, tasks, taskTags. |
| `api/ai/achievement-summary.post.ts` | done-columns query adds `eq(boardColumns.userId, userId)`; task conditions add `eq(tasks.userId, userId)`; projects query filtered by `userId`. Tag join is already restricted to owned task ids — leave it. |
| `api/projects/index.post.ts`, `api/tags/index.post.ts` | insert `userId`. Unique violation (now per user) → existing 409 message unchanged. |
| `api/projects/[id].patch.ts`, `[id].delete.ts`; `api/tags/[id].patch.ts`, `[id].delete.ts` | `.where(owned)`. |
| `api/columns/index.post.ts` | max position query `where(eq(boardColumns.userId, userId))`; insert `userId`. |
| `api/columns/[id].patch.ts` | `existing` select `where(owned)`. Other statements unchanged (column ownership implies its tasks). |
| `api/columns/[id].delete.ts` | column select `where(owned)` (404); count query `where(eq(boardColumns.userId, userId))`; target column select `where(and(eq(id, moveTo), eq(userId, userId)))` (400 `Invalid moveTo column`). |
| `api/tasks/index.post.ts` | inside tx: `columnId` select adds userId (400 `Unknown columnId`); default-column list filtered by userId; before insert `assertOwnedRefs(tx, userId, { projectId: body.projectId, tagIds: body.tagIds }, 'Invalid projectId or tagIds')`; insert `userId`. |
| `api/tasks/[id].patch.ts` | inside tx, before the update: `assertOwnedRefs(tx, userId, { projectId: taskFields.projectId, tagIds }, 'Unknown project or tag')`; update `where(owned)`. `loadTaskDto(db, userId, id)`. |
| `api/tasks/[id].delete.ts` | `where(owned)`. |
| `api/tasks/[id]/move.post.ts` | task `for('update')` select `where(owned)` (→ null → 404); `toColumn` select adds userId (400 `Unknown columnId`). `loadTaskDto(db, userId, id)`. |
| `api/tasks/[id]/events.get.ts` | first select task `where(owned)`; missing → 404. Then load events as before. |
| `api/tasks/[id]/checklist.post.ts` | task select `where(owned)`. |
| `api/checklist/[id].patch.ts` | `existing` = `select({ ...getTableColumns(schema.checklistItems) }).from(checklistItems).innerJoin(tasks, eq(checklistItems.taskId, tasks.id)).where(and(eq(checklistItems.id, id), eq(tasks.userId, userId)))`. Missing → 404. Rest unchanged. |
| `api/checklist/[id].delete.ts` | Same ownership select first (404 if missing), then delete by id. |

AI endpoints without DB access (`improve-title`, `draft-description`, `suggest-subtasks`, `status`) are unchanged.

Acceptance: `grep -rn "useDb()" server/api` — every file listed also contains `requireUserId(`. `pnpm typecheck` (or `pnpm exec nuxi typecheck` if no script) passes.

## Task 5: Seed

`server/db/seed.ts`:
- Before inserting: find user `owner`; if absent, insert `{ id: '00000000-0000-4000-8000-000000000001', username: 'owner', passwordHash: null }`. Use its id as `ownerId`.
- `--reset`: replace TRUNCATE with `DELETE` of owner's rows: `await db.delete(schema.tasks).where(eq(schema.tasks.userId, ownerId))`, then board_columns, tags, projects (same filter). Children cascade from tasks.
- The existing-task-count check counts only the owner's tasks.
- Add `userId: ownerId` to every inserted project, tag, column, task.
- Print at end: `Seeded as "owner". Set a password with: pnpm user:passwd owner`.
- Update error hint text `npm run db:seed` → `pnpm db:seed`.

## Task 6: Change-password UI

### 6.1 `app/components/common/ChangePasswordDialog.vue` (new)
- Props/model: `v-model:open` (boolean).
- Uses existing shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `Input`, `Label`, `Button` (same import style as other components — auto-imported).
- Fields: Current password (`autocomplete="current-password"`), New password (`autocomplete="new-password"`), Repeat new password (`autocomplete="new-password"`).
- Client checks before submit: new length ≥ 8 → else `New password must be at least 8 characters`; new === repeat → else `Passwords do not match`.
- Submit: `$fetch('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } })`. Error → show `err.data.statusMessage ?? 'Could not change password'` in `<p role="alert" class="text-sm text-destructive">`. Success → show `Password changed` (`text-sm text-muted-foreground`) and close the dialog after 1200 ms.
- Reset all fields + messages whenever the dialog opens.
- Buttons: `Cancel` (variant outline, closes) and submit `Change password` / `Saving…` while pending; inputs disabled while pending.

### 6.2 `app/components/common/AccountMenu.vue`
- `const passwordOpen = ref(false)`.
- Add `DropdownMenuItem` with `KeyRound` icon (from `@lucide/vue`) labeled `Change password` directly above the Sign out separator, `@select="passwordOpen = true"`.
- Render `<ChangePasswordDialog v-model:open="passwordOpen" />` as a sibling after `</DropdownMenu>` (wrap template in a fragment/`<div class="contents">` if needed).

## Task 7: Tests

### 7.1 `tests/unit/login.test.ts` (new) — `verifyCredentials`
- undefined user → false
- user with `passwordHash: null` → false
- correct password with hash from `createPasswordHash(pw, 1000)` → true
- wrong password → false

### 7.2 `tests/unit/users.test.ts` (new) — pure functions only
- `normalizeUsername('  Alice ')` → `'alice'`; `'bad name'`, `''`, 65 chars → throw.
- `validatePassword('1234567')` throws; `'12345678'` ok; 1001 chars throws.

### 7.3 Isolation test
- `vitest.integration.config.ts`: `environment: 'node'`, `include: ['tests/integration/**/*.test.ts']`, `testTimeout: 30000`, `fileParallelism: false`.
- `tests/integration/isolation.test.ts`:
  - `import 'dotenv/config'`. `BASE = process.env.BASE_URL ?? 'http://localhost:3000'`. Needs `DATABASE_URL`.
  - `beforeAll`: own drizzle client; `createUser` for `iso-a-<random6>` and `iso-b-<random6>` with password `isolation-pass-1`; log both in via `POST /api/auth/login`, store the cookie from `res.headers.getSetCookie()` (name=value part only). Helper `api(cookie, method, path, body?)` returns `{ status, json }`.
  - Alice creates: project, tag, a column (`POST /api/columns`), a task in her new column with projectId + tagIds, a checklist item (`POST /api/tasks/:id/checklist`). Record ids. Record Alice's `GET /api/board` JSON.
  - Tests (Bob's cookie):
    1. `GET /api/board` contains none of Alice's ids; Bob has exactly 5 columns (defaults).
    2. `GET /api/kpis` → 200 (no crash) and `GET /api/tasks/<aliceTask>/events` → 404.
    3. `PATCH`/`DELETE /api/projects/<aliceProject>`, `/api/tags/<aliceTag>`, `/api/columns/<aliceColumn>`, `/api/tasks/<aliceTask>`, `/api/checklist/<aliceItem>` → all 404.
    4. `POST /api/tasks/<aliceTask>/move` with Bob's own column → 404; `POST /api/tasks/<aliceTask>/checklist` → 404.
    5. `POST /api/tasks` with `columnId: aliceColumn` → 400; with `projectId: aliceProject` → 400; with `tagIds: [aliceTag]` → 400.
    6. Bob's own task: `PATCH` with `projectId: aliceProject` → 400; `move` to `aliceColumn` → 400. Bob's own column: `DELETE ?moveTo=<aliceColumn>` after putting a task in it → 400.
    7. Bob can create a project with the same name as Alice's → 200 (per-user uniqueness).
    8. `POST /api/auth/password` as Bob: wrong current → 400; correct → 200; login with new password → 200.
    9. After all: Alice's `GET /api/board` deep-equals the recorded snapshot.
  - `afterAll`: `DELETE FROM users WHERE id IN (a, b)` (cascade), `client.end()`.

Commands (must pass):
```
pnpm test
pnpm db:up && pnpm db:migrate
pnpm dev   # in background, wait for http://localhost:3000
pnpm test:isolation
pnpm build
```

## Task 8: Docs + env

- `.env.example`: remove `NUXT_AUTH_USERNAME`, `NUXT_AUTH_PASSWORD_HASH` lines.
- `README.md`: replace `auth:hash` setup line with `pnpm user:add <name>` (and note existing data belongs to `owner`: `pnpm user:passwd owner`); scripts table: remove `auth:hash`, add `user:add`, `user:passwd`, `test:isolation`; env table: remove the two `NUXT_AUTH_*` rows.
- `docs/DEPLOYMENT.md`: remove the two `wrangler secret put NUXT_AUTH_*` lines and the password-change note; add section "Users": create with `DATABASE_URL=<supabase direct url> pnpm user:add <name>`, reset with `pnpm user:passwd <name>`, users change own password via account menu. Add upgrade note: run `pnpm db:migrate` against Supabase, then `pnpm user:passwd owner`, then deploy; between migration and deploy, creating items fails (old code doesn't set `user_id`); old sessions are logged out once. Tell admin to `wrangler secret delete NUXT_AUTH_USERNAME` / `NUXT_AUTH_PASSWORD_HASH`.
- `docs/ARCHITECTURE.md`: short "Accounts & isolation" paragraph (users table, user_id ownership, 404/400 rule, `requireUserId` + `assertOwnedRefs`).
