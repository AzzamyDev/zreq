# ZReq

**Workspace-first HTTP client** — send requests, manage collections, and sync data with your ZReq backend. A Tauri desktop app with a React UI built around day-to-day API workflows.

---

## What is it for?

ZReq helps you:

- **Compose and run** HTTP requests (method, URL, headers, body) with a comfortable editor.
- **Organize** requests in **collections** per **workspace**, including **environments** for variables.
- **Connect to your own API instance** (not a single fixed host): instance onboarding, switch servers from the toolbar.
- **Sync** collections and workspace data to the server, with a local replica and conflict handling when needed.
- **Import** collections from **Postman** or **ZReq** (JSON).

A good fit for teams that already run a ZReq backend and want one desktop app for signed-in API exploration.

---

## Features

| Area | Summary |
|------|---------|
| **Requests** | Builder + response panel, multiple request tabs, resizable panels. |
| **Collections** | Tree of collections/folders, drag & sort, create & import collections. |
| **Workspaces** | Multiple workspaces, members (invite by email), centralized settings. |
| **Auth** | Sign in / register, **GitHub OAuth** (desktop deep link `zreq://`). |
| **Sync** | Sync status, outbox, conflict dialog when local vs remote diverge. |
| **Experience** | Command palette, i18n (e.g. EN/ID), dark theme and accent colors. |

---

## Stack

- **Frontend:** React 19, TypeScript, Vite 8  
- **Desktop:** [Tauri 2](https://v2.tauri.app/)  
- **UI:** Tailwind CSS 4, Radix / shadcn-style components, CodeMirror for JSON bodies and more.  
- **State:** Zustand, Immer  

---

## Quick start

**Prerequisites:** Node.js, `pnpm`, and [Rust](https://rustup.rs/) (for Tauri).

```bash
cd client
cp .env.example .env
pnpm install
pnpm tauri dev
```

Desktop production build:

```bash
pnpm tauri build
```

Backend URL is configured from the active instance inside the app (Instance Onboarding / Instance Settings).

---

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## Disclaimer — *vibe coding* project

This project grows through experimentation, fast iteration, and a “feel your way” style of development — **not as a commercially guaranteed stable, secure, or complete product for every production scenario**. APIs, data models, and sync behavior may change without notice. Use at your own risk; do not rely on it as your only backup for critical data without your own verification.

---

*ZReq — one surface for requests, collections, and synced workspaces.*
