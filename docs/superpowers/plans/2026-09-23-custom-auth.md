# Auth + Cloudflare Deployment Plan (v2)

Replaces v1 (rejected: localStorage JWT broke SSR, Workers-incompatible libs, secrets baked into build, unfinished steps).

**Goal:** Single-account username/password login with httpOnly cookie sessions, and a deployable Cloudflare Workers build that talks to Supabase Postgres via Hyperdrive. Local dev (Docker Postgres, Ollama) keeps working.

**Decisions (fixed, do not revisit):**
- Sessions: `nuxt-auth-utils` (sealed httpOnly cookie). No JWT, no localStorage token, no users table.
- Account: one user from runtime config `NUXT_AUTH_USERNAME` + `NUXT_AUTH_PASSWORD_HASH` (PBKDF2-SHA256 via WebCrypto, 100000 iterations — the Workers maximum).
- Server protection: ONE server middleware, deny-by-default for `/api/**`.
- Hosting: Cloudflare Workers + Static Assets, Nitro preset `cloudflare_module`, `nodejs_compat`.
- DB: Supabase Postgres behind Hyperdrive (caching disabled). Keep postgres-js + Drizzle pg dialect. D1 rejected: 8 routes use interactive transactions.
- AI: disabled in cloud (empty `OLLAMA_URL`). Local Ollama unchanged.
- Login brute force: Workers Rate Limiting binding `LOGIN_LIMITER` (5 req / 60 s per IP); skipped when binding absent (local dev).

**Environment facts:** Nuxt 4.5.2, nitropack 2.13.4, h3 1.15.11, pnpm, Vitest node env (`tests/unit/**/*.test.ts`). Nitro auto-imports server utils from `server/utils/`; Nuxt's dotenv loader interpolates `$`, so hash strings MUST NOT contain `$`.

---

## Task 1: Authentication

### 1.1 Dependency
`pnpm add nuxt-auth-utils`. If pnpm's minimum-release-age blocks it, pick the newest version it allows (`pnpm add nuxt-auth-utils@<version>`); do not edit `pnpm-workspace.yaml`. Add `'nuxt-auth-utils'` to `modules` in `nuxt.config.ts`.

### 1.2 `nuxt.config.ts` runtimeConfig
Add:
```ts
runtimeConfig: {
  authUsername: '',       // NUXT_AUTH_USERNAME
  authPasswordHash: '',   // NUXT_AUTH_PASSWORD_HASH
  session: {
    maxAge: 60 * 60 * 24 * 30,
    password: '',         // NUXT_SESSION_PASSWORD (min 32 chars)
  },
},
```
No `process.env` reads in nuxt.config for secrets.

### 1.3 `server/utils/password.ts` (new, no Nuxt/Nitro imports — must run under plain Vitest)
Exports exactly:
- `createPasswordHash(password: string, iterations = 100_000): Promise<string>` → `pbkdf2-sha256:<iterations>:<saltB64url>:<hashB64url>`; 16-byte random salt from `crypto.getRandomValues`; 32-byte derived key via `crypto.subtle.importKey('raw', …, 'PBKDF2')` + `deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)`. base64url without padding (no `$`, no `:`).
- `checkPasswordHash(password: string, stored: string): Promise<boolean>` → parse 4 `:`-separated parts; return `false` (never throw) on wrong prefix, wrong part count, non-integer or <1 or >100000 iterations, bad base64; re-derive with stored salt/iterations and compare with `timingSafeEqual`.
- `timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean` → false if lengths differ, else XOR-accumulate over all bytes.
- `sha256(text: string): Promise<Uint8Array>` via `crypto.subtle.digest`.
Use `globalThis.crypto` only (works in Node 24 and Workers).

