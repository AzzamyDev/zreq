mod commands;
use commands::http::send_request;
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
            ws_connect,
            ws_send,
            ws_send_ping,
            ws_disconnect,
        ])
        .setup(|app| {
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            #[cfg(not(any(target_os = "linux", target_os = "windows")))]
            {
                let _ = app;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
