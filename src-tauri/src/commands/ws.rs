use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Mutex;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        client::IntoClientRequest,
        http::HeaderValue,
        protocol::{frame::coding::CloseCode, CloseFrame, Message},
    },
};

#[derive(Default)]
pub struct WsState {
    sessions: Mutex<HashMap<String, mpsc::UnboundedSender<SessionCommand>>>,
}

enum SessionCommand {
    SendText(String),
    SendBinary(Vec<u8>),
    SendPing(Vec<u8>),
    Close,
}

#[derive(Debug, Clone, Serialize)]
struct WsHandshakeEvent {
    session_id: String,
    status: u16,
    headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
struct WsMessageEvent {
    session_id: String,
    direction: String,
    data: String,
    is_binary: bool,
    opcode: String,
    timestamp: u64,
}

#[derive(Debug, Clone, Serialize)]
struct WsStatusEvent {
    session_id: String,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
struct WsErrorEvent {
    session_id: String,
    message: String,
}

fn emit_status(app: &AppHandle, session_id: &str, status: &str) {
    let _ = app.emit(
        "ws-status",
        WsStatusEvent {
            session_id: session_id.to_string(),
            status: status.to_string(),
        },
    );
}

fn emit_error(app: &AppHandle, session_id: &str, message: impl Into<String>) {
    let _ = app.emit(
        "ws-error",
        WsErrorEvent {
            session_id: session_id.to_string(),
            message: message.into(),
        },
    );
    emit_status(app, session_id, "error");
}

fn emit_message(
    app: &AppHandle,
    session_id: &str,
    direction: &str,
    data: String,
    is_binary: bool,
    opcode: &str,
) {
    let _ = app.emit(
        "ws-message",
        WsMessageEvent {
            session_id: session_id.to_string(),
            direction: direction.to_string(),
            data,
            is_binary,
            opcode: opcode.to_string(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        },
    );
}

fn remove_session(app: &AppHandle, session_id: &str) {
    if let Some(state) = app.try_state::<Arc<WsState>>() {
        if let Ok(mut map) = state.sessions.lock() {
            map.remove(session_id);
        }
    }
}

async fn run_session(
    app: AppHandle,
    session_id: String,
    url: String,
    headers: HashMap<String, String>,
    subprotocols: String,
    mut cmd_rx: mpsc::UnboundedReceiver<SessionCommand>,
) {
    let sid = session_id.clone();
    emit_status(&app, &sid, "connecting");

    let connect_result = async {
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|e| format!("Invalid WebSocket URL: {e}"))?;

        for (k, v) in &headers {
            if k.is_empty() {
                continue;
            }
            let name = tokio_tungstenite::tungstenite::http::HeaderName::from_str(k)
                .map_err(|e| format!("Bad header '{k}': {e}"))?;
            let val =
                HeaderValue::from_str(v).map_err(|e| format!("Bad header value for '{k}': {e}"))?;
            request.headers_mut().insert(name, val);
        }

        if !subprotocols.is_empty() {
            request.headers_mut().insert(
                tokio_tungstenite::tungstenite::http::header::SEC_WEBSOCKET_PROTOCOL,
                HeaderValue::from_str(&subprotocols)
                    .map_err(|e| format!("Bad subprotocol header: {e}"))?,
            );
        }

        connect_async(request)
            .await
            .map_err(|e| format!("WebSocket connect failed: {e}"))
    }
    .await;

    let (ws_stream, response) = match connect_result {
        Ok(pair) => pair,
        Err(err) => {
            emit_error(&app, &sid, err);
            remove_session(&app, &sid);
            return;
        }
    };

    let mut resp_headers = HashMap::new();
    for (k, v) in response.headers() {
        if let Ok(val) = v.to_str() {
            resp_headers.insert(k.to_string(), val.to_string());
        }
    }
    let _ = app.emit(
        "ws-handshake",
        WsHandshakeEvent {
            session_id: sid.clone(),
            status: response.status().as_u16(),
            headers: resp_headers,
        },
    );
    emit_status(&app, &sid, "connected");

    let (mut write, mut read) = ws_stream.split();

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(SessionCommand::SendText(text)) => {
                        if write.send(Message::Text(text.clone().into())).await.is_err() {
                            break;
                        }
                        emit_message(&app, &sid, "outgoing", text, false, "text");
                    }
                    Some(SessionCommand::SendBinary(bytes)) => {
                        if write.send(Message::Binary(bytes.clone().into())).await.is_err() {
                            break;
                        }
                        let encoded = BASE64_STANDARD.encode(&bytes);
                        emit_message(&app, &sid, "outgoing", encoded, true, "binary");
                    }
                    Some(SessionCommand::SendPing(payload)) => {
                        if write.send(Message::Ping(payload.clone().into())).await.is_err() {
                            break;
                        }
                        let data = if payload.is_empty() {
                            String::new()
                        } else {
                            BASE64_STANDARD.encode(&payload)
                        };
                        emit_message(&app, &sid, "outgoing", data, !payload.is_empty(), "ping");
                    }
                    Some(SessionCommand::Close) | None => {
                        let _ = write
                            .send(Message::Close(Some(CloseFrame {
                                code: CloseCode::Normal,
                                reason: "Client disconnect".into(),
                            })))
                            .await;
                        break;
                    }
                }
            }
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        emit_message(&app, &sid, "incoming", text.to_string(), false, "text");
                    }
                    Some(Ok(Message::Binary(bytes))) => {
                        let encoded = BASE64_STANDARD.encode(bytes.as_ref());
                        emit_message(&app, &sid, "incoming", encoded, true, "binary");
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        let data = if payload.is_empty() {
                            String::new()
                        } else {
                            BASE64_STANDARD.encode(payload.as_ref())
                        };
                        emit_message(&app, &sid, "incoming", data, !payload.is_empty(), "ping");
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Some(Ok(Message::Pong(payload))) => {
                        let data = if payload.is_empty() {
                            String::new()
                        } else {
                            BASE64_STANDARD.encode(payload.as_ref())
                        };
                        emit_message(&app, &sid, "incoming", data, !payload.is_empty(), "pong");
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let reason = frame
                            .map(|f| f.reason.to_string())
                            .unwrap_or_else(|| "Connection closed".to_string());
                        emit_message(&app, &sid, "system", reason, false, "close");
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        emit_error(&app, &sid, format!("Read error: {e}"));
                        break;
                    }
                    None => break,
                }
            }
        }
    }

    emit_status(&app, &sid, "disconnected");
    remove_session(&app, &sid);
}

