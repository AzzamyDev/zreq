use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, SET_COOKIE},
    Client, Method,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Instant;

#[derive(Debug, Deserialize)]
pub struct RequestPayload {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub body_type: String,
}

#[derive(Debug, Serialize)]
pub struct ResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    /// Each `Set-Cookie` response header (duplicates preserved; HashMap headers keep last only).
    pub set_cookies: Vec<String>,
    pub body: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
}

#[tauri::command]
pub async fn send_request(payload: RequestPayload) -> Result<ResponsePayload, String> {
    let client = Client::builder()
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let method = Method::from_str(&payload.method.to_uppercase())
        .map_err(|e| format!("Invalid method: {e}"))?;

    let mut builder = client.request(method, &payload.url);

    // Build headers
    let mut header_map = HeaderMap::new();
    for (k, v) in &payload.headers {
        if k.is_empty() {
            continue;
        }
        let name = HeaderName::from_str(k).map_err(|e| format!("Bad header '{k}': {e}"))?;
        let val = HeaderValue::from_str(v).map_err(|e| format!("Bad header value for '{k}': {e}"))?;
        header_map.insert(name, val);
    }
    builder = builder.headers(header_map);

    // Attach body
    if let Some(body) = &payload.body {
        builder = match payload.body_type.as_str() {
            "json" => builder
                .header("Content-Type", "application/json")
                .body(body.clone()),
            "urlencoded" => builder
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(body.clone()),
            "form-data" => {
                // body is JSON array of {key, value, enabled}
                let kvs: Vec<serde_json::Value> =
                    serde_json::from_str(body).map_err(|e| format!("Bad form-data: {e}"))?;
                let mut form = reqwest::multipart::Form::new();
                for kv in kvs {
                    if kv["enabled"].as_bool().unwrap_or(true) {
                        let k = kv["key"].as_str().unwrap_or("").to_string();
                        let v = kv["value"].as_str().unwrap_or("").to_string();
                        if !k.is_empty() {
                            form = form.text(k, v);
                        }
                    }
                }
                builder.multipart(form)
            }
            _ => builder.body(body.clone()),
        };
    }

    let start = Instant::now();
    let response = builder.send().await.map_err(|e| {
        if e.is_timeout() {
            "Request timed out".to_string()
        } else if e.is_connect() {
            format!("Connection failed: {e}")
        } else {
            format!("Request error: {e}")
        }
    })?;
    let duration_ms = start.elapsed().as_millis() as u64;

    let status = response.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("").to_string();

    let mut resp_headers: HashMap<String, String> = HashMap::new();
    let mut set_cookies: Vec<String> = Vec::new();
    for (k, v) in response.headers() {
        if let Ok(val) = v.to_str() {
            if k == SET_COOKIE {
                set_cookies.push(val.to_string());
            }
            resp_headers.insert(k.to_string(), val.to_string());
        }
    }

    let body_bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let size_bytes = body_bytes.len();
    let body = String::from_utf8_lossy(&body_bytes).to_string();

    Ok(ResponsePayload {
        status: status_code,
        status_text,
        headers: resp_headers,
        set_cookies,
        body,
        duration_ms,
        size_bytes,
    })
}
