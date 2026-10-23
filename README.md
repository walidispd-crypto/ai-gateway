# AI Gateway

Web chat AI pribadi (satu pengguna) untuk coding dan pertanyaan umum. UI Next.js di Vercel, model dilayani oleh Cloudflare Worker milik pemilik melalui proxy tipis di route handler. Tidak ada database; riwayat percakapan disimpan di IndexedDB browser.

## Stack

- Next.js 15 (App Router) + TypeScript strict + Tailwind CSS
- `react-markdown` + `remark-gfm`, syntax highlight `shiki` (lazy-load, dual theme)
- `zustand` untuk state, `idb-keyval` untuk IndexedDB
- `zod` untuk validasi body API dan file impor (dimuat dinamis di client)
- Runtime route handler: Node.js (alasan di `DECISIONS.md`)

## Setup lokal

```bash
npm install
cp .env.example .env.local     # isi APP_PASSWORD, SESSION_SECRET, URL Worker
npm run mock-worker            # terminal 1: mock Worker di 127.0.0.1:8787
npm run dev                    # terminal 2: http://localhost:3000
```

`.env.local` untuk mencoba dengan mock:

```
APP_PASSWORD=rahasia-uji-123
SESSION_SECRET=uji-secret-yang-cukup-panjang-untuk-hmac-32-plus
WORKER_RADOX_URL=http://127.0.0.1:8787/openai
WORKER_RADOX_TOKEN=dev-token-radox
WORKER_P2_URL=http://127.0.0.1:8787/openai
WORKER_P2_TOKEN=dev-token-p2
WORKER_P3_URL=http://127.0.0.1:8787/openai
WORKER_P3_TOKEN=dev-token-p3
```

`SESSION_SECRET` minimal 32 karakter (`openssl rand -base64 48`). Tanpa secret atau `APP_PASSWORD`, login dan `/api/chat` menolak semua permintaan.

Perintah lain:

```bash
npm run build        # build produksi + cek TypeScript & lint
npm run lint
npm run format       # Prettier
npm run test:smoke   # end-to-end lewat HTTP; butuh mock worker + server berjalan
npm run test:ui      # render UI di jsdom (streaming, markdown, kode, stop, ekspor/impor, nama model)
npm run test:server  # aturan override model + adapter format (tanpa server)
npm run test:types   # typecheck khusus kode tes
```

`test:ui` memakai jsdom + tsx (devDependencies) dan tidak butuh browser. Tes ini memverifikasi
mount, pengiriman pesan, streaming NDJSON, highlight Shiki, state error/terputus, tombol Stop,
persistensi IndexedDB (simpan → muat ulang → render), ekspor → impor yang identik, nama model
kustom (simpan, reset, saran, persistensi, validasi, impor file lama), serta panel file: tag
terpotong antar chunk, beberapa file sekaligus, versi dengan nama sama, stream dihentikan di
tengah file, kode berisi teks mirip tag, salin/unduh, pratinjau iframe sandbox, dan persistensi
panel setelah muat ulang.

## Daftar env var

| Variabel              | Wajib     | Keterangan                                                         |
| --------------------- | --------- | ------------------------------------------------------------------ |
| `APP_PASSWORD`        | ya        | Satu kata sandi pemilik.                                           |
| `SESSION_SECRET`      | ya        | Kunci HMAC cookie sesi, ≥ 32 karakter.                             |
| `WORKER_<NAMA>_URL`   | per model | URL Worker. Nama harus cocok dengan `endpointEnv` di registry.     |
| `WORKER_<NAMA>_TOKEN` | opsional  | Bearer token yang dikirim ke Worker. Nama cocok dengan `tokenEnv`. |

Semua variabel hanya dibaca di server. Jangan memakai prefix `NEXT_PUBLIC_`.

## Kontrak endpoint (Worker)

Proxy mengirim `POST` ke URL Worker dengan header `Content-Type: application/json`, `Accept: text/event-stream` (atau `application/json` untuk `json-text`), dan `Authorization: Bearer <token>` bila token diatur.

