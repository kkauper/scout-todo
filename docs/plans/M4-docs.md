# M4-A — README + theming guide

Executor: `quick-executor` (haiku). Exactly 2 files: `README.md` (root), `docs/THEMING.md`. Touch nothing else.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Read for facts first: `package.json` (scripts), `docker-compose.yml`, `.env.example`, `nuxt.config.ts`, `components.json`, `app/assets/css/tailwind.css`, `docs/ARCHITECTURE.md`. Only state facts that appear in those files. Audience: the owner (Vue/Nuxt dev, design-system background). English. Concise.

## README.md sections

1. `# Scout` + one line: local-first personal Kanban with KPI evidence for manager/salary conversations.
2. **Requirements**: Node 24+, npm, Docker Desktop.
3. **Setup** (numbered, exact commands):
   ```bash
   cp .env.example .env
   npm install
   npm run db:up
   npm run db:migrate
   npm run db:seed          # sample data; refuses if tasks exist
   npm run dev              # http://localhost:3000
   ```
   Note: DB listens on host port 5433 (5432 used by another project). `npm run db:seed -- --reset` wipes and reseeds (destructive).
4. **Scripts** table — every script in package.json with one-line purpose.
5. **Stack** — bullet list from ARCHITECTURE §Stack (one line each).
6. **Project layout** — short tree (copy top-level of ARCHITECTURE §Directory layout, trimmed).
7. **KPIs** — list each metric with one-line definition (from ARCHITECTURE §KPIs: WIP, throughput weekly/30d/month, cycle time avg/median, aging, overdue, project distribution). Mention "Copy summary" button in KPI panel produces Markdown.
8. **Schema changes** — edit `server/db/schema.ts` → `npm run db:generate` → `npm run db:migrate`.
9. **iCloud note** — `node_modules`, `.nuxt`, `.output` carry xattr `com.apple.fileprovider.ignore#P`; after deleting/recreating them run:
   ```bash
   for d in node_modules .nuxt .output; do xattr -w 'com.apple.fileprovider.ignore#P' 1 "$d"; done
   ```
10. **Toolchain note** — `typescript` pinned to ^6.0.3 (TS 7 breaks vue-tsc as of Sep 2026).
11. **Agents** — one line: development workflow for Claude Code agents lives in `CLAUDE.md` and `.claude/agents/`.

## docs/THEMING.md sections

1. **Where tokens live** — `app/assets/css/tailwind.css`: shadcn semantic tokens (`--background`, `--primary`, … in `:root` and `.dark`), `@theme inline` mapping to Tailwind utilities, `--swatch-*` palette for projects/tags.
2. **Change the base look** — edit oklch values of semantic tokens; `--radius` for corners; font via `@fontsource-variable/*` import + `--font-sans` (no Google Fonts: offline requirement).
3. **Project/tag palette** — list the 10 `--swatch-*` keys; to change a color edit the var; to add a color: add key to `COLOR_KEYS` in `shared/types/domain.ts` AND a `--swatch-<key>` var (both required; server validation uses `COLOR_KEYS`).
4. **Dark mode** — `.dark` class on `<html>` swaps semantic tokens (`@custom-variant dark`); swatches shared. (No toggle UI yet.)
5. **shadcn-vue components** — live in `app/components/ui/**`, owned by the repo (copied, not a dependency). Style = `components.json` style value. Add new: `npx shadcn-vue@latest add <name>`. Update existing: re-add with overwrite, then re-apply local edits (diff first). Prefer changing tokens over editing component classes.
6. **Conventions** — color never sole meaning carrier (badges keep text); use `cn()` from `app/lib/utils.ts` for class merging; app components in `app/components/{board,task,kpi,common}`.

## Verify

Re-read both files; every command/script name must exist in package.json. Report.
