# ZReq

**Workspace-first HTTP & WebSocket client** — send requests, manage collections, and sync data with your ZReq backend. A Tauri desktop app with a React UI built around day-to-day API workflows.

📖 **Full documentation:** [docs/README.md](./docs/README.md) (overview, architecture, development, user guide — also available in Indonesian)

---

## What is it for?

ZReq helps you:

- **Compose and run** HTTP requests (method, URL, headers, body) with a comfortable editor.
- **Connect to WebSocket** servers with live message streams, subprotocols, binary/ping-pong, and saved message templates in collections.
- **Organize** requests in **collections** per **workspace**, including **environments** for variables.
- **Connect to your own API instance** (not a single fixed host): instance onboarding, switch servers from the toolbar.
- **Sync** with an outbox + local replica model, conflict handling, and a manual **Sync Now** trigger.
- **Import** collections/environments from **Postman** or **ZReq** (including multi-file import).

A good fit for teams that already run a ZReq backend and want one desktop app for signed-in API exploration.

---

## Features

| Area | Summary |
|------|---------|
| **HTTP requests** | Builder + response panel, URL ↔ Params sync (Postman-style), multiple tabs, resizable panels, pre/post scripts, env variable resolution. |
| **WebSocket** | Protocol selector (HTTP / WS), live frames via Tauri events, subprotocols, text/binary/ping-pong, saved messages in collections. |
| **Collections** | Tree of collections/folders, HTTP/WS icons, drag & sort, Request/WebSocket picker on **+**, Postman + ZReq import/export. |
| **Environments** | Environment selector, import (Postman, ZReq, `.env`), editable variables with autosave. |
| **Workspaces** | Multiple workspaces, members (invite by email), multi-instance backend switching. |
| **Auth** | Sign in / register, **GitHub OAuth** (desktop deep link `zreq://`). |
| **Sync** | Local replica + outbox, conflict dialog with line diff, debounced / periodic / manual upload strategies. |
| **Experience** | Command palette, i18n (EN/ID), Dracula-inspired dark theme, frameless window with native controls. |

---

## Stack

- **Frontend:** React 19, TypeScript, Vite 8  
- **Desktop:** [Tauri 2](https://v2.tauri.app/)  
- **UI:** Tailwind CSS 4, Radix / shadcn-style components, CodeMirror for JSON bodies and more.  
- **State:** Zustand, Immer  
- **HTTP (Rust):** `reqwest` via Tauri invoke  
- **WebSocket (Rust):** `tokio-tungstenite` + Tauri events  
- **Test:** Vitest  

---

## Quick start

**Prerequisites:** Node.js, `pnpm`, and [Rust](https://rustup.rs/) (for Tauri).

```bash
pnpm install
pnpm tauri dev
```

Desktop production build:

```bash
pnpm tauri build
```

Common helper commands:

```bash
pnpm dev
pnpm build
pnpm test
pnpm tauri build
```

### For macOS users (GitHub Release build)

If you download the app from GitHub Releases, open the `.dmg` file first, then drag `ZReq.app` to your Desktop.

After that, run this command before opening the app:

```bash
xattr -cr ~/Desktop/ZReq.app && sudo codesign --force --deep --sign - ~/Desktop/ZReq.app
```

Adjust the `ZReq.app` path if you keep the app in another location (for example `~/Downloads`).

Backend URL is configured from the active instance inside the app (Instance Onboarding / Instance Settings).

---

## Sync behavior (current)

ZReq uses a local outbox and background sync. You can control upload strategy from **Settings → General → Server sync (upload)**:

- **Automatic (short delay)**: default behavior, pushes shortly after edits.
- **Periodic**: pushes every N minutes only when outbox has pending changes.
- **Manual only**: no automatic push; use the toolbar **Sync** button when ready.

Even in manual/periodic mode, the app can still pull latest server data in background to keep view up to date.

---

## Import support (current)

- **Collections**: Postman v2.1, ZReq export, root arrays, and bundle-style payloads.
- **Environments**: Postman (`values`), ZReq single/bundle, `.env`, multi-file import.
- Import is available from collection sidebar and environment manager.

---

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## Disclaimer — *vibe coding* project

This project grows through experimentation, fast iteration, and a “feel your way” style of development — **not as a commercially guaranteed stable, secure, or complete product for every production scenario**. APIs, data models, and sync behavior may change without notice. Use at your own risk; do not rely on it as your only backup for critical data without your own verification.

---

*ZReq — one surface for requests, collections, and synced workspaces.*
