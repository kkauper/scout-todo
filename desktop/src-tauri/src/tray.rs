use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::image::Image;
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::timer::{format_elapsed, truncate_title, TimerState};

pub struct TrayItems {
    pub status: MenuItem<Wry>,
    pub stop: MenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "No timer running", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Scout", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop timer", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Scout", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&status, &open, &stop, &separator, &quit])?;

    app.manage(TrayItems {
        status: status.clone(),
        stop: stop.clone(),
    });

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("Scout")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_main(app),
            "stop" => {
                let _ = app.emit_to("main", "tray-stop-timer", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

pub fn refresh(app: &AppHandle) {
    let state = app.state::<TimerState>();
    let running = state.0.lock().unwrap().clone();
    drop(state);

    let items = app.state::<TrayItems>();

    if let Some(tray) = app.tray_by_id("main") {
        let title = running
            .as_ref()
            .map(|t| format_elapsed(t.started_at_ms, now_ms()));
        if let Err(e) = tray.set_title(title) {
            eprintln!("failed to set tray title: {e}");
        }
    }

    match running {
        Some(t) => {
            let status_text = format!("Tracking: {}", truncate_title(&t.task_title, 40));
            if let Err(e) = items.status.set_text(status_text) {
                eprintln!("failed to set tray status text: {e}");
            }
            if let Err(e) = items.stop.set_enabled(true) {
                eprintln!("failed to enable stop menu item: {e}");
            }
        }
        None => {
            if let Err(e) = items.status.set_text("No timer running") {
                eprintln!("failed to set tray status text: {e}");
            }
            if let Err(e) = items.stop.set_enabled(false) {
                eprintln!("failed to disable stop menu item: {e}");
            }
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn start_ticker(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        refresh(&app);
    });
}
