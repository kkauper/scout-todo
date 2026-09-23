# M6-D — GitHub README + MIT license

Executor: `quick-executor` (haiku). Exactly 2 files: `README.md` (rewrite), `LICENSE` (new). Touch nothing else.
Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
Audience: GitHub visitors (developers evaluating/using the tool) and the owner. English. Scannable, no marketing fluff, no emojis.
Read for facts first: current `README.md` (keep its accurate setup/scripts/iCloud/toolchain facts), `package.json`, `.env.example`, `docker-compose.yml`, `docs/ARCHITECTURE.md`, `docs/THEMING.md`, `LICENSE` requirements below. State only facts present in those files.

## LICENSE

Standard MIT license text, first line `MIT License`, copyright line exactly: `Copyright (c) 2026 Kai Kauper`.

## README.md structure

1. Centered logo, theme-aware (GitHub supports `<picture>`):
   ```html
   <p align="center">
     <picture>
       <source media="(prefers-color-scheme: dark)" srcset="public/scout-dark.png">
       <source media="(prefers-color-scheme: light)" srcset="public/scout-light.png">
       <img alt="Scout" src="public/scout-light.png" width="420">
     </picture>
   </p>
   ```
   Then centered one-liner: "A local-first Kanban board that turns your daily work into evidence for performance and salary conversations." + badges line as plain text links is NOT needed — skip badges.
2. Screenshot, theme-aware, same `<picture>` pattern with `docs/screenshots/board-dark.png` / `docs/screenshots/board-light.png` (width 100%), then a second one for the KPI drawer `docs/screenshots/kpis-dark.png` / `kpis-light.png`.
3. `## Why` — 3 short bullets: track work where it happens; KPIs (throughput, cycle time, WIP, aging, overdue) + AI achievement summary for manager talks; everything stays on your machine (Postgres in Docker, optional local LLM via Ollama).
4. `## Features` — grouped bullets: Board (custom columns with Open/Active/Done types, hide/rename/reorder, drag & drop, inline title/project/tag editing, sub-todos tickable on the card, quick add, click card for details, history of column changes); KPIs (list metrics with one-line definitions from ARCHITECTURE KPI section; per project filter; copy Markdown summary); Local AI (improve title, draft description, suggest sub-todos, achievement summary; optional, disabled when Ollama is not running); Design (light/dark/system theme, brand palette, shadcn-vue + Tailwind v4, keyboard accessible).
5. `## Quick start` — requirements + exact commands (from current README) + optional AI block:
   ```bash
   # optional: local AI
   ollama pull qwen3:8b   # model configurable via OLLAMA_MODEL in .env
   ```
   Note on port 5433. Note `npm run db:seed -- --reset` wipes data.
6. `## Scripts` — table (from current README; verify names against package.json).
7. `## Configuration` — table of `.env` variables from `.env.example` with meaning.
8. `## Tech stack` — compact bullets.
9. `## Project structure` — short tree.
10. `## Development notes` — iCloud xattr note, TS pin note, theming → link `docs/THEMING.md`, architecture → `docs/ARCHITECTURE.md`, agent workflow → `CLAUDE.md` + `.claude/agents/`.
11. `## License` — "MIT © 2026 Kai Kauper — see [LICENSE](LICENSE)."

## Verify

Re-read both files. Every script name exists in package.json; every referenced file path exists (use Glob): `public/scout-dark.png`, `public/scout-light.png`, `docs/screenshots/*.png`, `docs/THEMING.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md`. Report missing ones as open question (do not create them).
