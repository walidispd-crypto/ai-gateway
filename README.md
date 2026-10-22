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
WORKER_CODER_FAST_URL=http://127.0.0.1:8787/openai
WORKER_CODER_FAST_TOKEN=dev-token-fast
WORKER_CODER_DEEP_URL=http://127.0.0.1:8787/sse-text
WORKER_CODER_DEEP_TOKEN=dev-token-deep
WORKER_GENERAL_URL=http://127.0.0.1:8787/json-text
WORKER_GENERAL_TOKEN=dev-token-general
```

`SESSION_SECRET` minimal 32 karakter (`openssl rand -base64 48`). Tanpa secret atau `APP_PASSWORD`, login dan `/api/chat` menolak semua permintaan.

Perintah lain:

```bash
npm run build        # build produksi + cek TypeScript & lint
npm run lint
npm run format       # Prettier
npm run test:smoke   # end-to-end lewat HTTP; butuh mock worker + server berjalan
npm run test:ui      # render UI di jsdom (streaming, markdown, kode, stop, ekspor/impor)
npm run test:types   # typecheck khusus kode tes
```

`test:ui` memakai jsdom + tsx (devDependencies) dan tidak butuh browser. Tes ini memverifikasi
mount, pengiriman pesan, streaming NDJSON, highlight Shiki, state error/terputus, tombol Stop,
serta ekspor → impor yang identik.

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
  "model": "opsional, dari upstreamModel"
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

## Deploy ke Vercel

1. Push repo ke GitHub, impor di Vercel. Framework terdeteksi otomatis (Next.js).
2. Tambahkan `APP_PASSWORD`, `SESSION_SECRET`, dan semua `WORKER_*` di Project Settings → Environment Variables untuk Production (dan Preview bila perlu). Gunakan tipe _Sensitive_ untuk token.
3. Deploy. Setelah itu buka `/login` dan masuk.
4. `maxDuration` route handler diset 60 detik (`src/app/api/chat/route.ts`). Batas ini mengikuti plan Vercel: pada Hobby satu function tidak boleh berjalan lebih dari 60 detik, jadi jawaban yang lebih lama akan terpotong. Streaming tidak menambah batas waktu function; bila butuh jawaban lebih lama, naikkan `maxDuration` sesuai batas plan atau pecah permintaan.
5. Pastikan Worker mengizinkan request dari Vercel (tidak perlu CORS karena dipanggil server-ke-server) dan mengembalikan respons streaming tanpa buffer proxy.

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
- Highlight kode dimatikan untuk blok > 40.000 karakter (tetap bisa disalin).
