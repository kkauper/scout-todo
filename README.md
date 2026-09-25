<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/scout-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="public/scout-light.png">
    <img alt="Scout" src="public/scout-light.png" width="420">
  </picture>
</p>

<p align="center">
  A personal Kanban board that turns your daily work into evidence for performance and salary conversations.
</p>

<div align="center">
  <img alt="Nuxt 4" src="https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white" />
  <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white" />
  <img alt="PostgreSQL 17" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" />
  <img alt="Claude" src="https://img.shields.io/badge/Claude-API-D97757?logo=anthropic&logoColor=white" />
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-Local%20AI-8B5CF6?logo=ollama&logoColor=white" />
</div>

---

Scout is a personal Kanban board built to make work visible, measurable, and easier to explain in real conversations. It keeps your tasks in one place, gives you clear state transitions, and turns activity into evidence you can use for planning, reviews, and salary or manager discussions.

Run it on your laptop with Docker, or self-host it on Cloudflare Workers with a managed Postgres database and use it from any device.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/board-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/board-light.png">
    <img alt="Scout board with task panel and running timer" src="docs/screenshots/board-light.png" width="100%">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/kpis-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/kpis-light.png">
    <img alt="Scout KPI drawer" src="docs/screenshots/kpis-light.png" width="100%">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/search-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/search-light.png">
    <img alt="Search palette" src="docs/screenshots/search-light.png" width="100%">
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/mobile-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/mobile-light.png">
    <img alt="Scout on a phone" src="docs/screenshots/mobile-light.png" width="320">
  </picture>
</p>

## Why Scout

This project started from a simple need: keep a board that feels lightweight, but still gives you hard numbers behind the work. It is built for individuals, not teams. Every account gets its own private board, and nothing is shared between accounts.

The app combines a drag-and-drop task board with KPI summaries that show work in progress, throughput, cycle time, aging, and overdue items. Optional AI support drafts titles, descriptions, sub-todos, and achievement summaries, using either your own Claude API key or a local model through Ollama.

- **Track work where it happens**: drag-and-drop board with custom columns, quick add, inline editing, and a side panel for details. No friction between work and tracking.
- **KPIs for manager talks**: throughput, cycle time, WIP, aging, overdue items, effort by task size, tracked time, and AI-drafted achievement summaries. Copy to Markdown for performance reviews or salary discussions.
- **Your data, your infrastructure**: run everything locally, or self-host on your own Cloudflare account and database. No shared service, no tracking, and AI only runs with your own key or your own local model.

## Features

**Board**
- Custom columns: add, rename, change kind (Open/Active/Done), reorder, hide, delete (tasks are moved to a column you choose).
- Moving tasks: drag and drop, Alt+Arrow keys, the card menu (Move up/down, Move to…), or the column select in the task panel.
- Inline editing of task title, project, and tags directly on the card.
- Projects shown as filled badges with a folder icon; tags as outline pills.
- Sub-todo checkboxes (tickable on card; full checklist in the task panel), and any sub-todo can be converted into its own task.
- Task links: mark tasks as blocking, related, or duplicates of each other; a blocked task shows an indicator on its card.
- Task size (XS/S/M/L/XL) as a rough effort estimate, from an hour or two up to more than a week.
- Task side panel: overlays the board on desktop without reflowing columns, full-screen on phones, deep-linkable at `/?task=<id>`. Every field saves automatically, and you can click through cards without closing it. Includes the task's activity history (column moves with timestamps).
- Search palette (⌘K / Ctrl+K): fuzzy search across titles, tags, projects, sub-todos, and descriptions.
- New tasks are created in a short dialog.
- Live sync: board changes made in another open tab appear automatically, and the board refetches when you switch back to its tab.
- Mobile: one column per screen with snap scrolling and column tabs to switch between them; long-press to drag a card.