### 1.4 `tests/unit/password.test.ts` (new)
Import relatively from `../../server/utils/password`. Cases:
1. hash format matches `/^pbkdf2-sha256:100000:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/` and contains no `$`.
2. correct password → true.
3. wrong password → false.
4. two hashes of same password differ (salt).
5. malformed stored values → false, no throw: `''`, `'garbage'`, `'bcrypt:1:a:b'`, `'pbkdf2-sha256:abc:a:b'`, `'pbkdf2-sha256:0:a:b'`, `'pbkdf2-sha256:999999999:a:b'`.
6. empty-string password: hashing works, and checking `'x'` against it → false.
7. `timingSafeEqual`: equal arrays true, different content false, different length false.
Use `iterations = 1000` in tests except case 1 to keep them fast.

### 1.5 `scripts/hash-password.ts` (new) + script `"auth:hash": "tsx scripts/hash-password.ts"`
Reads password from stdin via `node:readline/promises` prompt "Password: " (never from argv), rejects empty input with exit 1, prints the `createPasswordHash` result on its own line. Imports `../server/utils/password` relatively.

### 1.6 `server/api/auth/login.post.ts` (new)
- zod body schema like other routes (`readValidatedBody(event, bodySchema.parse)` — mirror `server/api/projects/index.post.ts` style): `username: z.string().min(1).max(200)`, `password: z.string().min(1).max(1000)`.
- Rate limit: `const limiter = (event.context.cloudflare?.env as { LOGIN_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> } } | undefined)?.LOGIN_LIMITER`. If present: key = `getRequestHeader(event, 'cf-connecting-ip') ?? 'unknown'`; if `!success` → `createError({ statusCode: 429, statusMessage: 'Too many login attempts. Try again in a minute.' })`.
- `const { authUsername, authPasswordHash } = useRuntimeConfig(event)`; if either empty → 500 `'Login is not configured'`.
- `userOk = timingSafeEqual(await sha256(body.username), await sha256(authUsername))`; `passOk = await checkPasswordHash(body.password, authPasswordHash)` — ALWAYS compute both (no short-circuit).
- Fail → 401 `'Invalid username or password'`.
- Success → `await setUserSession(event, { user: { name: authUsername }, loggedInAt: Date.now() })`; return `{ ok: true }`.

### 1.7 `server/middleware/auth.ts` (new)
```ts
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (path === '/api/auth/login' || path.startsWith('/api/_auth/')) return
  await requireUserSession(event)
})
```
(`requireUserSession` throws 401.) No per-route changes.

### 1.8 `app/middleware/auth.global.ts` (new)
```ts
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && to.path !== '/login') return navigateTo('/login')
  if (loggedIn.value && to.path === '/login') return navigateTo('/')
})
```

### 1.9 `app/pages/login.vue` (new)
Centered `Card` (from `~/components/ui/card`) with `ScoutLogo` above title "Sign in", form: `Label`+`Input` username (`autocomplete="username"`, autofocus), `Label`+`Input type="password"` (`autocomplete="current-password"`), full-width submit `Button` ("Sign in" / "Signing in…" while pending, disabled while pending). Uses design tokens only (`bg-background`, `text-muted-foreground`, `text-destructive`) — no hardcoded colors. On submit: `await $fetch('/api/auth/login', { method: 'POST', body })`, then `await useUserSession().fetch()`, then `await navigateTo('/')`. On error show message from `err.data.statusMessage` (fallback `'Sign in failed'`) in a `role="alert"` element; clear password field on error. `useHead({ title: 'Sign in · Scout' })`.

### 1.10 `app/stores/board.ts`
- At top of the setup function: `const requestFetch = useRequestFetch()`.
- `load()` uses `requestFetch<BoardData>('/api/board')` (forwards cookie during SSR).
- Add `function isUnauthorized(e: unknown): boolean` → `(e as { statusCode?: number; status?: number })?.statusCode === 401 || …status === 401`.
- `run()` catch: if `isUnauthorized(e)` → `await navigateTo('/login')`; `return undefined` (do NOT call `load()`). Otherwise unchanged.
No other store behavior changes.

