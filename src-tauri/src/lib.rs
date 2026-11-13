mod commands;
use commands::http::send_request;
use commands::updates::{check_desktop_update, install_desktop_update};
use commands::ws::{ws_connect, ws_disconnect, ws_send, ws_send_ping, WsState};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ws_state = Arc::new(WsState::default());

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ws_state);
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            if !argv.is_empty() {
                println!("[zreq] single-instance argv: {argv:?}");
            }
        }));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            send_request,
            check_desktop_update,
            install_desktop_update,
            ws_connect,
            ws_send,
            ws_send_ping,
            ws_disconnect,
        ])
        .setup(|app| {
            use tauri::{LogicalSize, Manager};

            if let Some(window) = app.get_webview_window("main") {
                let main_config = app
                    .config()
                    .app
                    .windows
                    .iter()
                    .find(|w| w.label == "main")
                    .or_else(|| app.config().app.windows.first());

                if let Some(win_config) = main_config {
                    if let (Some(min_width), Some(min_height)) =
                        (win_config.min_width, win_config.min_height)
                    {
                        window.set_min_size(Some(LogicalSize::new(min_width, min_height)))?;
                    }
                }

                // Overlay title bar is set once in tauri.macos.conf.json.
                // Reapplying it on focus reloads the page when the person switches back to ZReq.
            }

            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
