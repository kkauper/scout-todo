# M5-C — Local AI (Ollama) backend + UI building blocks

Executor: `executor` (sonnet). `docs/ARCHITECTURE.md` binding.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Runtime: Ollama at `http://127.0.0.1:11434`, model `qwen3:8b` (being pulled right now; check `ollama list`. If not present yet at verify time, verify with `OLLAMA_MODEL=qwen2.5-coder:latest` and report).
You own ONLY: `server/utils/ollama.ts`, `server/utils/ai-prompts.ts`, `server/api/ai/**`, `app/composables/useAi.ts`, `app/components/ai/**`, `.env.example`, `.env`. Integration into dialog/KPI drawer is a later task — do NOT edit TaskDialog, TaskCard, KpiPanel, pages, store. Other agents edit store/server task routes/schema concurrently.
Dev server on port 3100 belongs to lead — don't kill it. For your verification start your own on port **3103** (background) and kill it after. Keep typescript ^6.0.3.

## Design rules

- Local only. No external network calls. Timeouts everywhere. AI is optional: when Ollama is down every endpoint returns 503 `Local AI unavailable — is Ollama running?`, UI disables AI buttons with tooltip.
- Non-streaming `/api/chat` with `stream: false`, `think: false` (qwen3 thinking off), `options: { temperature: 0.4 }`. Defensive: strip any `<think>…</think>` block from content.
- Structured outputs via Ollama `format` (JSON schema) + zod-parse the result; parse failure → 502 `AI returned invalid output`.
- Never invent metrics/numbers in prompts' output; answer in the language of the input.

## Steps

1. `.env.example` + `.env`: append
   ```
   # Local AI (Ollama)
   OLLAMA_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=qwen3:8b
   ```
2. `server/utils/ollama.ts`:
   ```ts
   export function ollamaConfig() { return { url: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434', model: process.env.OLLAMA_MODEL ?? 'qwen3:8b' } }
   export async function ollamaStatus(): Promise<{ available: boolean; model: string; modelInstalled: boolean }>
     // GET {url}/api/tags, timeout 2 s; available=false on any error; modelInstalled = tags include model (match name or name+':latest')
   export async function ollamaChat(input: { system: string; user: string; format?: Record<string, unknown>; temperature?: number }): Promise<string>
     // POST {url}/api/chat, AbortSignal.timeout(90_000); network error/ECONNREFUSED → createError 503 (message above); non-2xx → 502 with Ollama error text; returns message.content with <think> blocks stripped, trimmed
   ```
   Use global `$fetch` (ofetch) or `fetch` — your choice, but map errors as specified.
3. `server/utils/ai-prompts.ts` — pure builder functions returning `{ system, user }` (no I/O):
   - `improveTitlePrompt({ title, description?, projectName? })` → ask for exactly 3 alternative task titles: concise (≤ 70 chars), start with a verb, specific, no trailing period, no quotes.
   - `draftDescriptionPrompt({ title, projectName?, tags?, existing? })` → 2–5 sentences or short bullet list: goal, scope, done-criteria. If `existing` given: improve it, keep facts. Plain text/Markdown, no heading, no preamble like "Here is".
   - `subtasksPrompt({ title, description? })` → 3–7 concrete, actionable sub-todos, each ≤ 80 chars, verb first, ordered by execution, no numbering.
   - `achievementPrompt({ periodLabel, scopeName, tasks: { title; project: string | null; tags: string[]; description: string | null; cycleDays: number; completedAt: string }[] })` → Markdown for a manager/salary conversation: short intro line (period + count), then bullets grouped by project (`**Project**` sub-heading lines), each bullet = outcome/impact phrasing of the task (active voice, first person implied, no fluff), may merge closely related tasks; closing line with delivery facts derived ONLY from given data (count, avg cycle time computed by caller and passed in `periodLabel` context is fine). Explicitly forbid inventing numbers, percentages, or stakeholders not in input.