### 1.11 Logout button in `app/pages/index.vue`
After `<ColorModeToggle />` in header: `Button variant="ghost" size="icon" aria-label="Sign out"` with `LogOut` icon from `@lucide/vue`, wrapped in existing `Tooltip` pattern if the header already uses tooltips, else plain. Handler: `await useUserSession().clear(); await navigateTo('/login')`.

### 1.12 Env + docs
- `.env.example`: add block
  ```
  # Auth — generate hash with: pnpm run auth:hash
  NUXT_AUTH_USERNAME=
  NUXT_AUTH_PASSWORD_HASH=
  # Session encryption key, min 32 chars: openssl rand -base64 32
  NUXT_SESSION_PASSWORD=
  ```
- README Quick start: add step after `cp .env.example .env`: set the three auth vars (`pnpm run auth:hash`). Add rows for the three vars in Configuration table and `auth:hash` in Scripts table.
- `docs/ARCHITECTURE.md`: add short "Auth" section summarizing 1.2–1.10 (cookie session, single account from runtime config, server middleware deny-by-default, `/api/auth/login`, `/api/_auth/*` from module).

### Acceptance
- `pnpm run test` green (existing + new password tests). `pnpm run typecheck` clean.
- Manual (with `.env` configured, `pnpm run dev`):
  - `curl -i localhost:3000/api/board` → 401.
  - Wrong password via curl POST `/api/auth/login` → 401; right → 200 + `Set-Cookie` with `HttpOnly`.
  - Browser: `/` redirects to `/login`; after sign-in board loads; hard reload stays on board (SSR works); sign out → `/login`; `/login` while signed in → `/`.

---

## Task 2: Cloudflare deployment

### 2.1 Dependency + scripts
`pnpm add -D wrangler` (same min-release-age rule as 1.1). Scripts:
- `"build:cf": "NITRO_PRESET=cloudflare_module nuxt build"`
- `"preview:cf": "pnpm run build:cf && wrangler dev"`
- `"deploy": "pnpm run build:cf && wrangler deploy"`
- `"cf:types": "wrangler types"` (only if useful; optional)

### 2.2 `nuxt.config.ts`
Add `nitro: { experimental: { asyncContext: true } }` (needed for `useEvent()` in `useDb`). Do not hardcode a preset (local `pnpm build` stays node).

### 2.3 `server/utils/db.ts` — per-request client on Workers
Keep exported names/signatures (`useDb()`, `schema`, `isUniqueViolation`, `isForeignKeyViolation`). New `useDb()`:
- Try `useEvent()` (wrap in try/catch → undefined outside request). Read `event.context.cloudflare?.env?.HYPERDRIVE?.connectionString`.
- If present: reuse `event.context.scoutDb` if set; else `const client = postgres(connectionString, { max: 5, fetch_types: false })`, store `event.context.scoutPg = client`, `event.context.scoutDb = drizzle(client, { schema })`, return it.
- Else: existing module-singleton path using `process.env.DATABASE_URL` (unchanged behavior locally).
Declare the context fields via `declare module 'h3' { interface H3EventContext { scoutDb?: …; scoutPg?: ReturnType<typeof postgres> } }`.

### 2.4 `server/plugins/db-cleanup.ts` (new)
```ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event) => {
    const pg = event.context.scoutPg
    if (pg) event.waitUntil(pg.end({ timeout: 5 }))
  })
})
```

### 2.5 AI off when `OLLAMA_URL` is empty — `server/utils/ollama.ts`
- `ollamaConfig()` unchanged except returns the raw env value when defined (keep `??` default so unset → localhost; explicit empty string → `''`).
- `ollamaStatus()`: if `url === ''` return `{ available: false, model, modelInstalled: false }` without fetching.
- `ollamaChat()`: if `url === ''` throw `createError({ statusCode: 503, statusMessage: 'AI is disabled in this deployment' })`.

