mod nav;
mod timer;
mod tray;

use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(timer::TimerState::default())
        .invoke_handler(tauri::generate_handler![timer::timer_changed])
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.add_capability(include_str!("../dev-capabilities/localhost.json"))?;

            let scout = url::Url::parse(nav::scout_url())?;

            let encoded_target: String =
                url::form_urlencoded::byte_serialize(nav::scout_url().as_bytes()).collect();
            let launcher = WebviewUrl::App(format!("index.html?target={encoded_target}").into());

            let nav_scout = scout.clone();
            let opener_handle = app.handle().clone();

            WebviewWindowBuilder::new(app, "main", launcher)
                .title("Scout")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
                .on_navigation(move |url| {
                    if nav::is_internal(url, &nav_scout) {
                        return true;
                    }
                    if nav::is_openable_externally(url) {
                        let _ = opener_handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .on_new_window({
                    let opener_handle = app.handle().clone();
                    move |url, _features| {
                        if nav::is_openable_externally(&url) {
                            let _ = opener_handle.opener().open_url(url.as_str(), None::<&str>);
                        }
                        tauri::webview::NewWindowResponse::Deny
                    }
                })
                .build()?;

            tray::create(app.handle())?;
            tray::refresh(app.handle());
            tray::start_ticker(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } = event
            {
                show_main(app);
            }
        });
}
