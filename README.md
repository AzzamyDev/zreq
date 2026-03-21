# ZReq

**Klien HTTP berbasis workspace** — kirim request, kelola koleksi, dan sinkronkan data dengan backend ZReq Anda. Desktop app (Tauri) dengan UI React yang fokus pada alur kerja API sehari-hari.

---

## Apa ini dipakai untuk?

ZReq membantu Anda:

- **Menyusun dan menjalankan** permintaan HTTP (method, URL, header, body) dengan editor yang nyaman.
- **Mengorganisir** request di **koleksi** per **workspace**, termasuk lingkungan (environment) untuk variabel.
- **Menyambung ke instance API** sendiri (bukan hanya satu host tetap): onboarding instance, ganti server dari toolbar.
- **Sinkron** koleksi & data workspace ke server, dengan replika lokal dan penanganan konflik bila perlu.
- **Impor** koleksi dari format **Postman** atau **ZReq** (JSON).

Cocok untuk tim yang sudah punya backend ZReq dan ingin satu aplikasi desktop untuk eksplorasi API yang terhubung ke akun mereka.

---

## Fitur utama

| Area | Ringkasan |
|------|-----------|
| **Request** | Builder + panel respons, tab banyak request, panel bisa di-resize. |
| **Koleksi** | Pohon koleksi/folder, drag & sort, buat & impor koleksi. |
| **Workspace** | Beberapa workspace, anggota (invite by email), pengaturan terpusat. |
| **Auth** | Login / daftar, **GitHub OAuth** (deep link `zreq://` di desktop). |
| **Sync** | Status sync, outbox, dialog konflik saat data lokal vs remote bertabrakan. |
| **Pengalaman** | Command palette, i18n (mis. EN/ID), tema gelap & aksen warna. |

---

## Stack

- **Frontend:** React 19, TypeScript, Vite 8  
- **Desktop:** [Tauri 2](https://v2.tauri.app/)  
- **UI:** Tailwind CSS 4, Radix / shadcn-style components, CodeMirror untuk body JSON/dll.  
- **State:** Zustand, Immer  

---

## Mulai cepat

**Prasyarat:** Node.js, `pnpm`, dan [Rust](https://rustup.rs/) (untuk Tauri).

```bash
cd client
cp .env.example .env
# Sesuaikan VITE_API_URL ke URL backend ZReq Anda
pnpm install
pnpm tauri dev
```

Build produksi desktop:

```bash
pnpm tauri build
```

Variabel lingkungan penting ada di `.env.example` (termasuk opsi `VITE_OAUTH_API_BASE` untuk OAuth lewat tunnel seperti ngrok).

---

## Rekomendasi IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## Disclaimer — proyek *vibe coding*

Ini adalah proyek yang banyak berkembang lewat eksperimen, iterasi cepat, dan “feel” pengembangan — **bukan produk komersial yang dijamin stabil, aman, atau lengkap untuk semua skenario produksi**. API, data model, dan perilaku sync bisa berubah sewaktu-waktu. Gunakan dengan sadar risiko; jangan mengandalkan ini sebagai satu-satunya cadangan data kritis tanpa verifikasi sendiri.

---

*ZReq — satu permukaan untuk request, koleksi, dan workspace yang tersinkron.*
