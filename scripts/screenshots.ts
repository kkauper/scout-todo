import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { BoardData, Task } from '../shared/types/domain'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const SCOUT_USER = process.env.SCOUT_USER ?? 'owner'
const SCOUT_PASSWORD = process.env.SCOUT_PASSWORD

if (!SCOUT_PASSWORD) {
  console.error('SCOUT_PASSWORD not set. Usage: SCOUT_PASSWORD=... pnpm screenshots')
  process.exit(1)
}

const OUT_DIR = resolve(process.cwd(), 'docs/screenshots')
mkdirSync(OUT_DIR, { recursive: true })

const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]

// Also hides the Nuxt DevTools badge that the dev server injects.
const NO_ANIMATION_CSS = '*{transition:none!important;animation:none!important}#nuxt-devtools-container,nuxt-devtools-frame{display:none!important}'

const written: string[] = []

async function login(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: SCOUT_USER, password: SCOUT_PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`Login failed (${res.status()}): ${await res.text()}`)
  }
}

async function fetchBoard(context: BrowserContext): Promise<BoardData> {
  const res = await context.request.get(`${BASE_URL}/api/board`)
  if (!res.ok()) {
    throw new Error(`GET /api/board failed (${res.status()})`)
  }
  return (await res.json()) as BoardData
}

// First task in an "active" column that has a size, tracked time and at least one link, so the
// board screenshot shows off size, links, checklist progress and tracked time at once.
function pickDemoTask(board: BoardData): Task {
  const activeColumnIds = new Set(board.columns.filter(c => c.kind === 'active').map(c => c.id))
  const linkedTaskIds = new Set<string>()
  for (const link of board.links) {
    linkedTaskIds.add(link.fromTaskId)
    linkedTaskIds.add(link.toTaskId)
  }
  const match = board.tasks.find(t =>
    activeColumnIds.has(t.columnId)
    && t.size !== null
    && (board.timeTotals[t.id] ?? 0) > 0
    && linkedTaskIds.has(t.id),
  )
  if (!match) {
    throw new Error(
      'No active task with size, tracked time and a link found. Run "pnpm db:seed -- --reset" first.',
    )
  }
  return match
}

// The word (≥5 letters) that appears in the most seeded task titles, so the search
// screenshot shows several results.
function pickSearchQuery(board: BoardData): string {
  const counts = new Map<string, number>()
  for (const task of board.tasks) {
    const words = new Set(task.title.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, '')).filter(w => w.length >= 5))
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!best) throw new Error('No seeded task title has a word with 5+ letters.')
  return best[0]
}

async function prepare(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: NO_ANIMATION_CSS })
}

async function newThemedContext(
  browser: Browser,
  theme: Theme,
  viewport: { width: number; height: number },
  extra: Record<string, unknown> = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport,
    colorScheme: theme,
    ...extra,
  })
  await context.addInitScript((t: string) => {
    try {
      window.localStorage.setItem('vueuse-color-scheme', t)
    }
    catch {
      // localStorage unavailable (e.g. private mode) — theme falls back to system preference.
    }
  }, theme)
  return context
}

async function shoot(page: Page, name: string): Promise<void> {
  const file = resolve(OUT_DIR, name)
  await page.screenshot({ path: file })
  written.push(file)
}

async function boardShot(browser: Browser, theme: Theme): Promise<void> {
  const context = await newThemedContext(browser, theme, { width: 1600, height: 1000 }, { deviceScaleFactor: 2 })
  await login(context)
  const board = await fetchBoard(context)
  const demoTask = pickDemoTask(board)

  await context.request.post(`${BASE_URL}/api/tasks/${demoTask.id}/timer`)

  const page = await context.newPage()
  await page.goto(`${BASE_URL}/?task=${demoTask.id}`)
  await page.locator('aside[aria-labelledby="task-panel-title"]').waitFor({ state: 'visible' })
  await prepare(page)
  await page.waitForTimeout(3000)
  await shoot(page, `board-${theme}.png`)

  await context.request.delete(`${BASE_URL}/api/timer`)
  await context.close()
}

async function searchShot(browser: Browser, theme: Theme): Promise<void> {
  const context = await newThemedContext(browser, theme, { width: 1600, height: 1000 }, { deviceScaleFactor: 2 })
  await login(context)
  const board = await fetchBoard(context)
  const query = pickSearchQuery(board)

  const page = await context.newPage()
  await page.goto(BASE_URL)
  await prepare(page)

  await page.keyboard.press('Meta+K')
  const searchInput = page.getByPlaceholder('Search tasks, checklists, projects, tags…')
  await searchInput.waitFor({ state: 'visible' })
  await searchInput.fill(query)
  await page.locator('[data-slot="command-item"]').first().waitFor({ state: 'visible' })
  await shoot(page, `search-${theme}.png`)

  await context.close()
}

async function kpisShot(browser: Browser, theme: Theme): Promise<void> {
  const context = await newThemedContext(browser, theme, { width: 1600, height: 1000 }, { deviceScaleFactor: 2 })
  await login(context)

  const page = await context.newPage()
  await page.goto(BASE_URL)
  await prepare(page)

  await page.getByRole('button', { name: 'KPIs' }).click()
  const timeHeading = page.getByRole('heading', { name: 'Time', level: 3 })
  await timeHeading.waitFor({ state: 'visible' })
  await shoot(page, `kpis-${theme}.png`)

  await timeHeading.scrollIntoViewIfNeeded()
  await shoot(page, `kpis-time-${theme}.png`)

  await context.close()
}

async function mobileShot(browser: Browser, theme: Theme): Promise<void> {
  const context = await newThemedContext(browser, theme, { width: 390, height: 844 }, {
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  await login(context)

  const page = await context.newPage()
  await page.goto(BASE_URL)
  await page.getByRole('navigation', { name: 'Columns' }).waitFor({ state: 'visible' })
  await prepare(page)
  await shoot(page, `mobile-${theme}.png`)

  await context.close()
}

async function main(): Promise<void> {
  let browser: Browser
  try {
    browser = await chromium.launch()
  }
  catch (err) {
    console.error('Failed to launch Chromium:', err instanceof Error ? err.message : err)
    console.error('Hint: run "pnpm exec playwright install chromium" and try again.')
    process.exit(1)
  }

  try {
    for (const theme of THEMES) {
      await boardShot(browser, theme)
      await searchShot(browser, theme)
      await kpisShot(browser, theme)
      await mobileShot(browser, theme)
    }
  }
  finally {
    await browser.close()
  }

  console.log('Wrote screenshots:')
  for (const file of written) console.log(`  ${file}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
