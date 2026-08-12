# Changelog

## [1.2.0](https://github.com/AzzamyDev/zreq/compare/v1.1.0...v1.2.0) (2026-08-12)


### Features

* add saved responses functionality and UI components ([d4feaeb](https://github.com/AzzamyDev/zreq/commit/d4feaeb93ff217ba26f0dce68a7b17ae02d73041))
* implement macOS window chrome and fullscreen support ([0950eac](https://github.com/AzzamyDev/zreq/commit/0950eac17287a1a9e2a4a69863eb8b596735c1b0))
* integrate Monaco editor and enhance collection management features ([75e7823](https://github.com/AzzamyDev/zreq/commit/75e7823f661debb66ded5b2faf98407613a25312))
* update OAuth redirect handling in SettingsDialog and MCP presets ([daeccc8](https://github.com/AzzamyDev/zreq/commit/daeccc821ea0fbec6a9ae873b8a33f6c62f3eebe))


### Bug Fixes

* align Tauri Rust 2.11 with npm API and pin pnpm ([5a5ccc2](https://github.com/AzzamyDev/zreq/commit/5a5ccc29b4309feb21caa031da06e5cd207332fc))
* allow esbuild build scripts for pnpm 11 CI ([2de6b51](https://github.com/AzzamyDev/zreq/commit/2de6b51b0b4e5fa5ab274592405657df690f1dc0))
* bump CI Node to 22 for pnpm 11 compatibility ([4f15dba](https://github.com/AzzamyDev/zreq/commit/4f15dba785f1e3f5ec5c3bb4024d5d9ed594ac7a))

## [1.3.0](https://github.com/AzzamyDev/zreq/compare/v1.2.0...v1.3.0) (2026-08-13)


### Features

* add saved responses — save HTTP responses from the response panel, browse them in a dedicated tab, and reopen/load saved response bodies
* replace CodeMirror with Monaco editor for request/response body editing
* add collection drag-and-drop, item duplication, and multi-select modes in the collection tree
* add ImportFormatDialog for choosing import formats when importing collections
* implement macOS native window chrome (title bar / traffic lights) and fullscreen support via `useMacWindowFullscreen`
* support multiple OAuth redirect URIs in SettingsDialog and MCP agent presets


### Bug Fixes

* clear orphaned tabs when saved responses are deleted
* refine CollectionItem / TreeNode / Sidebar layout and scroll viewport styling for denser, consistent collection UI

## [1.2.0](https://github.com/AzzamyDev/zreq/compare/v1.1.0...v1.2.0) (2026-06-20)


### Features

* add WebSocket request support with live message stream, subprotocols, binary/ping-pong, and saved messages in collections (Rust `tokio-tungstenite` + Tauri events)
* add bidirectional URL ↔ Params sync (Postman-style); query string in URL bar and Params tab stay in sync
* add custom frameless window with native drag region and window controls on desktop
* redesign auth screens, profile dialog, and environment manager for a cleaner workflow
* overhaul UI theme with Dracula-inspired palette and improved CodeMirror styling
* improve conflict resolution dialog with line diff, raw JSON, and field-level summaries
* add Tauri dialog and filesystem plugins for loading binary WebSocket payloads from file
* add vitest test infrastructure and unit tests for query-params parsing
* improve environment import (Postman, ZReq, `.env`) with validation and workspace guards
* improve sync engine outbox handling and local-write consistency
* add HTTP method color theming and protocol selector (HTTP / WebSocket)
* simplify workspace switcher and refine collection sidebar for WebSocket requests
* persist WebSocket request fields (`protocol`, `subprotocols`, `savedMessages`, `messageTemplate`) through autosave, manual save, and sync round-trip
* add shared `buildPersistPayload` helper for consistent HTTP/WS save payloads
* differentiate collection sidebar icons — Globe for HTTP, Radio (cyan) for WebSocket
* add Request / WebSocket picker on folder and collection **+** buttons for quick WS creation


### Bug Fixes

* fix WebSocket requests reverting to HTTP after refresh when `protocol` was dropped during autosave or server sync
* infer WebSocket protocol from `ws://` / `wss://` URL when legacy items lack an explicit `protocol` field
* fix imported environments disappearing after background sync
* fix collection and folder settings forms resetting while editing variables during sync
* fix duplicate query strings when URL already contained params and the Params tab had entries
* fix environment create ops being dropped from outbox when temp IDs were reconciled during sync

## [1.1.0](https://github.com/AzzamyDev/zreq/compare/v1.0.3...v1.1.0) (2026-04-08)


### Features

* enhance dialog components and add delete confirmation dialogs; improve auth handling with overrideParent flag ([8c0b9ec](https://github.com/AzzamyDev/zreq/commit/8c0b9ec69dd6b8d680a912e9f71093ff2321edcf))


### Bug Fixes

* perbaiki sync hapus koleksi dan default auth inherit ([296a5a9](https://github.com/AzzamyDev/zreq/commit/296a5a92e53ebc3df8da8a8d9d3542fcf6a3ce34))

## 1.0.0 (2026-04-07)


### Features

* add JSONC support with syntax highlighting and template variable integration ([351ce75](https://github.com/AzzamyDev/zreq/commit/351ce758f27abeadcd1780926603a98994bce885))
* enhance environment and collection import/export functionality; add support for additional metadata and improve user experience ([734ced9](https://github.com/AzzamyDev/zreq/commit/734ced98eb49c8c6d9b2043b2a396c3a34de9552))
* enhance SettingsDialog for MCP OAuth client management; add CRUD operations and UI for managing OAuth clients, including error handling and form validation ([aa53bf9](https://github.com/AzzamyDev/zreq/commit/aa53bf9ae519954bc661c2b51f3eb87107ad5c0f))
* enhance workspace synchronization logic; merge pending workspace creations with remote workspaces to ensure data consistency ([8f6509b](https://github.com/AzzamyDev/zreq/commit/8f6509bbe50404d5d33a9207d5e2035b61fbea2d))
* implement OAuth bridge code management; add error handling for reused codes and enhance user feedback in sync operations ([805e240](https://github.com/AzzamyDev/zreq/commit/805e2407709d9111711627abbbc81df3534fb2ea))
* implement sync preferences for background synchronization; enhance collection and environment import/export functionality ([3d67834](https://github.com/AzzamyDev/zreq/commit/3d678347279366c9ace60e0f316576b08472e341))
* implement workspace-specific environment management; enhance environment handling in app state and local storage ([1e4e9d6](https://github.com/AzzamyDev/zreq/commit/1e4e9d66a1054b7a743c2f07e11e5bdf552510ee))
* initial commit ([0cc9b5e](https://github.com/AzzamyDev/zreq/commit/0cc9b5e90fb682c6a8d9578f8f9d9b03e16f17d9))
* replace Vite icon with custom icon.svg; add AppLogo component for consistent branding across the application ([f1abddd](https://github.com/AzzamyDev/zreq/commit/f1abddd1d4516cb0efc8a395c47f0a67c5157b81))
* update SettingsDialog to conditionally set client_secret and enhance user hints for authentication methods ([82ffcca](https://github.com/AzzamyDev/zreq/commit/82ffcca85436286c8832b7651e06e8f83f9d2a5e))


### Bug Fixes

* remove duplicate 'zreq' property in exportCollection function for cleaner JSON output ([c69daca](https://github.com/AzzamyDev/zreq/commit/c69dacad5f94872e2b7f7c7187b583b0af9c8ebe))

All notable changes to this project are documented in this file.

See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