**Time tracking**
- A timer per task, started or stopped from the card, the card menu, the task panel, or the header indicator. Only one timer runs at a time; starting another task's timer stops the previous one, and moving a task to a Done column stops its timer too.
- Entries under a minute are discarded rather than saved.
- A heartbeat keeps the running timer alive; if the computer sleeps or the browser closes, the timer stops itself about 10 minutes later, closed at the time of the last heartbeat, with a notice shown afterwards.
- Manual "Add time" for work you didn't track live, plus a list of entries with delete.

**KPIs**
- **WIP**: tasks in columns of kind Active.
- **Throughput (weekly)**: completed tasks per week (weeks start Monday, last 8 weeks).
- **Throughput (last 30 days)**: work completed in the last 30 days.
- **Throughput (this month)**: work completed since the start of the current month.
- **Cycle time (avg)**: average time from creation to completion.
- **Cycle time (median)**: median time from creation to completion.
- **Aging (WIP avg)**: average days Active tasks have spent in their current column.
- **Oldest open items**: top 5 non-done tasks by days in their current column.
- **Overdue**: tasks past deadline, excluding done items.
- **Project distribution**: task counts per project by column kind (Open / Active / Done).
- **Done (30d) effort / WIP effort**: task size totals (XS=1, S=2, M=4, L=8, XL=16) for work finished in the last 30 days and work currently in progress.
- **Unsized open work**: share of open/active tasks with no size set.
- **Weekly effort**: the same weekly throughput chart, shown by size weight instead of task count.
- **Tracked (30d)**: total tracked time in the last 30 days.
- **Avg time per done task, by size**: average tracked time per completed task for each size.
- **Done tasks without tracked time**: count of completed tasks with no time entries.
- Filter by project; copy Markdown summary for presentations.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/kpis-time-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/kpis-time-light.png">
    <img alt="Size and time KPIs" src="docs/screenshots/kpis-time-light.png" width="100%">
  </picture>
</p>

**AI** (optional)
- Improve task title: rewrite for clarity.
- Draft description: expand a quick idea into full context.
- Suggest sub-todos: break down a task into steps.
- Achievement summary: turn completed tasks into manager-ready bullet points.
- **Claude**: add your own Anthropic API key in Account → AI settings. The key is checked with Anthropic before saving, stored encrypted on the server, and never sent back to the browser. Requests run server-side on `claude-haiku-4-5`. Keys saved before this update must be re-entered once.
- **Ollama**: without a Claude key, AI features use a local Ollama model if one is running. In the Cloudflare deployment only Claude is available.

**Accounts and security**
- Username and password sign-in with encrypted, httpOnly session cookies. There is no public sign-up; accounts are created from the command line.
- Each account's projects, tags, columns, and tasks are private and checked on every request.
- Users can change their own password from the account menu, which signs out their other devices.
- In the Cloudflare deployment, logins are rate-limited, responses send strict security headers (CSP, HSTS, frame protection), and the app connects to the database through a least-privilege role.

**Design**
- Light, dark, and system theme (account menu).
- Header fits phone screens down to 360px.
- Targets WCAG 2.2 AA: card titles are buttons, Alt+Arrow moves a task between or within columns, a skip link jumps to the board, status changes are announced through a live region, focus outlines still show in Windows High Contrast (`forced-colors`), and `prefers-reduced-motion` turns off animations. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) for the full model and test status.
- Responsive layout: columns grow to fill free width (min 18rem, max 32rem).
- Brand palette with accessible color contrast; color never sole carrier of meaning.

## Requirements

- Node 24+
- pnpm
- Docker Desktop (local database)

## Quick start (local)

```bash
cp .env.example .env
# set NUXT_SESSION_PASSWORD and NUXT_ENCRYPTION_KEY in .env: openssl rand -base64 32
pnpm install
pnpm run db:up
pnpm run db:migrate
pnpm run user:add <name>   # create your account (prompts for a password)
pnpm run dev               # http://localhost:3000
```

Optional sample data: `pnpm run db:seed` fills a placeholder account named `owner`. Set its password with `pnpm run user:passwd owner` to sign in and look around. `pnpm run db:seed -- --reset` wipes and reseeds that account and is destructive.

