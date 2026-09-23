# Per-user Claude API key Plan

**Goal:** Each user can store their own Anthropic API key in an "AI settings" dialog (account menu). When a key is set, all AI features (improve title, draft description, suggest sub-todos, achievement summary) run on Claude via the server; otherwise they fall back to local Ollama (unchanged). Works on the Cloudflare deployment, where Ollama is unavailable.

**Stack facts:** Nuxt 4.5 / Nitro (h3 1.15), Drizzle + postgres-js, multi-user (`requireUserId(event)` in `server/utils/owner.ts`, `users` table in `server/db/schema.ts`), zod v4, Vitest (node env, `tests/unit/**`), Workers runtime in prod (`nodejs_compat`). Existing AI: `server/utils/ollama.ts` (`ollamaChat({ system, user, format?, temperature? }): Promise<string>`, `ollamaStatus()`), routes in `server/api/ai/*`, prompts in `server/utils/ai-prompts.ts`, client `app/composables/useAi.ts`, account menu `app/components/common/AccountMenu.vue`, dialog pattern `app/components/common/ChangePasswordDialog.vue`.

**Fixed decisions:**
- SDK: official `@anthropic-ai/sdk` (fetch-based, runs on Workers). Server-side only — the key never reaches the browser after saving.
- Model: `claude-opus-5`, `output_config.effort: 'low'` (short text tasks), `max_tokens: 16000`, no `thinking` param (Opus 5 runs adaptive by default). Server-side refusal fallback enabled: `client.beta.messages.create({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', … })`.
- Structured output for JSON routes: `output_config.format = { type: 'json_schema', schema }` with `additionalProperties: false` on every object; the route keeps doing `JSON.parse` + zod validation on the returned text.
- Key at rest: AES-256-GCM, key material from new runtime secret `NUXT_ENCRYPTION_KEY` (≥32 chars) via SHA-256 → raw AES key (WebCrypto only; no Node crypto). Stored format `v1:<ivB64url>:<ciphertextB64url>` in `users.anthropic_api_key` (nullable text).
- Provider choice per request: key set → Claude; else Ollama (current behavior, incl. empty-`OLLAMA_URL` = disabled).

---

## Task 1: Storage + crypto

