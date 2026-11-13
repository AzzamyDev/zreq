use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopUpdateStatus {
    pub available: bool,
    pub version: String,
    pub notes: String,
    pub current_version: String,
}

fn endpoint_for(base_url: &str) -> Result<Url, String> {
    let base = base_url.trim().trim_end_matches('/');
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err("Server address is not a web address.".into());
    }
    let raw = format!("{base}/desktop-updates/{{{{target}}}}/{{{{arch}}}}/{{{{current_version}}}}");
    Url::parse(&raw).map_err(|_| "Server address is not a web address.".into())
}

fn updater(app: &AppHandle, base_url: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint = endpoint_for(base_url)?;
    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn check_desktop_update(app: AppHandle, base_url: String) -> Result<DesktopUpdateStatus, String> {
    let updater = updater(&app, &base_url)?;
    match updater.check().await.map_err(|error| error.to_string())? {
        Some(update) => Ok(DesktopUpdateStatus {
            available: true,
            version: update.version.clone(),
            notes: update.body.clone().unwrap_or_default(),
            current_version: update.current_version.clone(),
        }),
        None => Ok(DesktopUpdateStatus {
            available: false,
            version: String::new(),
            notes: String::new(),
            current_version: app.package_info().version.to_string(),
        }),
    }
}

#[tauri::command]
pub async fn install_desktop_update(app: AppHandle, base_url: String) -> Result<(), String> {
    let updater = updater(&app, &base_url)?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        return Err("No update is available.".into());
    };
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|error| error.to_string())
}