**Optional: local AI**
```bash
ollama pull qwen3:8b   # model configurable via OLLAMA_MODEL in .env
```

Note: PostgreSQL is exposed on host port 5433 so it doesn't clash with a local Postgres on 5432.

## Deploy to Cloudflare

Scout runs on Cloudflare Workers with static assets, talks to a Postgres database (for example Supabase) through Hyperdrive, and can be served on your own domain. Accounts are managed with the same `user:add` / `user:passwd` scripts, pointed at the production database.

Setup, secrets, database role, and upgrade steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). After that, a release is:

```bash
pnpm run deploy
```

Apply new migrations to the production database before deploying code that depends on them. Migrations that add a new table also create its `scout_app` policies when that role already exists — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for details.

## Desktop app (macOS)

A native wrapper around scout.kauper.co (built with Tauri) that adds a menu bar timer: it shows the elapsed time for a running timer and lets you stop it without switching to the app.

Download the latest `.dmg` from [GitHub Releases](../../releases). The app is unsigned, so on first open macOS will block it — either go to System Settings → Privacy & Security → "Open Anyway", or run:

```bash
xattr -dr com.apple.quarantine /Applications/Scout.app
```

Build locally:

```bash
source ~/.cargo/env
cd desktop/src-tauri
cargo tauri build --bundles dmg
```

Release a new version: bump the version in `desktop/src-tauri/tauri.conf.json` and `desktop/src-tauri/Cargo.toml`, tag `desktop-vX.Y.Z`, push the tag, then publish the draft release that GitHub Actions creates.

Run against the local dev server instead of the live site:

```bash
SCOUT_URL=http://localhost:3000 cargo tauri dev
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm run dev` | Start the app at http://localhost:3000 |
| `pnpm run build` | Build for Node (local production build) |
| `pnpm run preview` | Preview the Node production build |
| `pnpm run build:cf` | Build for Cloudflare Workers |
| `pnpm run preview:cf` | Build for Workers and run it locally with `wrangler dev` |
| `pnpm run deploy` | Build for Workers and deploy with `wrangler deploy` |
| `pnpm run cf:types` | Generate Worker binding types |
| `pnpm run generate` | Generate a static site |
| `pnpm run postinstall` | Prepare Nuxt after install |
| `pnpm run db:up` | Start the PostgreSQL Docker container |
| `pnpm run db:down` | Stop the PostgreSQL Docker container |
| `pnpm run db:generate` | Generate Drizzle migrations from the schema |
| `pnpm run db:migrate` | Apply pending Drizzle migrations (uses `DATABASE_URL`) |
| `pnpm run db:seed` | Fill the `owner` account with sample data |
| `pnpm run db:studio` | Open Drizzle Studio |
| `pnpm run user:add` | Create a new account (prompts for a password) |
| `pnpm run user:passwd` | Set or reset an account's password |
| `pnpm run test` | Run the unit tests once |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:isolation` | Run the multi-user data isolation integration test |
| `pnpm run typecheck` | Check the TypeScript types |
| `pnpm run screenshots` | Capture README screenshots (needs a running app and `SCOUT_PASSWORD`) |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://scout:scout@localhost:5433/scout` | PostgreSQL connection string (local dev, migrations, user scripts) |
| `NUXT_SESSION_PASSWORD` | — | Session cookie encryption key, min 32 chars (required) |
| `NUXT_ENCRYPTION_KEY` | — | Encrypts per-user Claude API keys, min 32 chars (required for AI settings) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API endpoint; an empty value turns local AI off |
| `OLLAMA_MODEL` | `qwen3:8b` | Local model to use |

Generate keys with `openssl rand -base64 32`. In the Cloudflare deployment the two `NUXT_*` keys are Worker secrets, and the database connection comes from the Hyperdrive binding in `wrangler.jsonc`.

## Tech stack

