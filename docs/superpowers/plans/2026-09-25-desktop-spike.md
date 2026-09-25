# DT-1 Desktop spike (Tauri v2, macOS)

Goal: minimal Tauri v2 shell that loads the live site `https://scout.kauper.co`, builds an ad-hoc-signed `.dmg` locally, and exposes one test command (`ping`) to the remote origin so we can prove the webview→Rust IPC works under the site's CSP. No tray, updater or CI yet.

Toolchain is installed: Rust via rustup (`source "$HOME/.cargo/env"` before cargo commands) and `cargo tauri` (Tauri CLI v2). No JS package for the desktop app — do **not** touch the root `package.json` or `pnpm-workspace.yaml`.

Repo lives in iCloud Drive → Cargo's build output must go to a folder ending in `.nosync` so iCloud doesn't sync gigabytes of build artifacts.

---

## Steps

1. Create `desktop/src-tauri/Cargo.toml`:
   ```toml
   [package]
   name = "scout-desktop"
   version = "0.1.0"
   description = "Scout desktop app"
   edition = "2021"

   [lib]
   name = "scout_desktop_lib"
   crate-type = ["staticlib", "cdylib", "rlib"]

   [build-dependencies]
   tauri-build = { version = "2", features = [] }

   [dependencies]
   tauri = { version = "2", features = ["devtools"] }
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   ```
   (`devtools` keeps the Web Inspector in release builds — needed for the manual IPC check; will be removed after the spike.)

2. `desktop/src-tauri/.cargo/config.toml`:
   ```toml
   [build]
   target-dir = "target.nosync"
   ```

3. `desktop/src-tauri/build.rs` — declare the app command so Tauri generates an `allow-ping` permission:
   ```rust
   fn main() {
       tauri_build::try_build(
           tauri_build::Attributes::new()
               .app_manifest(tauri_build::AppManifest::new().commands(&["ping"])),
       )
       .expect("failed to run tauri-build");
   }
   ```

4. `desktop/src-tauri/src/lib.rs`:
   ```rust
   /// Spike-only IPC probe: proves the remote page can reach Rust.
   #[tauri::command]
   fn ping() -> &'static str {
       "pong"
   }

   #[cfg_attr(mobile, tauri::mobile_entry_point)]
   pub fn run() {
       tauri::Builder::default()
           .invoke_handler(tauri::generate_handler![ping])
           .run(tauri::generate_context!())
           .expect("error while running tauri application");
   }
   ```
   `desktop/src-tauri/src/main.rs`:
   ```rust
   #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

   fn main() {
       scout_desktop_lib::run()
   }
   ```

5. `desktop/src-tauri/tauri.conf.json`:
   ```json
   {
     "$schema": "https://schema.tauri.app/config/2",
     "productName": "Scout",
     "version": "0.1.0",
     "identifier": "co.kauper.scout",
     "build": { "frontendDist": "../offline" },
     "app": {
       "windows": [
         {
           "label": "main",
           "title": "Scout",
           "url": "https://scout.kauper.co",
           "width": 1280,
           "height": 800,
           "minWidth": 900,
           "minHeight": 600,
           "backgroundThrottling": "disabled"
         }
       ],
       "security": { "csp": null }
     },
     "bundle": {
       "active": true,
       "targets": ["app", "dmg"],
       "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
       "macOS": { "signingIdentity": "-" }
     }
   }
   ```
   If the schema rejects `backgroundThrottling` (older tauri version resolved), note it as a deviation and remove only that key.

6. `desktop/src-tauri/capabilities/remote.json` — the remote origin gets **only** `ping`:
   ```json
   {
     "$schema": "../gen/schemas/desktop-schema.json",
     "identifier": "remote-scout",
     "description": "IPC allowed from the live Scout site (spike: ping only)",
     "windows": ["main"],
     "remote": { "urls": ["https://scout.kauper.co"] },
     "permissions": ["allow-ping"]
   }
   ```
   No other capability files.

7. `desktop/offline/index.html` — tiny placeholder (required `frontendDist`, not wired up yet): `<!doctype html>`, `<html lang="en">`, `<title>Scout</title>`, body text "Scout couldn't be reached. Check your connection and restart the app." No scripts.

8. Icons: from `desktop/src-tauri` run `cargo tauri icon ../../public/scout-logo.svg`. If SVG input fails, render a 1024 px PNG first (`qlmanage -t -s 1024 -o <scratch dir> public/scout-logo.svg`, output is `scout-logo.svg.png`) and pass that instead. Keep the generated `icons/` folder (it's fine that it also produces iOS/Android/Windows files).

9. `.gitignore` (root): add under a new `# Tauri desktop` heading:
   ```
   desktop/src-tauri/target.nosync
   ```

10. Build: from `desktop/src-tauri` run `cargo tauri build --bundles dmg`. Must succeed. Report the path of the `.dmg` (expected under `desktop/src-tauri/target.nosync/release/bundle/dmg/`) and its size.

11. Smoke check (automated part): `cargo tauri dev` is NOT needed. Instead launch the built app briefly: `open "desktop/src-tauri/target.nosync/release/bundle/macos/Scout.app"`, wait ~10 s, `pgrep -fl Scout.app` to confirm it runs, then `pkill -f "Scout.app/Contents/MacOS"`. Report the result.

12. Write `docs/DESKTOP-SPIKE.md`:
    - What was built (files, how to build: `source "$HOME/.cargo/env"; cd desktop/src-tauri; cargo tauri build --bundles dmg`), dmg path.
    - Automated results from steps 10–11.
    - "Manual checks" section as a checklist with empty result fields, exactly these:
      1. App opens scout.kauper.co; login works.
      2. Quit (⌘Q) and reopen → still logged in.
      3. Right-click → Inspect Element → Console: `await window.__TAURI_INTERNALS__.invoke('ping')` returns `"pong"`. Note any CSP error shown in the console.
      4. Start a timer, hide the app (⌘H) for 15+ minutes, come back → timer still running, no "stopped — no activity" notice.
      5. Installing the dmg copy: drag to /Applications, first open → macOS blocks (unsigned). Allow via System Settings → Privacy & Security → "Open Anyway", or `xattr -dr com.apple.quarantine /Applications/Scout.app`.
    - "Known limits" section: no tray, no updater, no offline fallback, devtools enabled, external links open inside the app.

13. Do not commit. Do not edit anything outside `desktop/`, `.gitignore`, and `docs/DESKTOP-SPIKE.md`.
