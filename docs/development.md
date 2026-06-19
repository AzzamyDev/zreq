# Panduan Pengembangan

## Prasyarat

- **Node.js** (LTS recommended)
- **pnpm** (`corepack enable` atau `npm i -g pnpm`)
- **Rust** + toolchain ([rustup.rs](https://rustup.rs/))
- **Tauri prerequisites** — lihat [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) untuk OS Anda

Backend ZReq harus berjalan agar fitur auth/sync/collections berfungsi penuh.

---

## Setup

```bash
git clone <repo-url> zreq
cd zreq
pnpm install
pnpm tauri dev
```

Dev server Vite berjalan di `http://localhost:1420`. Tauri window membuka UI secara otomatis.

### Environment

Tidak ada `.env` wajib di root proyek. URL backend default: `http://localhost:3500` (via `instanceStore`). Konfigurasi instance dilakukan di dalam app setelah install.

---

## Scripts

| Command | Fungsi |
|---------|--------|
| `pnpm dev` | Vite dev server saja (browser, tanpa Tauri) |
| `pnpm build` | Typecheck + Vite production build → `dist/` |
| `pnpm preview` | Preview build production |
| `pnpm tauri dev` | Dev desktop app |
| `pnpm tauri build` | Build installer/desktop bundle |
| `pnpm test` | Vitest unit tests |

---

## Build production

```bash
pnpm tauri build
```

Output installer ada di `src-tauri/target/release/bundle/`.

### macOS (GitHub Release)

Jika download dari Releases, setelah drag ke Applications/Desktop:

```bash
xattr -cr ~/Desktop/ZReq.app && sudo codesign --force --deep --sign - ~/Desktop/ZReq.app
```

---

## Testing

```bash
pnpm test
```

Test saat ini mencakup:
- `src/lib/query-params.test.ts` — parsing & sync URL ↔ params
- `src/lib/importExport.test.ts` — import/export logic
- `src/lib/format-jsonc-body.test.ts` — JSONC formatting

---

## Konvensi kode

### Frontend

- **Path alias**: `@/` → `src/` (vite + tsconfig)
- **Components**: PascalCase, satu komponen per file
- **Hooks**: `use*.ts` di `src/hooks/`
- **State**: Zustand + Immer untuk mutable draft pattern
- **UI**: Radix primitives + Tailwind utility classes
- **i18n**: gunakan `useTranslation()` / `t('key')`, jangan hardcode string user-facing

### Sync writes

Semua mutasi collections/environments/workspaces ke server harus melalui:

```ts
import { writeCollectionPatch, ... } from '@/lib/local-replica/local-write'
```

Jangan panggil API langsung untuk edit — ini bypass outbox dan conflict handling.

Save payload request (HTTP + WS) harus lewat `buildPersistPayload` dari `@/lib/persist-request` agar field `protocol` dan WS tidak hilang saat autosave.

### Tauri invoke

HTTP request dari UI:

```ts
import { invoke } from '@tauri-apps/api/core'
const response = await invoke('send_request', { payload: { ... } })
```

WebSocket via `useWebSocket` hook — jangan invoke ws commands langsung kecuali extend hook.

### Rust

- Commands di `src-tauri/src/commands/`
- Register handler baru di `lib.rs` → `generate_handler![...]`
- Tambah capability permission di `src-tauri/capabilities/default.json` jika pakai plugin baru

---

## IDE recommended

- VS Code + [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- rust-analyzer

File `.vscode/extensions.json` sudah merekomendasikan extension Tauri.

---

## Debugging tips

| Area | Cara debug |
|------|------------|
| Sync | Console browser + perhatikan toast error; cek `useSyncStore` conflicts |
| HTTP request | Rust log di terminal `tauri dev`; response panel |
| WebSocket | Listen Tauri events di DevTools; panel WS frames |
| Auth | Network tab untuk 401; cek localStorage `zreq_token` |
| Import | Unit test `importExport.test.ts`; validasi format JSON |

---

## Release

Versi di-sync di:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Changelog: `CHANGELOG.md` (Conventional Commits style via release tooling).
