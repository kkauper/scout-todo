<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/scout-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/scout-light.png">
  <img alt="Scout Logo" src="public/scout-light.png" width="1200">
</picture>

<div align="left">
  <img alt="Nuxt 4" src="https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white&style=for-the-badge" />
  <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white&style=for-the-badge" />
  <img alt="PostgreSQL 17" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white&style=for-the-badge" />
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black&style=for-the-badge" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white&style=for-the-badge" />
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-Local%20AI-8B5CF6?logo=ollama&logoColor=white&style=for-the-badge" />
</div>

Scout is a local-first personal Kanban board built to make work visible, measurable, and easier to explain in real conversations. It keeps your tasks in one place, gives you clear state transitions, and turns activity into evidence you can use for planning, reviews, and salary or manager discussions.

## Why Scout

This project started from a simple need: keep a board that feels lightweight, but still gives you hard numbers behind the work. It is designed for a single owner, not a team, so the focus is on clarity, speed, and reliable local data.

The app combines a drag-and-drop task board with KPI summaries that show work in progress, throughput, cycle time, aging, and overdue items. There is also optional local AI support through Ollama for title suggestions, descriptions, achievement summaries, and subtask ideas.

## Requirements

- Node 24+
- npm
- Docker Desktop

## Setup

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run db:seed          # sample data; refuses if tasks exist
npm run dev              # http://localhost:3000
```

If you want a clean reset, run `npm run db:seed -- --reset`. This wipes and reseeds the database and is destructive.

## Scripts

| Script | Purpose |
|---|---|
| `npm run build` | Build for production |
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run generate` | Generate a static site |
| `npm run preview` | Preview the production build |
| `npm run postinstall` | Prepare Nuxt after install |
| `npm run db:up` | Start the PostgreSQL Docker container |
| `npm run db:down` | Stop the PostgreSQL Docker container |
| `npm run db:generate` | Generate Drizzle migrations from the schema |
| `npm run db:migrate` | Apply pending Drizzle migrations |
| `npm run db:seed` | Fill the database with sample data |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run test` | Run the unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Check the TypeScript types |

## Tech stack

- **Framework**: Nuxt 4.5 with Vue 3.5 and `<script setup lang="ts">`
- **UI**: shadcn-vue 2.x, reka-ui, and lucide icons
- **Styling**: Tailwind CSS v4 with CSS variable tokens
- **State**: Pinia with a setup-store approach
- **Drag and drop**: `vue-draggable-plus` based on SortableJS
- **ORM**: Drizzle ORM 0.45 with drizzle-kit and `postgres` for the PostgreSQL driver
- **Validation**: `zod` plus h3 validation helpers
- **Database**: PostgreSQL 17 in Docker on port 5432
- **Tests**: Vitest 5 in a Node environment
- **Fonts**: `@fontsource-variable/geist`
- **Local AI**: Ollama endpoints with optional model-based suggestions and summaries

## Project layout

```text
app/
  pages/index.vue            Main screen
  assets/css/tailwind.css    Token and design system styles
  components/ui/**           shadcn-vue generated pieces
  components/board/*.vue     Board and card interactions
  components/task/*.vue      Task forms and pickers
  components/kpi/*.vue       KPI panels and summaries
  components/common/*.vue    Shared UI helpers and badges
  stores/board.ts            Pinia store for board state
  lib/utils.ts               shadcn `cn()` helper
shared/
  types/domain.ts            Domain types, states, colors, DTOs
  utils/                     Transitions, positions, dates, KPI logic
server/
  db/schema.ts               Drizzle schema
  db/migrations/             Drizzle output
  db/seed.ts                 Sample data setup
  api/**                     API routes
tests/unit/                  Vitest test coverage
```

## KPI evidence

The KPI panel shows the health of your work across the board. It includes:

- **WIP**: tasks in progress or review
- **Throughput (weekly)**: completed tasks by ISO week
- **Throughput (last 30 days)**: work completed in the last 30 days
- **Throughput (this month)**: work completed since the start of the current month
- **Cycle time (avg)**: average time from creation to completion
- **Cycle time (median)**: median time from creation to completion
- **Aging (WIP avg)**: average age of items still in progress
- **Overdue**: tasks past deadline, excluding done items
- **Project distribution**: counts by state, grouped by project

Use the Copy summary action in the KPI panel to export the metrics as Markdown.

## Database changes

To update the schema:

1. Edit `server/db/schema.ts`
2. Run `npm run db:generate`
3. Run `npm run db:migrate`

## Toolchain note

`typescript` is pinned to `^6.0.3`. TypeScript 7 currently breaks `vue-tsc` as of September 2026, so avoid upgrading without testing.

## Agents

The Claude Code workflow lives in `CLAUDE.md` and `.claude/agents/`.
