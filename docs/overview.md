# Ringkasan & Fitur ZReq

## Apa itu ZReq?

**ZReq** adalah aplikasi desktop **workspace-first HTTP client** — alat untuk mengirim request HTTP/WebSocket, mengelola koleksi API, environment variable, dan sinkronisasi data dengan **backend ZReq** yang Anda host sendiri.

Berbeda dengan klien API yang mengunci ke satu cloud, ZReq dirancang untuk tim yang:

- Menjalankan instance backend ZReq sendiri (self-hosted atau internal)
- Butuh desktop app dengan offline-first + sync ke server
- Ingin workflow mirip Postman, tapi terintegrasi dengan ekosistem ZReq

Aplikasi dibangun dengan **Tauri 2** (Rust) sebagai shell desktop dan **React 19** sebagai UI.

---

## Fitur utama

### Request HTTP

- Builder request lengkap: method, URL, headers, query params, body
- Body types: JSON (dengan JSONC + template variable), form-data, urlencoded, raw, none
- Auth: none, inherit, bearer, basic, JWT
- Pre-request & post-response scripts (API `pm.*` mirip Postman)
- Response panel: status, headers, cookies, body, durasi, ukuran
- Multiple request tabs dengan indikator dirty
- Panel resizable (sidebar, request, response)
- **URL ↔ Params sync** (Postman-style): edit URL atau tab Params, keduanya tetap sinkron

### Request WebSocket (v1.2+)

- Protocol selector: HTTP / WebSocket
- Koneksi live dengan subprotocols
- Kirim text, binary (dari file), ping/pong
- Stream pesan masuk/keluar real-time via Tauri events
- Simpan message template & saved messages di koleksi
- Field WS (`protocol`, `subprotocols`, `savedMessages`, `messageTemplate`) di-persist via autosave, save manual, dan sync ke server
- Fallback: infer protocol `ws` dari URL `ws://` / `wss://` untuk data legacy tanpa kolom `protocol`

### Collections & Folders

- Tree koleksi per workspace
- Drag & sort (dnd-kit)
- Ikon berbeda di sidebar: **Globe** (HTTP) vs **Radio** cyan (WebSocket)
- Tombol **+** di folder/collection root → picker **Request** / **WebSocket**
- Auth & variables di level collection/folder (inheritance)
- Import dari **Postman v2.1** atau **ZReq export**
- Export koleksi ZReq
- Simpan request ke koleksi

### Environments

- Environment per workspace
- Variable dengan syntax `{{varName}}` di URL, headers, body
- Import: Postman, ZReq, `.env`, multi-file
- Autosave perubahan variable
- Selector environment di toolbar

### Workspaces & Multi-instance

- Beberapa workspace per user
- Undang anggota workspace via email
- **Multi-instance backend**: daftar server ZReq, switch dari toolbar
- Instance onboarding saat pertama kali pakai

### Autentikasi

- Login / register dengan email & password
- **GitHub OAuth** via deep link desktop `zreq://`
- Token JWT disimpan lokal; auto-logout saat 401

### Sync (Local-first)

- Model **local replica + outbox**: edit lokal dulu, push ke server nanti
- Strategi upload configurable:
  - **Debounced** (default): push otomatis ~450ms setelah edit
  - **Periodic**: push setiap N menit jika outbox ada perubahan
  - **Manual**: hanya push saat klik tombol Sync
- Background pull saat app fokus / visible
- Conflict dialog dengan line diff & field summary
- Status sync + badge outbox di footer/toolbar

### Pengalaman pengguna

- Command palette (cmdk)
- i18n: **English** & **Bahasa Indonesia**
- Dark theme dengan palet Dracula-inspired
- Accent color customizable
- Frameless window + native drag region (desktop)
- MCP OAuth client management di Settings

---

## Stack teknologi

| Lapisan | Teknologi |
|---------|-----------|
| UI | React 19, TypeScript, Vite 8 |
| Desktop | Tauri 2 |
| Styling | Tailwind CSS 4, Radix UI, shadcn-style components |
| Editor | CodeMirror 6 (JSON, scripts, templates) |
| State | Zustand + Immer |
| HTTP client (ke backend API) | Axios |
| HTTP request (dari app) | Rust `reqwest` via Tauri invoke |
| WebSocket | Rust `tokio-tungstenite` via Tauri events |
| i18n | i18next |
| Test | Vitest |

---

## Prasyarat backend

ZReq client **membutuhkan backend ZReq** yang berjalan dan dapat diakses. URL backend dikonfigurasi per instance di dalam app (bukan hardcoded).

Default development: `http://localhost:3500`

---

## Disclaimer

Proyek ini berkembang dengan iterasi cepat (*vibe coding*). API, model data, dan perilaku sync dapat berubah. Jangan andalkan sebagai satu-satunya backup data kritis tanpa verifikasi sendiri.