#[tauri::command]
pub async fn ws_connect(
    app: AppHandle,
    state: State<'_, Arc<WsState>>,
    session_id: String,
    url: String,
    headers: HashMap<String, String>,
    subprotocols: Option<String>,
) -> Result<(), String> {
    let _ = ws_disconnect(state.clone(), session_id.clone()).await;

    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    {
        let mut map = state
            .sessions
            .lock()
            .map_err(|e| format!("Session lock error: {e}"))?;
        map.insert(session_id.clone(), cmd_tx);
    }

    let sub = subprotocols.unwrap_or_default();
    tauri::async_runtime::spawn(run_session(
        app,
        session_id,
        url,
        headers,
        sub,
        cmd_rx,
    ));

    Ok(())
}

#[tauri::command]
pub async fn ws_send(
    state: State<'_, Arc<WsState>>,
    session_id: String,
    data: String,
    is_binary: bool,
) -> Result<(), String> {
    let tx = {
        let map = state
            .sessions
            .lock()
            .map_err(|e| format!("Session lock error: {e}"))?;
        map.get(&session_id).cloned()
    };
    let Some(tx) = tx else {
        return Err("WebSocket session not found".to_string());
    };

    if is_binary {
        let bytes = BASE64_STANDARD
            .decode(data.as_bytes())
            .map_err(|e| format!("Invalid base64 payload: {e}"))?;
        tx.send(SessionCommand::SendBinary(bytes))
            .map_err(|e| format!("Send failed: {e}"))?;
    } else {
        tx.send(SessionCommand::SendText(data))
            .map_err(|e| format!("Send failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn ws_send_ping(
    state: State<'_, Arc<WsState>>,
    session_id: String,
    payload: Option<String>,
) -> Result<(), String> {
    let tx = {
        let map = state
            .sessions
            .lock()
            .map_err(|e| format!("Session lock error: {e}"))?;
        map.get(&session_id).cloned()
    };
    let Some(tx) = tx else {
        return Err("WebSocket session not found".to_string());
    };

    let bytes = match payload {
        Some(data) if !data.is_empty() => BASE64_STANDARD
            .decode(data.as_bytes())
            .map_err(|e| format!("Invalid ping payload: {e}"))?,
        _ => Vec::new(),
    };
    tx.send(SessionCommand::SendPing(bytes))
        .map_err(|e| format!("Ping failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn ws_disconnect(state: State<'_, Arc<WsState>>, session_id: String) -> Result<(), String> {
    let tx = {
        let mut map = state
            .sessions
            .lock()
            .map_err(|e| format!("Session lock error: {e}"))?;
        map.remove(&session_id)
    };
    if let Some(tx) = tx {
        let _ = tx.send(SessionCommand::Close);
    }
    Ok(())
}
