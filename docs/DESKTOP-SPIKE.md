# DT-1 Desktop spike (Tauri v2, macOS)

Minimal Tauri v2 shell that loads the live site `https://scout.kauper.co` in a
native window, builds an ad-hoc-signed `.dmg` locally, and exposes one test
command (`ping`) to the remote origin to prove webview→Rust IPC works under
the site's CSP. No tray, updater, or CI yet.

## What was built

- `desktop/src-tauri/Cargo.toml` — crate `scout-desktop` (lib `scout_desktop_lib`), Tauri 2 with `devtools` feature enabled.
- `desktop/src-tauri/.cargo/config.toml` — routes Cargo's build output to `target.nosync` (repo is in iCloud Drive; `.nosync` keeps build artifacts out of iCloud sync).
- `desktop/src-tauri/build.rs` — declares the `ping` app command so Tauri generates the `allow-ping` permission.
- `desktop/src-tauri/src/lib.rs` — the `ping` command (`#[tauri::command] fn ping() -> &'static str { "pong" }`) and the `run()` entry point.
- `desktop/src-tauri/src/main.rs` — binary entry point, calls `scout_desktop_lib::run()`.
- `desktop/src-tauri/tauri.conf.json` — app config: window loads `https://scout.kauper.co`, `security.csp` disabled (site sends its own CSP headers), bundle targets `app` + `dmg`, ad-hoc signing (`signingIdentity: "-"`).
- `desktop/src-tauri/capabilities/remote.json` — capability `remote-scout`, scoped to window `main` and remote origin `https://scout.kauper.co`, grants only `allow-ping`.
- `desktop/offline/index.html` — placeholder page for the required `frontendDist` build target; not wired up to any offline fallback logic yet.
- `desktop/src-tauri/icons/` — generated app icons (macOS/Windows/iOS/Android sizes), sourced from `public/scout-logo.svg`.
- Root `.gitignore` — added `desktop/src-tauri/target.nosync` under a new `# Tauri desktop` heading.

### How to build

```sh
source "$HOME/.cargo/env"
cd desktop/src-tauri
cargo tauri build --bundles dmg
```

DMG output: `desktop/src-tauri/target.nosync/release/bundle/dmg/Scout_0.1.0_aarch64.dmg`

## Automated results

- **Build (step 10):** `cargo tauri build --bundles dmg` succeeded on the first run (no prior incremental cache). Output: `Scout_0.1.0_aarch64.dmg`, **3.1 MB**. Only warning: notarization was skipped (no Apple ID/API key env vars set), expected for a local ad-hoc-signed spike build.
- **Smoke check (step 11):** Tauri's `bundle_dmg.sh` step removes the standalone `.app` from `target.nosync/release/bundle/macos/` after folding it into the DMG (only the DMG remains on disk). To smoke-test, the `.app` was mounted from the built DMG, copied out, and launched with `open`. After ~10s, `pgrep -fl` confirmed the process `Scout-smoketest.app/Contents/MacOS/scout-desktop` was running. `pkill -f ".../Contents/MacOS"` stopped it cleanly (no longer listed by `pgrep` afterward). Result: **pass**.

## Manual checks

1. App opens scout.kauper.co; login works. — *(result: pass)*
2. Quit (⌘Q) and reopen → still logged in. — *(result: pass — session cookie persists across restart)*
3. Right-click → Inspect Element → Console: `await window.__TAURI_INTERNALS__.invoke('ping')` returns `"pong"`. Note any CSP error shown in the console. — *(result: pass — `"pong"` via postMessage fallback; CSP blocked `ipc://localhost` (`connect-src 'self'`). Fixed by adding `ipc: http://ipc.localhost` to `connect-src` in nuxt.config.ts; takes effect after the next web deploy)*
4. Start a timer, hide the app (⌘H) for 15+ minutes, come back → timer still running, no "stopped — no activity" notice. — *(result: pass — timer kept running while hidden)*
5. Installing the dmg copy: drag to /Applications, first open → macOS blocks (unsigned). Allow via System Settings → Privacy & Security → "Open Anyway", or `xattr -dr com.apple.quarantine /Applications/Scout.app`. — *(result: n/a — dmg built locally, no quarantine flag)*

## Known limits

- No tray.
- No updater.
- No offline fallback (the `desktop/offline/index.html` placeholder is not wired up).
- Devtools enabled (needed for the manual IPC check in this spike; remove before shipping).
- External links open inside the app (no `_blank`/external-browser handling yet).