4. Routes (zod validation, 400 on bad input):
   - `server/api/ai/status.get.ts` → `ollamaStatus()`.
   - `server/api/ai/improve-title.post.ts` body `{ title: 1..200, description?: ≤5000 nullable, projectName?: ≤80 nullable }` → `format` schema `{ type: 'object', properties: { suggestions: { type: 'array', items: { type: 'string' } } }, required: ['suggestions'] }` → `{ suggestions: string[] }` (trim, dedupe, drop empties, max 3, each sliced to 200).
   - `server/api/ai/draft-description.post.ts` body `{ title, projectName?, tags?: string[] ≤10, existing?: ≤5000 nullable }` → `{ text: string }` (sliced to 5000).
   - `server/api/ai/suggest-subtasks.post.ts` body `{ title, description? }` → format schema `{ items: string[] }` → `{ items: string[] }` (trim, dedupe, max 7, each ≤ 200).
   - `server/api/ai/achievement-summary.post.ts` body `{ from: z.iso.date(), to: z.iso.date(), projectId?: uuid | 'none', periodLabel: string ≤ 60 }` → load done tasks with `completed_at` within [from 00:00 local, to 23:59:59.999 local] (+ project filter), join project name + tag names (no N+1: 3 queries), map to prompt input with `cycleDays` (1 decimal). 0 tasks → `{ text: '', count: 0 }` without calling Ollama. Else pass count + avg cycle days inside the prompt's user message; return `{ text, count }`. Cap at 150 most recent tasks.
5. `app/composables/useAi.ts`:
   ```ts
   export function useAi() {
     const status = useState<{ available: boolean; model: string; modelInstalled: boolean } | null>('aiStatus', () => null)
     async function refreshStatus() { try { status.value = await $fetch('/api/ai/status') } catch { status.value = { available: false, model: '', modelInstalled: false } } }
     const ready = computed(() => !!status.value?.available && !!status.value?.modelInstalled)
     const reason = computed(() => !status.value ? 'Checking local AI…' : !status.value.available ? 'Local AI offline — start Ollama' : !status.value.modelInstalled ? `Model ${status.value.model} not installed — run: ollama pull ${status.value.model}` : '')
     // typed wrappers: improveTitle(input), draftDescription(input), suggestSubtasks(input), achievementSummary(input) → $fetch POST
     return { status, ready, reason, refreshStatus, ... }
   }
   ```
   Call `refreshStatus()` once on client (`onMounted` in AiButton when status null).
6. Components `app/components/ai/`:
   - `AiButton.vue`: props `{ label: string; loading?: boolean }`, emits `click`. Ghost sm Button with `Sparkles` icon (spinner `Loader2 animate-spin` when loading), disabled when `!ready || loading`; when not ready wrap in `Tooltip` showing `reason`. `aria-busy` when loading.
   - `AiTitleSuggestions.vue`: props `{ title: string; description?: string | null; projectName?: string | null }`, emits `pick(title: string)`. `Popover`: trigger = AiButton "Improve"; on open → call improveTitle (disabled when title empty); content: loading text, error text (`role="alert"`), or list of suggestion buttons (click → emit pick, close). "Try again" ghost button re-requests.
   - `AiDescriptionButton.vue`: props `{ title: string; projectName?; tags?: string[]; existing?: string | null }`, emits `result(text: string)`. AiButton label = existing ? "Improve with AI" : "Draft with AI". Error shown inline (`text-xs text-destructive role=alert`).
   - `AiSubtaskSuggestions.vue`: props `{ title: string; description?: string | null }`, emits `add(titles: string[])`. AiButton "Suggest sub-todos" → shows list with `Checkbox` per item (all checked by default; `npx shadcn-vue add checkbox` may already exist — if `app/components/ui/checkbox` missing, run `CI=1 npx shadcn-vue@latest add checkbox -y < /dev/null`), Buttons "Add selected" (emit, clear) and "Discard".
   - `AchievementSummary.vue`: no props. Uses `useBoardStore().projectFilter` for scope. Period `Select`: This week (Mon→today), Last 7 days, This month, Last 30 days, Last 90 days — compute `from`/`to` as local `YYYY-MM-DD` (use `localDateIso` from `#shared/utils/dates`). AiButton "Write achievement summary" → result `text` shown in read-only `Textarea` (rows 12, `font-mono text-xs`) + "Copy" button (clipboard, "Copied" 2 s). `count === 0` → muted "No completed tasks in this period." Heading `h3` "Achievements" in KPI section style (`text-xs font-medium uppercase tracking-wide text-muted-foreground`).
7. Verify (report each, include timings):
   - `npx nuxi typecheck` → 0 errors in your files.
   - Own dev server port 3103: `curl /api/ai/status`; improve-title with `{"title":"fix bug login"}` → 3 suggestions; draft-description; suggest-subtasks with a realistic title; achievement-summary `{"from":"<today-30d>","to":"<today>","periodLabel":"Last 30 days"}` → non-empty text + count > 0; invalid body → 400.
   - Stop Ollama impossible to simulate safely → instead run your dev server with `OLLAMA_URL=http://127.0.0.1:1` and confirm status `available:false` and improve-title → 503 with message. Kill servers.
   - `npx nuxi build` → pass; re-apply `.output` xattr.