Body default:

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "system": "instruksi sistem (hanya bila supportsSystemPrompt=true)",
  "stream": true,
  "model": "opsional: customModel dari chat, atau upstreamModel registry"
}
```

`role` hanya `user` atau `assistant`. Bila model di registry memakai `supportsSystemPrompt: false`, `system` tidak dikirim sebagai field; teksnya ditempel di awal pesan user pertama.

Format respons yang didukung (`format` di registry):

1. **`openai`** — SSE gaya OpenAI:

   ```
   data: {"choices":[{"delta":{"content":"Halo"}}]}

   data: [DONE]
   ```

2. **`sse-text`** — SSE dengan teks mentah:

   ```
   data: Halo

   ```

   Beberapa baris `data:` dalam satu event digabung dengan `\n`.

3. **`json-text`** — respons JSON non-stream: `{ "text": "..." }`. Ditampilkan sebagai satu potongan.

Catatan perilaku:

- Non-2xx diteruskan sebagai pesan ringkas (`Coder Fast menolak permintaan (HTTP 500).`); body Worker tidak pernah diteruskan dan URL/token tidak pernah muncul di UI.
- Timeout header/first-token default 60 detik (`timeoutMs`), jeda antar potongan default 30 detik (`idleTimeoutMs`). Keduanya dapat diatur per model.
- Fallback hanya dicoba bila model gagal **sebelum** potongan pertama. UI menampilkan model mana yang akhirnya menjawab.
- Abort dari tombol Stop diteruskan ke `fetch` upstream (socket Worker ikut ditutup).
- Proxy memakai NDJSON (`{"type":"meta"|"delta"|"done"|"error",...}` per baris) antara browser dan Vercel, bukan SSE. Worker tetap memakai salah satu format di atas.

## Menambah Worker/model

1. Tambah satu entri di `src/config/models.ts`:

   ```ts
   {
     id: "reviewer-cepat",
     label: "Reviewer Cepat",
     description: "Review diff dan patch",
     endpointEnv: "WORKER_REVIEWER_CEPAT_URL",
     tokenEnv: "WORKER_REVIEWER_CEPAT_TOKEN",
     format: "openai",
     supportsSystemPrompt: true,
     maxContextChars: 48_000,
     tags: ["code", "fast"],
   }
   ```

2. Tambah `WORKER_REVIEWER_CEPAT_URL` (+ token bila ada) ke `.env.local` dan environment Vercel.
3. Redeploy. Tidak ada perubahan komponen atau kode lain.

Field opsional: `timeoutMs`, `idleTimeoutMs`, `fallbackId`, `upstreamModel`. `tags` dan `description` hanya untuk tampilan. `maxContextChars` dipakai untuk indikator konteks dan pemangkasan.

### Nama model kustom (tanpa redeploy)

Entri `MODELS` berperan sebagai **penyedia**: satu Worker + URL + token. Nama model yang dikirim ke penyedia bisa diisi dari UI:

1. Di header, isi kolom **Nama model** (mis. `claude-opus-5`), lalu **Simpan**. Nilai ini disimpan per percakapan dan dipakai sebagai field `model` ke Worker menggantikan `upstreamModel`.
2. **Reset** menghapus override dan kembali memakai `upstreamModel` entri.
3. Nama yang pernah disimpan muncul di tombol panah sebagai saran, dikelompokkan per penyedia, dan bisa dihapus satu per satu. Saran disimpan di IndexedDB (global, bukan per percakapan).
4. Nama yang valid: 1–100 karakter dari `A-Z a-z 0-9 . _ : / -`; spasi dan karakter lain ditolak dengan pesan di UI (server juga memvalidasi dan membalas 400).

Override hanya mengubah nama model. URL dan token selalu dari env server. Override **tidak** diteruskan ke model fallback: fallback memakai `upstreamModel` miliknya sendiri, karena katalog nama tiap penyedia berbeda. Karena itu input dinonaktifkan untuk penyedia berformat selain `openai` (`supportsCustomModel` di payload `/`), dan mengganti penyedia mereset override percakapan. Nama kustom tidak perlu ditambahkan ke registry.

## Panel file

Jawaban yang berisi file tidak lagi menumpuk di bubble: setiap file menjadi kartu ringkas (nama, bahasa, jumlah baris, tombol **Buka**) dan isinya ditampilkan di panel kanan, atau lembar layar penuh di layar kecil.

### Konvensi untuk model

Aktifkan preset **Mode file** di dialog **Sistem**. Preset itu meminta model menulis setiap file utuh dengan penanda:

```
<file name="src/models.ts" lang="ts">
...isi file lengkap...
</file>
```

Aturan yang diminta ke model: satu tag per file, isi lengkap (bukan potongan), penjelasan di luar tag, dan revisi ditulis ulang dengan nama yang sama. Nama dibersihkan dari path dan karakter berbahaya sebelum dipakai untuk unduhan; bahasa jatuh ke ekstensi bila atribut `lang` tidak ada.

Karena tidak semua model menaati konvensi, blok kode berpagar yang lebih dari 30 baris juga otomatis tampil sebagai file. Nama dan bahasanya diambil dari info string (` `ts models.ts `, ` `ts title="models.ts" `, atau ` `{.ts file="models.ts"} ```); bila tidak ada nama, panel memakai `cuplikan-<n>.<ext>`.

### Perilaku

