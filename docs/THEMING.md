# Theming Guide

## Where Tokens Live

All color and spacing tokens live in `app/assets/css/tailwind.css`:

- **Semantic tokens** (`:root` and `.dark`): `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--accent`, `--accent-foreground`, `--muted`, `--muted-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--chart-1` through `--chart-5`, sidebar variants. Defined in OKLch color space.
- **`@theme inline`** block: maps semantic token CSS variables to Tailwind utilities (e.g., `--color-primary`, `--radius`).
- **Project/tag palette**: 10 `--swatch-*` keys in `:root` for project and tag colors.

## Change the Base Look

Edit the oklch values of semantic tokens in `app/assets/css/tailwind.css`:

- Light theme: `:root { --background: ..., --foreground: ..., --primary: ..., etc. }`
- Dark theme: `.dark { --background: ..., --foreground: ..., etc. }`

Adjust corner radius via `--radius` (default `0.625rem`); all radius scales derive from it.

For fonts, import a `@fontsource-variable/` package and set `--font-sans` in the `@theme inline` block. Scout uses Geist; no Google Fonts due to offline requirement.

## Project/Tag Palette

Projects and tags each have a `color` field: one of 10 keys. The palette is defined in `app/assets/css/tailwind.css` as `--swatch-<key>` variables:

- `slate`, `red`, `orange`, `amber`, `green`, `teal`, `blue`, `indigo`, `violet`, `pink`

To change a swatch color, edit its oklch value in the CSS file.

To add a new color:

1. Add the key to `COLOR_KEYS` in `shared/types/domain.ts`
2. Add a `--swatch-<key>` variable in `:root` of `app/assets/css/tailwind.css`

Both steps are required; the server validates color assignments against `COLOR_KEYS`.

## Brand Palette

| Token | Hex | Use |
|---|---|---|
| Lime | `#ddfe5a` | main brand accent — ONLY on dark surfaces |
| Ink | `#1c1c1c` | text light mode; background dark mode; primary surface light mode |
| Stone | `#d7d6cc` | borders, secondary surfaces |
| Paper | `#e8e8dd` | light background; text dark mode |

**Rule: lime is only ever used on a dark surface** (dark-mode background, or the ink-colored primary button in light mode). It never appears as a background or text color on a light surface.

These are exposed as unthemed CSS variables in `:root` (`--brand-lime`, `--brand-ink`, `--brand-stone`, `--brand-paper`) and mapped to Tailwind utilities in `@theme inline` (`--color-brand-lime`, etc. → `bg-brand-lime`, `text-brand-lime`, ...). They do not change between light and dark mode.

Light mode maps `--background`/`--foreground` to Paper/Ink, with `--primary`/`--primary-foreground` as Ink/Lime (the primary button is a dark surface, so lime-on-ink is allowed). Dark mode maps `--background`/`--foreground` to Ink/Paper, with `--primary`/`--primary-foreground` as Lime/Ink. `--secondary`/`--accent`/`--border` use Stone-derived tones in light mode and dark-neutral tones in dark mode.

## Dark Mode

Apply the `.dark` class to `<html>` to swap all semantic tokens (defined in `.dark { ... }` block). Swatches are shared across light and dark modes.

`ColorModeToggle` (`app/components/common/ColorModeToggle.vue`) is a header dropdown (Light / Dark / System) built on `useColorMode({ emitAuto: true })` from `@vueuse/core`. It persists the choice to `localStorage['vueuse-color-scheme']` (values `light` / `dark` / `auto`) and toggles the `dark` class on `<html>`.

To avoid a flash of the wrong theme on load, `nuxt.config.ts` injects a small inline `<head>` script that reads `vueuse-color-scheme` from `localStorage` (falling back to `auto`/system preference) and applies the `dark` class before Vue hydrates.

## Logo

`app/components/common/ScoutLogo.vue` inlines the Scout wordmark SVG (source of truth: `public/scout-logo.svg`), using `fill="currentColor"` so it follows `text-*` color utilities (e.g. `text-foreground dark:text-brand-lime`). It accepts a `class` passthrough and a `decorative` boolean prop: when `decorative` is false (default) the SVG renders `role="img"` + `aria-label="Scout"`; when `decorative` is true it renders `aria-hidden="true"` instead, for use alongside visible/`sr-only` text (as in the page header `<h1>`).

## Overlays

Modal (`DialogOverlay.vue`) and drawer (`SheetOverlay.vue`, and the alert-dialog overlay) share one overlay look: `bg-black/20 supports-backdrop-filter:backdrop-blur-sm` plus the standard fixed/inset/z-50/fade transition classes. Keep these three in sync if the overlay style changes.

## shadcn-vue Components

Components live in `app/components/ui/**`, copied into the repo (not a dependency). Style is set to `reka-nova` in `components.json`.

To add a new shadcn component:

```bash
npx shadcn-vue@latest add <component-name>
```

To update an existing component, re-add it with overwrite:

```bash
npx shadcn-vue@latest add <component-name>
```

Then re-apply any local edits by diffing before and after.

Prefer changing semantic tokens over editing component classes. shadcn components consume CSS variables, so token adjustments cascade.

## Conventions

1. **Color is never the sole carrier of meaning.** Badges always include text; overdue indicators show text + icon.
2. **Use `cn()`** from `app/lib/utils.ts` for class merging in component props.
3. **App components** (non-shadcn, non-UI) live in `app/components/{board,task,kpi,common}`:
   - `board/`: KanbanBoard, BoardColumn, TaskCard, QuickAddTask
   - `task/`: TaskDialog, ProjectPicker, TagPicker, DeadlinePicker
   - `kpi/`: KpiPanel, KpiStat, KpiStateBar, ThroughputBars
   - `common/`: ColorBadge, ColorPicker
