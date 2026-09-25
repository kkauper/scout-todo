import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

// Run from the repo root: pnpm tsx desktop/scripts/render-icons.ts
// Renders the app icon source (desktop/src-tauri/icons/source-1024.png) and the menu bar icon (tray.png).
// Afterwards regenerate the app icon set from desktop/src-tauri: `cargo tauri icon icons/source-1024.png`.
const FAVICON_PATH = resolve(process.cwd(), 'public/favicon.svg')
const ICONS_DIR = resolve(process.cwd(), 'desktop/src-tauri/icons')

const faviconSvg = readFileSync(FAVICON_PATH, 'utf-8')

const pathMatch = faviconSvg.match(/class="cls-1"\s+d="([^"]+)"/)
if (!pathMatch) throw new Error('Could not find glyph path (class="cls-1" d="...") in public/favicon.svg')
const glyphPath = pathMatch[1]

// macOS icon grid: 824 px rounded square centered on a 1024 canvas, corner radius ~22.5 %.
const APP_BG = '#1c1c1c'
const APP_GLYPH = '#ddfe5a'

async function renderAppIcon(): Promise<Buffer> {
  const size = 1024
  const tile = 824
  const margin = (size - tile) / 2
  const radius = 185
  const glyph = 520
  const glyphOffset = (size - glyph) / 2

  const html = `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; padding: 0; background: transparent }
      svg { display: block }
    </style>
  </head>
  <body>
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect x="${margin}" y="${margin}" width="${tile}" height="${tile}" rx="${radius}" ry="${radius}" fill="${APP_BG}"></rect>
      <svg x="${glyphOffset}" y="${glyphOffset}" width="${glyph}" height="${glyph}" viewBox="0 0 190.46 190.46">
        <path fill="${APP_GLYPH}" d="${glyphPath}"></path>
      </svg>
    </svg>
  </body>
</html>`

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(html)
    return await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  finally {
    await browser.close()
  }
}

async function renderTrayIcon(): Promise<Buffer> {
  const size = 44
  const glyphSize = 40
  const margin = (size - glyphSize) / 2

  const html = `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; padding: 0; background: transparent }
      #wrap { position: absolute; top: ${margin}px; left: ${margin}px; width: ${glyphSize}px; height: ${glyphSize}px }
      #wrap svg { display: block; width: 100%; height: 100% }
    </style>
  </head>
  <body>
    <div id="wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190.46 190.46">
        <path fill="#000000" d="${glyphPath}"></path>
      </svg>
    </div>
  </body>
</html>`

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(html)
    return await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  finally {
    await browser.close()
  }
}

async function main() {
  mkdirSync(ICONS_DIR, { recursive: true })

  const appIcon = await renderAppIcon()
  writeFileSync(resolve(ICONS_DIR, 'source-1024.png'), appIcon)
  console.log('Wrote desktop/src-tauri/icons/source-1024.png')

  const trayIcon = await renderTrayIcon()
  writeFileSync(resolve(ICONS_DIR, 'tray.png'), trayIcon)
  console.log('Wrote desktop/src-tauri/icons/tray.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