### 2.6 `wrangler.jsonc` (new, repo root)
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "scout",
  "main": "./.output/server/index.mjs",
  "assets": { "directory": "./.output/public", "binding": "ASSETS" },
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "vars": { "OLLAMA_URL": "" },
  "hyperdrive": [
    // Replace with the id printed by `wrangler hyperdrive create` (see docs/DEPLOYMENT.md)
    { "binding": "HYPERDRIVE", "id": "REPLACE_WITH_HYPERDRIVE_ID" }
  ],
  "ratelimits": [
    { "name": "LOGIN_LIMITER", "namespace_id": "1001", "simple": { "limit": 5, "period": 60 } }
  ]
}
```
Verify every key against `node_modules/wrangler/config-schema.json`; if a key name differs in the installed version (e.g. `ratelimits`, `main`, `assets`), use the schema's name and report it. After `build:cf`, check `.output/` layout; if Nitro emits its own `wrangler.json` or a different entry path, align `main`/`assets.directory` with the real output and report.

### 2.7 `.gitignore`
Add `.wrangler` and `.dev.vars*`.

### 2.8 `docs/DEPLOYMENT.md` (new)
Sections, concise, exact commands:
1. **Prerequisites:** Cloudflare account, Supabase project, `pnpm exec wrangler login`.
2. **Database:** Supabase → Connect → use the *Direct connection* string, or *Session pooler* (port 5432) if direct is IPv6-only; never the transaction pooler (6543). Run migrations from the laptop: `DATABASE_URL='<supabase url>' pnpm run db:migrate`. Optional seed: `DATABASE_URL='<url>' pnpm run db:seed`.
3. **Hyperdrive:** `pnpm exec wrangler hyperdrive create scout-db --connection-string='<supabase url>' --caching-disabled` (caching off: writes don't invalidate cached reads). Paste id into `wrangler.jsonc`.
4. **Secrets:** `pnpm exec wrangler secret put NUXT_AUTH_USERNAME`, `NUXT_AUTH_PASSWORD_HASH` (from `pnpm run auth:hash`), `NUXT_SESSION_PASSWORD` (`openssl rand -base64 32`).
5. **Deploy:** `pnpm run deploy` → `https://scout.<subdomain>.workers.dev`.
6. **Local Workers preview:** `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://scout:scout@localhost:5433/scout pnpm run preview:cf`, secrets in `.dev.vars`.
7. **Notes:** AI disabled in cloud; rotating `NUXT_SESSION_PASSWORD` signs everyone out; change password = new hash + `wrangler secret put` again.
Link it from README (new "Deploy to Cloudflare" line under Quick start).

### Acceptance
- `pnpm run test`, `pnpm run typecheck` green; `pnpm run build` (node) still succeeds; `pnpm run dev` still works against Docker Postgres (board loads after login).
- `pnpm run build:cf` succeeds; `.output` matches `wrangler.jsonc` paths.
- `pnpm exec wrangler deploy --dry-run` succeeds (placeholder Hyperdrive id is acceptable for dry-run; if dry-run rejects the placeholder, report exact error instead of inventing an id).
- If a local Workers preview is possible (`wrangler dev` with the local connection string env var), sign in and load the board; report result either way.
- NO real `wrangler deploy`, no `wrangler login`, no secrets created — user does those.

---

## Review Focus
1. Hard reload on `/` while signed in must stay on board (SSR cookie forwarding via `useRequestFetch`).
2. Every `/api/**` except login and `/api/_auth/*` returns 401 without session — including `/api/ai/*`, `/api/kpis`, `/api/tasks/:id/events`.
3. No secret defaults compiled into the build; `grep` `.output` for `NUXT_SESSION_PASSWORD`/hash values finds nothing.
4. Wrong username and wrong password take the same code path (both checks always run).
5. Local dev unchanged apart from needing the three auth env vars.
