# Panduan Pengguna

Panduan singkat fitur ZReq untuk pengguna akhir.

---

## Memulai

### 1. Hubungkan ke backend (Instance)

Saat pertama kali buka app:

1. Masukkan URL backend ZReq (contoh: `https://api.tim-anda.com` atau `http://localhost:3500`)
2. Beri nama instance (opsional)
3. Lanjut ke login

Anda bisa menambah beberapa instance dan switch dari **toolbar atas**.

### 2. Login

- **Email & password** — register jika belum punya akun
- **GitHub** — OAuth via browser, redirect kembali ke app (`zreq://`)

### 3. Workspace

Setelah login, pilih atau buat workspace. Setiap workspace punya collections & environments terpisah.

---

## Mengirim HTTP request

1. Klik **New Request** atau buka request dari sidebar koleksi
2. Pilih **HTTP** di protocol selector
3. Isi method, URL, headers, params, body
4. Klik **Send**

### URL & Params

Edit URL langsung atau lewat tab **Params** — keduanya sinkron otomatis (Postman-style).

### Variables

Gunakan syntax `{{namaVariable}}` di URL, headers, atau body. Variable di-resolve dari environment aktif.

### Auth

Tab **Auth**: None, Inherit (dari folder/collection), Bearer, Basic, atau JWT.

### Scripts

Tab **Scripts**:
- **Pre-request** — jalankan sebelum send (akses `pm.environment`, `pm.request`)
- **Post-response** — jalankan setelah response (akses `pm.response`)

Log script muncul di **Console** panel.

---

## WebSocket

1. Pilih protocol **WebSocket** di request builder, atau buat dari sidebar (**+** → WebSocket)
2. Masukkan URL `ws://` atau `wss://`
3. (Opsional) Isi subprotocols di tab terkait
4. Klik **Connect** (atau `Ctrl+Enter` / `Cmd+Enter`)
5. Kirim pesan text/binary dari composer; gunakan ping/pong jika perlu
6. Lihat stream pesan di panel response

Pesan bisa disimpan ke koleksi sebagai template atau saved messages. Protocol WebSocket tetap tersimpan setelah refresh dan sync.

### Sidebar WebSocket

- Request HTTP: ikon **Globe** + badge method (GET, POST, …)
- Request WebSocket: ikon **Radio** (cyan) + badge **WS**
- Tombol **+** pada folder atau root collection menampilkan picker **Request** / **WebSocket**

---

## Collections

### Sidebar

- Tree folder & request
- Drag untuk reorder
- Klik kanan: rename, delete, settings

### Simpan request

Setelah compose request → **Save** → pilih collection/folder.

### Import

**Import** dari sidebar:
- Postman Collection v2.1 (JSON)
- ZReq export
- Multi-file import

### Export

Collection settings → Export sebagai JSON ZReq.

---

## Environments

1. Klik selector environment di toolbar
2. **Manage** untuk buat/edit/delete environment
3. Tambah key-value variables
4. Import dari Postman, ZReq, atau file `.env`

Perubahan variable **autosave** ke local replica dan di-sync ke server.

---

## Sync

### Status

Footer/toolbar menampilkan status sync dan jumlah perubahan pending (outbox).

### Strategi upload

**Settings → General → Server sync (upload)**:

| Mode | Perilaku |
|------|----------|
| Automatic (debounced) | Push otomatis setelah edit (~450ms) |
| Periodic | Push setiap N menit jika ada perubahan |
| Manual only | Hanya push saat klik **Sync** |

Background **pull** tetap berjalan agar data server tetap up-to-date.

### Konflik

Jika edit lokal bentrok dengan server, dialog konflik muncul dengan diff. Pilih versi lokal, server, atau resolve per-field.

---

## Settings lainnya

- **Bahasa**: English / Bahasa Indonesia
- **Theme accent**: warna aksen UI
- **MCP OAuth clients**: kelola OAuth client untuk integrasi MCP (admin)

---

## Command palette

`Ctrl+K` / `Cmd+K` — quick access ke actions (new request, switch workspace, settings, dll).

---

## Tips

- Gunakan **multiple tabs** untuk bekerja dengan beberapa request sekaligus
- Tab bertanda dirty = ada perubahan belum disimpan ke koleksi
- Saat offline, edit tetap tersimpan lokal; sync saat online kembali
- Untuk ngrok backend, app otomatis kirim header bypass interstitial