- Parser membaca teks pesan saat render, jadi **tidak ada perubahan skema penyimpanan**: percakapan lama dan file ekspor/impor lama tetap sah.
- Tag yang terpotong antar chunk tidak bocor ke bubble: file yang sedang ditulis tampil langsung di panel dengan penanda **menulis…**. Bila stream di-Stop atau terputus, file yang belum tertutup tetap ditampilkan sebagai yang sudah ada dan ditandai **belum selesai**.
- Beberapa file dalam satu jawaban menjadi tab. Nama yang sama yang muncul lagi menjadi versi baru (`v1`, `v2`, …) dengan pemilih versi; versi terbaru dipilih otomatis.
- `.md` dirender sebagai pratinjau, `.html`/`.svg` punya toggle **Kode/Pratinjau**.
- Status panel (terbuka/tertutup) dan tab aktif diingat per percakapan di IndexedDB (`ai-gateway:file-panel:v1`), terpisah dari pesan.
- Tombol panel: **Salin**, **Unduh** (nama file sudah disanitasi), **Perluas** (desktop), **Tutup**.

### Keamanan pratinjau

Isi file selalu dirender sebagai teks di halaman utama. Pratinjau HTML/SVG hanya lewat `<iframe sandbox="">` tanpa `allow-same-origin` dan tanpa `allow-scripts`, sehingga tidak bisa menyentuh cookie, DOM induk, maupun aplikasi. Setiap dokumen pratinjau juga membawa CSP sendiri (`default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:`), jadi tidak ada akses jaringan ke luar. CSP halaman **tidak dilonggarkan**: `frame-src` tetap `'none'` karena arahan itu tidak mengatur `srcdoc` (penjelasan di `DECISIONS.md`).

## Deploy ke Vercel

1. Push repo ke GitHub, impor di Vercel. Framework terdeteksi otomatis (Next.js).
2. Tambahkan `APP_PASSWORD`, `SESSION_SECRET`, dan semua `WORKER_*` di Project Settings → Environment Variables untuk Production (dan Preview bila perlu). Gunakan tipe _Sensitive_ untuk token.
3. Deploy. Setelah itu buka `/login` dan masuk.
4. `maxDuration` route handler diset 300 detik (`src/app/api/chat/route.ts`). Dengan Fluid Compute (default sekarang) Hobby mengizinkan 300 detik dan Pro sampai 800 detik. Perhatikan juga `timeoutMs` per model (default 60 detik untuk token pertama): jawaban yang lama sebelum token pertama akan gagal di situ walau `maxDuration` besar.
5. Pastikan Worker mengizinkan request dari Vercel (tidak perlu CORS karena dipanggil server-ke-server) dan mengembalikan respons streaming tanpa buffer proxy.

Panduan langkah demi langkah dari nol — termasuk membuat dan mendeploy Worker, verifikasi, rollback, dan troubleshooting — ada di [`docs/DEPLOY.md`](docs/DEPLOY.md). Worker contoh yang siap pakai ada di [`examples/worker`](examples/worker).

## Keamanan

- Password dibandingkan constant-time; sesi = payload kedaluwarsa + HMAC-SHA256, cookie `httpOnly`, `secure` di produksi, `sameSite=lax`, 30 hari.
- Middleware melindungi semua halaman dan `/api/*` kecuali `/login` dan `/api/login`.
- Rate limit login: 8 percobaan / 10 menit per IP **per instance** (memori proses; Vercel bisa menjalankan beberapa instance, jadi batas efektif lebih longgar).
- Markdown dirender tanpa HTML mentah (`skipHtml`); tautan keluar memakai `rel="noopener noreferrer"`.
- CSP berbasis nonce (middleware), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `frame-ancestors 'none'`. `img-src` dibatasi ke origin sendiri, `data:`, dan `blob:`.
- Framing hanya dibuka bila `ALLOW_IFRAME_EMBED=1` (dipakai untuk panel preview di sandbox). Jangan set di Vercel.
- Body `/api/chat` dibatasi 1,5 MB; pesan maksimal 200.000 karakter; maksimal 200 pesan per permintaan.

## Struktur

```
src/
  app/            halaman, layout, route handler API
  components/     UI (chat, login, ikon, tema)
  config/         registry model + preset system prompt
  lib/            tipe, store, storage, hook streaming, highlighter, util
  server/         auth, rate limit, resolver model, stream, adapters/
scripts/          mock Worker + smoke test
```

## Batasan yang diketahui

- Tidak ada multi-user, sinkronisasi antar perangkat, atau pencarian isi pesan (hanya judul).
- Model dipilih per percakapan; menghapus percakapan tidak bisa dibatalkan.
- Fallback tidak menyamar: nama model yang menjawab selalu terlihat di pesan.
- File diturunkan dari teks pesan; isi file di dalam tag `</file>` tidak bisa memuat `</file>` sendiri.
- Blok kode lebih dari 30 baris selalu tampil sebagai kartu file (bukan blok kode inline).
- Highlight kode dimatikan untuk blok > 40.000 karakter (tetap bisa disalin).