1. `pnpm add @anthropic-ai/sdk` (if pnpm min-release-age blocks the newest, take the newest allowed; don't edit pnpm-workspace.yaml).
2. `server/db/schema.ts`: add `anthropicApiKey: text('anthropic_api_key')` to `users`. `pnpm run db:generate` → new migration `0004_*.sql` (just `ALTER TABLE "users" ADD COLUMN "anthropic_api_key" text;`). `pnpm run db:migrate` against LOCAL Docker only (default `.env`). NEVER against Supabase.
3. `nuxt.config.ts` runtimeConfig: add `encryptionKey: ''` (→ `NUXT_ENCRYPTION_KEY`). `.env.example`: add `NUXT_ENCRYPTION_KEY=` with comment `# Encrypts per-user API keys, min 32 chars: openssl rand -base64 32`. Add a real random value to local `.env` (append only; don't touch other lines).
4. `server/utils/secret-box.ts` (new, no Nuxt imports so Vitest can import it): `encryptSecret(plain: string, keyMaterial: string): Promise<string>`, `decryptSecret(stored: string, keyMaterial: string): Promise<string | null>` (null on wrong prefix / bad base64 / auth-tag failure — never throws), `secretHint(plain: string): string` → `'…' + last 4 chars`. Throw in encrypt if keyMaterial.length < 32.
5. `tests/unit/secret-box.test.ts`: round-trip; two encryptions differ (random 12-byte IV); wrong key → null; tampered ciphertext → null; malformed strings (`''`, `'v1:x'`, `'v2:a:b'`) → null; short key material → encrypt throws; hint of `sk-ant-abcdef1234` is `…1234`.

## Task 2: Server — settings API + provider switch

1. `server/utils/ai.ts` (new):
   - `getUserAnthropicKey(event): Promise<string | null>` — `requireUserId`, read `users.anthropic_api_key`, decrypt with `useRuntimeConfig(event).encryptionKey`; null if unset/undecryptable or encryptionKey empty.
   - `aiChat(event, input: { system: string; user: string; schema?: Record<string, unknown>; temperature?: number }): Promise<string>` — if key: call Claude (below); else `ollamaChat({ system, user, format: schema, temperature })`.
   - Claude call: `new Anthropic({ apiKey })` per request; `client.beta.messages.create({ model: 'claude-opus-5', max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system, messages: [{ role: 'user', content: user }], output_config: { effort: 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) } })`. No `temperature` for Claude (removed on Opus 5). If `stop_reason === 'refusal'` → 422 `'Claude declined this request'`. Return concatenated `text` blocks (narrow on `block.type === 'text'`). Error mapping with SDK classes, most specific first: `Anthropic.AuthenticationError` → 400 `'Claude API key was rejected — update it in AI settings'`; `Anthropic.PermissionDeniedError` → 403 same style; `Anthropic.RateLimitError` → 429 `'Claude rate limit — try again shortly'`; `Anthropic.APIError` → 502 `'Claude API error'`; network (`Anthropic.APIConnectionError`) → 503 `'Could not reach Claude'`. If a type name doesn't exist in the installed SDK, let the compiler guide you (check `node_modules/@anthropic-ai/sdk` exports) and report the actual names.
   - `aiStatus(event)` → `{ provider: 'claude', available: true, model: 'claude-opus-5', modelInstalled: true }` when a key is set, else `{ provider: 'ollama', ...await ollamaStatus() }`.
2. Routes `server/api/ai/{improve-title,draft-description,suggest-subtasks,achievement-summary}.post.ts`: replace `ollamaChat(...)` with `aiChat(event, ...)` (pass `schema` instead of `format`). Add `additionalProperties: false` to the two `formatSchema` objects. `status.get.ts` → `return aiStatus(event)`.
3. `server/api/settings/ai.get.ts` → `{ claudeKeyConfigured: boolean, claudeKeyHint: string | null, encryptionConfigured: boolean }`.
4. `server/api/settings/ai.put.ts` — zod body `{ anthropicApiKey: z.string().trim().min(20).max(300) }`. If `encryptionKey` empty → 500 `'Server is missing NUXT_ENCRYPTION_KEY'`. Validate the key: `await new Anthropic({ apiKey }).models.retrieve('claude-opus-5')` — `AuthenticationError` → 400 `'Anthropic rejected this API key'`, other errors → 502 `'Could not verify the key with Anthropic'`. Encrypt + update the current user's row. Return same shape as GET.
5. `server/api/settings/ai.delete.ts` → set column null, return GET shape.
6. Never log or return the plaintext key; never include it in error messages.

## Task 3: UI

1. `app/components/common/AiSettingsDialog.vue` (new; follow `ChangePasswordDialog.vue` structure and how AccountMenu opens it): title "AI settings". Body:
   - Status line: "Using Claude (claude-opus-5) — key …1234" or "No Claude key — using local AI (Ollama) when available".
   - `Label` "Anthropic API key" + `Input type="password" autocomplete="off" placeholder="sk-ant-…"`; helper text: "Stored encrypted on the server and only used for your requests. Create a key at console.anthropic.com." (plain text, not a link requirement).
   - Buttons: "Save key" (PUT; pending state "Verifying…"), "Remove key" (DELETE; only when configured, `variant="outline"`), close.
   - Errors in `role="alert"` using `err.data.statusMessage`. Clear input after successful save.
   - After save/remove: `await useAi().refreshStatus()`.
2. `AccountMenu.vue`: add item "AI settings" (lucide `Sparkles`) above "Change password", opening the dialog.
3. `useAi.ts`: `AiStatus` gets `provider: 'claude' | 'ollama'`; `reason` when not ready: `'AI is off — add a Claude API key in Account → AI settings'` if `status.available === false` and provider is ollama and the local model isn't reachable; keep the existing Ollama-specific messages but append " or add a Claude API key in Account → AI settings" to the offline one.

## Task 4: Docs
- README: Configuration table row `NUXT_ENCRYPTION_KEY`; short "AI" note: per-user Claude key in Account → AI settings, else Ollama.
- `docs/DEPLOYMENT.md` Secrets: add `pnpm exec wrangler secret put NUXT_ENCRYPTION_KEY  # openssl rand -base64 32`; migration step: `0004` must be applied to Supabase before deploying (user runs it); note AI works in cloud once a user saves a key.
- `docs/ARCHITECTURE.md` AI section: provider switch, encryption, settings endpoints.

## Acceptance
- `pnpm run test` (incl. new secret-box tests), `pnpm run typecheck` green; `pnpm run build:cf` succeeds (SDK bundles for Workers).
- Local, dev server on :3100 (already running — don't restart unless config change requires; if `NUXT_ENCRYPTION_KEY` isn't picked up, you may restart it: the user allows restarting the dev server). Test user: create `claude-test` via `printf 'ScoutTest123!\nScoutTest123!\n' | pnpm -s run user:add claude-test`, delete it at the end (`delete from users where username='claude-test'` on local DB).
  - GET `/api/settings/ai` → not configured.
  - PUT with a fake key `sk-ant-api03-invalidinvalidinvalid` → 400 "Anthropic rejected this API key", nothing stored.
  - No real key is available to you: do NOT look for one on the machine. Verify the Claude path by a unit-level check instead: write the encrypted fake key directly to the DB for the test user (using `encryptSecret` + local `.env` key), then call `/api/ai/improve-title` → expect 400 "Claude API key was rejected…" (proves routing to Claude + error mapping). `/api/ai/status` → provider `claude`.
  - Remove key (DELETE) → status provider `ollama`.
  - Browser (Playwright from scratchpad, see previous plan's instructions): Account menu → AI settings opens; invalid key shows the error; screenshot.
  - `grep` the DB row: stored value starts with `v1:` and does not contain the plaintext.
- Do NOT commit. Do NOT touch Supabase or run wrangler deploy.