- **Framework**: Nuxt 4.5 with Vue 3.5 and `<script setup lang="ts">`
- **UI**: shadcn-vue 2.x, reka-ui, and lucide icons
- **Styling**: Tailwind CSS v4 with CSS variable tokens
- **State**: Pinia with a setup-store approach
- **Drag and drop**: `vue-draggable-plus` based on SortableJS
- **Search**: Fuse.js fuzzy search over tasks
- **ORM**: Drizzle ORM 0.45 with drizzle-kit
- **Database**: PostgreSQL 17 (Docker on port 5433 locally; Supabase via Hyperdrive in production)
- **Auth**: `nuxt-auth-utils` sealed cookie sessions, PBKDF2 password hashes (WebCrypto)
- **Hosting**: Cloudflare Workers + Static Assets (Nitro preset `cloudflare_module`), Workers Rate Limiting for logins
- **AI**: Anthropic TypeScript SDK (`claude-haiku-4-5`) with per-user keys, or Ollama locally
- **Validation**: `zod` plus h3 validation helpers
- **Tests**: Vitest 5 in a Node environment
- **Screenshots**: Playwright (dev only, drives the app to capture README images)
- **Fonts**: `@fontsource-variable/geist` (bundled; no external requests)

## Project structure

```text
app/
  pages/index.vue            Board screen
  pages/login.vue            Sign-in
  middleware/auth.global.ts  Redirects signed-out users to /login
  assets/css/tailwind.css    Token and design system styles
  components/ui/**           shadcn-vue generated pieces
  components/board/*.vue     Board, columns, and cards
  components/task/*.vue      Task panel, create dialog, pickers
  components/kpi/*.vue       KPI panels and summaries
  components/common/*.vue    Account menu, AI settings, badges, search palette
  composables/               Task panel, AI, KPIs, live announcer
  plugins/                   Board live sync across tabs, timer ticker and heartbeat
  stores/board.ts            Pinia store for board state
shared/
  types/                     Domain types, DTOs, session type
  utils/                     Transitions, positions, dates, KPI logic, search, links, reorder, timer, sync scheduler
server/
  api/**                     API routes (auth, board, tasks, columns, AI, settings)
  middleware/auth.ts         Rejects /api requests without a valid session; also clears stale sessions on page requests
  utils/                     DB access, ownership checks, passwords, AI providers, key encryption
  plugins/                   Session guard, per-request DB cleanup
  db/schema.ts               Drizzle schema
  db/migrations/             Drizzle output
  db/seed.ts                 Sample data setup
scripts/
  user.ts                    Account admin (user:add, user:passwd)
  screenshots.ts             Captures the README screenshots with Playwright
  sql/app-role.sql           Least-privilege database role for production
tests/                       Unit and integration tests
wrangler.jsonc               Cloudflare Worker config
```

## Development notes

**TypeScript version**: `typescript` is pinned to `^6.0.3`. TypeScript 7 currently breaks `vue-tsc` as of September 2026, so avoid upgrading without testing.

**Theming**: See [docs/THEMING.md](docs/THEMING.md) for customizing colors, spacing, and brand palette. Token definitions live in `app/assets/css/tailwind.css`.

**Architecture**: See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design, domain model, API spec, and component hierarchy.

**Deployment**: See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Accessibility**: See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) for the WCAG 2.2 AA target, keyboard shortcuts, and test status.

**Workflow**: Claude Code agents and automation live in `CLAUDE.md` and `.claude/agents/`.

**Dependency overrides**: `pnpm-workspace.yaml` pins `decode-uri-component` and `@esbuild-kit/core-utils>esbuild` to patched versions (transitive deps of `shadcn-vue`/`vite` and `drizzle-kit`), and `patches/source-map-resolve@0.6.0.patch` fixes `source-map-resolve` calling the now-ESM-only `decode-uri-component` as a CJS function under Node 24 `require(esm)`. Don't remove these without re-checking the dependency tree (`pnpm why decode-uri-component` / `pnpm why esbuild`) for reintroduced vulnerable versions.

## License

MIT © 2026 Kai Kauper — see [LICENSE](LICENSE).
