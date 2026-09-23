# M6-C — Brand theme, logo, dark mode, overlays, drawer width

Executor: `executor` (sonnet). Root: `/Users/kaikauper/Library/Mobile Documents/com~apple~CloudDocs/02 – Projekte/Scout` (quote path).
You own ONLY: `app/assets/css/tailwind.css`, `app/app.vue`, `nuxt.config.ts`, `app/pages/index.vue` (header + Sheet only), `app/components/common/ScoutLogo.vue` (new), `app/components/common/ColorModeToggle.vue` (new), `app/components/ui/sheet/SheetOverlay.vue`, `app/components/ui/dialog/DialogOverlay.vue`, `app/components/ui/alert-dialog/AlertDialogOverlay.vue` (if it exists; else the file in `ui/alert-dialog/` that renders the overlay), `docs/THEMING.md`.
A parallel agent rewrites `shared/**` + `server/**` (tasks get `columnId` instead of `state`) — `app/**` will show type errors from that; not yours. Your verification is visual + targeted (below), not full typecheck.

## Brand

| Token | Hex | Use |
|---|---|---|
| Lime | `#ddfe5a` | main brand accent — ONLY on dark surfaces |
| Ink | `#1c1c1c` | text light mode; background dark mode; primary surface light mode |
| Stone | `#d7d6cc` | borders, secondary surfaces |
| Paper | `#e8e8dd` | light background; text dark mode |

## Steps

1. `tailwind.css` — replace the values of shadcn semantic tokens (keep variable names, keep `@theme inline` mapping):
   - `:root` (light): `--background: #e8e8dd; --foreground: #1c1c1c; --card: #f4f4ee; --card-foreground: #1c1c1c; --popover: #f4f4ee; --popover-foreground: #1c1c1c; --primary: #1c1c1c; --primary-foreground: #ddfe5a; --secondary: #d7d6cc; --secondary-foreground: #1c1c1c; --muted: #deddd2; --muted-foreground: #5c5b55; --accent: #d7d6cc; --accent-foreground: #1c1c1c; --border: #d0cfc4; --input: #c9c8bd; --ring: #1c1c1c;` (keep `--destructive`, `--radius`, chart and sidebar vars as they are, but set `--sidebar*` equivalents to the same values as background/foreground/primary where they exist).
   - `.dark`: `--background: #1c1c1c; --foreground: #e8e8dd; --card: #252524; --card-foreground: #e8e8dd; --popover: #252524; --popover-foreground: #e8e8dd; --primary: #ddfe5a; --primary-foreground: #1c1c1c; --secondary: #2f2f2d; --secondary-foreground: #e8e8dd; --muted: #2a2a28; --muted-foreground: #a3a298; --accent: #2f2f2d; --accent-foreground: #e8e8dd; --border: #383836; --input: #41413e; --ring: #ddfe5a;`
   - Add brand tokens to `:root` (not themed): `--brand-lime: #ddfe5a; --brand-ink: #1c1c1c; --brand-stone: #d7d6cc; --brand-paper: #e8e8dd;` and map in `@theme inline`: `--color-brand-lime: var(--brand-lime);` etc.
   - Swatches unchanged.
2. **Color mode** — `app/components/common/ColorModeToggle.vue`: `const mode = useColorMode({ emitAuto: true })` from `@vueuse/core` (default storage key `vueuse-color-scheme`, adds `dark` class to `<html>`). DropdownMenu, trigger = ghost icon Button (`Sun` / `Moon` / `Monitor` icon by current `mode.store`), `aria-label="Theme"`; items Light / Dark / System (`DropdownMenuRadioGroup` bound to `mode.store` with values `light`/`dark`/`auto`).
   Anti-flash: `nuxt.config.ts` `app.head.script: [{ innerHTML: "(function(){try{var m=localStorage.getItem('vueuse-color-scheme')||'auto';var d=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()", tagPosition: 'head' }]`. Keep existing config keys.
   `app/app.vue`: unchanged except nothing needed (toggle lives in header). If hydration warning about `class` on html appears, ignore (report).
3. **Logo** — `app/components/common/ScoutLogo.vue`: inline the SVG from `public/scout-logo.svg` verbatim (read it; it uses `fill="currentColor"`), root `<svg ... role="img" aria-label="Scout" class="h-5 w-auto">` accepting `class` passthrough. In `index.vue` header replace the text `Scout` inside `<h1>` with `<ScoutLogo class="h-5 w-auto text-foreground dark:text-brand-lime" />` (h1 keeps `class="font-semibold"`, add `<span class="sr-only">Scout</span>` and give the svg `aria-hidden="true"` instead of role/label in this usage — support an `decorative` boolean prop that switches between the two).
   Also: favicon — leave as is.
4. **Header** — `index.vue`: add `<ColorModeToggle />` right of the KPIs button. Header background `bg-background/80 backdrop-blur` + `border-b`. Primary buttons now render ink/lime automatically.
5. **Overlays** — same look for modal and drawer: set the overlay class string in `SheetOverlay.vue`, `DialogOverlay.vue`, and the alert-dialog overlay to exactly: `bg-black/20 supports-backdrop-filter:backdrop-blur-sm fixed inset-0 z-50 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0` (keep `isolate` if the file had it).
6. **Drawer width** — `index.vue` SheetContent class: `gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:w-[50vw] data-[side=right]:sm:min-w-[40rem] data-[side=right]:sm:max-w-none`.
7. `docs/THEMING.md`: add section "Brand palette" (table above, lime-only-on-dark rule, how light/dark map to tokens, the ColorModeToggle + anti-flash script, logo component). Update overlay note.
8. Verify (report each):
   - `npx nuxi build` must still compile CSS/Vue for your files. Because `app/**` may have type errors from the parallel backend change, a build failure caused by `state`/`columnId` in other files is NOT yours — report the first error line. Re-apply `.output` xattr after any build.
   - Browser (Playwright, `chromium.launch({ channel: 'chrome' })`, script in `/private/tmp/claude-501/-Users-kaikauper-Library-Mobile-Documents-com-apple-CloudDocs-02---Projekte-Scout/cc18d4f2-c0fc-4a54-a724-fb381e8e8496/scratchpad/e2e/theme.mjs`, dev server `http://localhost:3100` — may be broken by the parallel backend change; if the board page errors, test on a minimal check: page loads, header visible): computed `background-color` of body in light = rgb(232, 232, 221); set `localStorage['vueuse-color-scheme']='dark'` + reload → `html.dark` present, body bg rgb(28, 28, 28), logo svg color rgb(221, 254, 90); KPI drawer width at viewport 1600 = 800 px. Screenshots `theme-light.png`, `theme-dark.png` in that dir. Include outputs.
