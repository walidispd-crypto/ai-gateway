# Panduan Deploy Lengkap

Dari nol sampai aplikasi jalan di Vercel: siapkan Worker di Cloudflare, deploy UI + proxy,
verifikasi, lalu rawat. Estimasi 20–30 menit untuk pertama kali.

Urutan penting: **Worker dulu, Vercel belakangan.** Vercel baru bisa diuji setelah ada URL
Worker yang menjawab, karena setiap request chat diteruskan ke sana.

```
Browser ──► Vercel (Next.js + /api/chat) ──► Cloudflare Worker ──► model AI
             menyimpan secret, sesi           endpoint milikmu
```

---

## 0. Prasyarat

| Kebutuhan         | Keterangan                                                             |
| ----------------- | ---------------------------------------------------------------------- |
| Node.js 20+       | `node -v`. Repo memakai npm dan sudah menyertakan `package-lock.json`. |
| Akun Cloudflare   | Plan Free cukup untuk satu pengguna (100.000 request/hari).            |
| Akun Vercel       | Plan Hobby cukup (durasi function hingga 300 detik).                   |
| Repo di GitHub    | `walidispd-crypto/ai-gateway`, branch `main` sudah berisi kode final.  |
| Domain (opsional) | Bisa memakai `*.vercel.app` lebih dulu.                                |

---

## Bagian A — Cloudflare Worker

Worker adalah tempat URL dan token model berada. Aplikasi hanya mengenal Worker lewat
env var di server Vercel, jadi browser tidak pernah melihat alamat aslinya.

### A.1 Pasang Wrangler dan login

```bash
npm install -g wrangler      # atau pakai npx wrangler ...
wrangler login                # membuka browser
wrangler whoami               # cek akun & Account ID
```

Untuk CI/server tanpa browser, buat API Token di dash.cloudflare.com → My Profile →
API Tokens → template **Edit Cloudflare Workers**, lalu:

```bash
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
```

### A.2 Siapkan project Worker

Repo ini menyertakan Worker contoh yang **sudah sesuai kontrak** aplikasi:

```bash
cp -r examples/worker ~/ai-worker
cd ~/ai-worker
npm install
```

Isi file pentingnya:

| File             | Fungsi                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `src/index.ts`   | Router `/openai`, `/sse-text`, `/json-text`, cek token, streaming. |
| `wrangler.jsonc` | Nama Worker, `main`, `compatibility_date`, `vars`.                 |
| `tsconfig.json`  | Typecheck dengan tipe `@cloudflare/workers-types`.                 |

Kalau kamu sudah punya Worker sendiri, lewati langkah ini dan pastikan ia memenuhi
[Bagian A.6](#a6-kontrak-respons-yang-harus-dipenuhi). Detail kontrak lengkap ada di
`README.md` bagian _Kontrak endpoint_.

### A.3 Pilih mode: mock atau model sungguhan

**Mode mock** (tanpa model, untuk menguji jalur deploy). Di `wrangler.jsonc`:

```jsonc
"vars": { "MOCK": "1" }
```

**Mode sungguhan.** Endpoint apa pun yang kompatibel OpenAI (OpenAI, Groq, Together,
OpenRouter, Cloudflare AI Gateway, Ollama di VPS, dll.):

```jsonc
"vars": {
  "MOCK": "0",
  "UPSTREAM_URL": "https://api.openai.com/v1/chat/completions",
  "UPSTREAM_MODEL": "gpt-4.1-mini"
}
```

Token upstream **jangan** ditaruh di `vars` (ikut terbaca di repo/dashboard). Pakai secret:

```bash
wrangler secret put UPSTREAM_TOKEN
```

> Kalau memakai Cloudflare Workers AI, ganti `fetchUpstream` di `src/index.ts` dengan
> binding `env.AI` (`@cf/meta/llama-3.1-8b-instruct`) dan tambahkan `"ai": { "binding": "AI" }`
> di `wrangler.jsonc`. Struktur respons SSE-nya berbeda, jadi bagian normalisasi perlu disesuaikan.

### A.4 Pasang token untuk aplikasi

Token ini yang nanti dikirim Vercel sebagai `Authorization: Bearer ...`:

```bash
wrangler secret put WORKER_TOKEN
# tempel string acak, mis. hasil: openssl rand -hex 24
```

Tanpa `WORKER_TOKEN`, Worker menerima siapa pun yang tahu URL-nya. Selalu pasang.

### A.5 Uji lokal sebelum deploy

```bash
npm run dev        # http://127.0.0.1:8788
```

```bash
TOKEN=dev-token   # samakan dengan --var WORKER_TOKEN saat dev
BODY='{"messages":[{"role":"user","content":"Halo"}],"system":"Kamu asisten."}'

curl -s http://127.0.0.1:8788/health

curl -s -X POST http://127.0.0.1:8788/openai \
  -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" -d "$BODY" | head -3

curl -s -X POST http://127.0.0.1:8788/sse-text \
  -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" -d "$BODY" | head -3

curl -s -X POST http://127.0.0.1:8788/json-text \
  -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" -d "$BODY" | head -c 200

# token salah harus 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8788/openai \
  -H 'content-type: application/json' -H 'Authorization: Bearer salah' -d "$BODY"
```

Untuk `wrangler dev` dengan token: `wrangler dev --var WORKER_TOKEN:dev-token`.

### A.6 Kontrak respons yang harus dipenuhi

Aplikasi mengenal tiga format; pilih satu per model di registry (`src/config/models.ts`).

| `format`    | Bentuk respons                                                                 | Catatan                                                                 |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `openai`    | SSE `data: {"choices":[{"delta":{"content":"..."}}]}`, diakhiri `data: [DONE]` | Paling aman bila upstream sudah OpenAI-compatible.                      |
| `sse-text`  | SSE `data: <teks mentah>` per event                                            | Beberapa baris `data:` digabung dengan `\n`, jadi newline tidak hilang. |
| `json-text` | `{ "text": "..." }` non-stream                                                 | Tampil sekaligus, bukan bertahap.                                       |

Yang **wajib** dipatuhi:

1. **Streaming benar-benar bertahap.** Kirim `Response` dengan `ReadableStream`; jangan
   `await` seluruh jawaban lalu mengirim sekali. Jangan aktifkan kompresi pada body SSE.
2. **Cek token** dan balas `401` bila salah.
3. **Non-2xx untuk error**, bukan `200` berisi pesan error.
4. Jangan menambahkan header CORS — pemanggilnya server Vercel, bukan browser.

### A.7 Deploy Worker

```bash
npx tsc --noEmit        # pastikan tidak ada error tipe
wrangler deploy
```

Wrangler mencetak URL, misalnya:

```
https://ai-gateway-workers.<subdomain>.workers.dev
```

Catat **base URL** ini; path-nya digabung di env Vercel (`.../openai`, `.../sse-text`,
`.../json-text`).

Uji Worker yang sudah live:

```bash
curl -s https://ai-gateway-workers.<subdomain>.workers.dev/health
curl -sN -X POST https://ai-gateway-workers.<subdomain>.workers.dev/sse-text \
  -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"messages":[{"role":"user","content":"Halo"}]}'
```

`curl -N` mematikan buffer curl, sehingga potongan teks muncul satu per satu. Kalau semuanya
muncul di akhir, berarti ada yang meng-buffer (lihat [Troubleshooting](#bagian-e--troubleshooting)).

### A.8 Domain sendiri untuk Worker (opsional)

```jsonc
// wrangler.jsonc
"routes": [{ "pattern": "ai.contoh.com", "custom_domain": true }]
```

Lalu `wrangler deploy` dan tambahkan record DNS yang diminta. Memakai domain sendiri membuat
URL Worker lebih stabil dan lebih sulit ditebak dibanding `workers.dev`.

### A.9 Batas Cloudflare yang perlu diketahui

| Fitur                    | Free                                | Paid ($5/bln)                         |
| ------------------------ | ----------------------------------- | ------------------------------------- |
| Request                  | 100.000/hari                        | 10 juta/bulan, lalu $0.30/juta        |
| CPU time / request       | 10 ms                               | 30 detik default, bisa sampai 5 menit |
| Subrequest / request     | 50                                  | 10.000 (bisa dinaikkan)               |
| Wall time saat streaming | Tak dibatasi selama klien terhubung | Sama                                  |

CPU dihitung dari kerja nyata, **bukan** waktu menunggu model menjawab. Untuk pemakaian satu
orang, plan Free hampir selalu cukup; batas 10 ms baru terasa kalau Worker memproses JSON
besar atau melakukan kriptografi berat per request.

---

## Bagian B — Vercel

### B.1 Import repo

1. Buka <https://vercel.com/new>, pilih repo `ai-gateway`.
2. Framework Preset: **Next.js** (terdeteksi otomatis). Root Directory: kosongkan.
   Build Command & Output Directory: biarkan default.
3. Tidak perlu `vercel.json` — konfigurasi rute dan header sudah ada di kode.

### B.2 Isi Environment Variables

Project Settings → Environment Variables. Centang **Production** (dan **Preview** bila ingin
preview bisa dipakai), lalu untuk token pilih tipe **Sensitive**.

| Nama                      | Wajib      | Contoh nilai                                         |
| ------------------------- | ---------- | ---------------------------------------------------- |
| `APP_PASSWORD`            | ya         | kata sandi pilihanmu, disimpan sebagai Sensitive     |
| `SESSION_SECRET`          | ya         | `openssl rand -base64 48` — **minimal 32 karakter**  |
| `WORKER_CODER_FAST_URL`   | ya\*       | `https://ai-gateway-workers.x.workers.dev/openai`    |
| `WORKER_CODER_FAST_TOKEN` | disarankan | token dari `wrangler secret put WORKER_TOKEN`        |
| `WORKER_CODER_DEEP_URL`   | ya\*       | `https://ai-gateway-workers.x.workers.dev/sse-text`  |
| `WORKER_CODER_DEEP_TOKEN` | disarankan | idem                                                 |
| `WORKER_GENERAL_URL`      | ya\*       | `https://ai-gateway-workers.x.workers.dev/json-text` |
| `WORKER_GENERAL_TOKEN`    | disarankan | idem                                                 |

\* Hanya untuk model yang benar-benar kamu pakai. Model tanpa URL akan menampilkan pesan
"URL Worker ... belum diatur di server" di UI, bukan crash.

Nama env **harus sama** dengan `endpointEnv`/`tokenEnv` di `src/config/models.ts`. Kalau beda,
model dianggap belum dikonfigurasi.

Jangan set `ALLOW_IFRAME_EMBED` di Vercel. Variabel itu hanya untuk panel preview yang
menempelkan app dalam iframe; tanpanya aplikasi menolak di-embed.

### B.3 Durasi function

`src/app/api/chat/route.ts` mengekspor `maxDuration`. Dengan Fluid Compute (default aktif),
batasnya per plan:

| Plan             | Default   | Maksimum                                   |
| ---------------- | --------- | ------------------------------------------ |
| Hobby            | 300 detik | 300 detik                                  |
| Pro / Enterprise | 300 detik | 800 detik (1.800 detik beta, per-function) |

Repo ini memakai `300`. Kalau paket Pro dan jawaban perlu lebih lama, naikkan ke `800` dan
deploy ulang. Bila Fluid Compute dimatikan di project lama, Hobby turun ke 60 detik.

Durasi function **bukan** satu-satunya penjaga: `timeoutMs` (default 60 detik untuk token
pertama) dan `idleTimeoutMs` (default 30 detik jeda antar potongan) diatur per model di
registry. Model reasoning yang butuh 90 detik sebelum token pertama harus diberi
`timeoutMs: 120000`, kalau tidak akan gagal walau `maxDuration` besar.

### B.4 Region

Settings → Functions → Region: pilih yang dekat pengguna **dan** Worker, mis. `sin1`
(Singapore). Vercel menjalankan function di satu region; latensi ke Worker ikut menentukan.

### B.5 Deploy

Klik **Deploy**. Commit ke `main` akan otomatis deploy ulang di kemudian hari.

---

## Bagian C — Verifikasi setelah deploy

Ganti `<domain>` dengan domain Vercel-mu.

```bash
# 1. Halaman login harus terbuka tanpa sesi
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/login          # 200

# 2. Root tanpa sesi harus diarahkan ke /login
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<domain>/  # 307 .../login

# 3. API tanpa sesi harus ditolak
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<domain>/api/chat -d '{}'   # 401

# 4. Login benar → cookie
curl -s -c /tmp/c.txt -X POST https://<domain>/api/login \
  -H 'content-type: application/json' -d '{"password":"<APP_PASSWORD>"}'   # {"ok":true}

# 5. Streaming lewat proxy (NDJSON: meta → delta → done)
curl -sN -b /tmp/c.txt -X POST https://<domain>/api/chat \
  -H 'content-type: application/json' \
  -d '{"modelId":"coder-fast","messages":[{"role":"user","content":"Halo"}]}'
```

Checklist di browser:

- [ ] Login berhasil dan halaman chat terbuka.
- [ ] Kirim "buat fungsi TypeScript untuk fibonacci" → teks muncul **bertahap**, blok kode
      ter-highlight, tombol **Salin** bekerja.
- [ ] Tombol **Stop** menghentikan jawaban; pesan ditandai terputus dan tombol
      **Lanjutkan** muncul.
- [ ] Refresh halaman → percakapan masih ada (IndexedDB).
- [ ] Ganti model di header → jawaban memakai Worker lain (nama model berubah di pesan).
- [ ] Coba di lebar 375px: sidebar jadi drawer, input tidak tertutup keyboard.
- [ ] Toggle tema terang/gelap berfungsi.

Kalau semua lolos, aplikasi siap dipakai.

---

## Bagian D — Menambah model / mengganti model

1. Tambah satu entri di `src/config/models.ts`:

   ```ts
   {
     id: "reviewer",
     label: "Reviewer",
     description: "Review diff dan patch",
     endpointEnv: "WORKER_REVIEWER_URL",
     tokenEnv: "WORKER_REVIEWER_TOKEN",
     format: "openai",
     supportsSystemPrompt: true,
     maxContextChars: 64_000,
     tags: ["code"],
   }
   ```

2. Tambahkan `WORKER_REVIEWER_URL` + token di Vercel (dan `.env.local` untuk lokal).
3. Commit → Vercel deploy otomatis. Tidak ada perubahan komponen.

Field opsional yang sering dipakai: `timeoutMs`, `idleTimeoutMs`, `fallbackId` (model lain yang
dicoba bila gagal sebelum token pertama), `maxContextChars` (indikator + pemangkasan konteks).

---

## Bagian E — Troubleshooting

| Gejala                                           | Penyebab umum                                                                                                             | Solusi                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Login selalu "Kata sandi salah" padahal benar    | `APP_PASSWORD` belum di-set untuk environment yang dipakai (Production vs Preview), atau ada spasi/newline ikut tersimpan | Set ulang env, redeploy. Cek `/api/login` mengembalikan 500 (konfigurasi) atau 401 (sandi salah).  |
| Login sukses tapi langsung terlempar ke `/login` | `SESSION_SECRET` < 32 karakter, atau berubah setelah cookie dibuat                                                        | Pakai secret ≥ 32 karakter, login ulang.                                                           |
| `401 Tidak terautentikasi` di `/api/chat`        | Cookie tidak terkirim (mode private/block third-party), atau `secure` cookie ditolak karena diakses lewat `http://`       | Akses lewat `https://`. Untuk lokal pakai `npm run dev` (cookie tidak `secure` di non-production). |
| "URL Worker untuk X belum diatur di server"      | Nama env tidak cocok dengan registry, atau hanya diisi untuk environment lain                                             | Samakan nama persis, isi juga untuk Preview bila dipakai.                                          |
| "Layanan model menolak permintaan (HTTP 401)"    | `WORKER_TOKEN` di Vercel beda dengan secret di Worker                                                                     | `wrangler secret put WORKER_TOKEN` lalu samakan di Vercel.                                         |
| "Tidak dapat menghubungi Coder Fast"             | URL salah, DNS Worker belum aktif, atau Worker memblokir request non-browser (WAF)                                        | Uji URL yang sama dengan `curl` dari luar Vercel; cek `wrangler tail`.                             |
| `504 FUNCTION_INVOCATION_TIMEOUT`                | Worker lebih lama dari `maxDuration`                                                                                      | Perbesar `maxDuration` (Hobby 300, Pro 800) dan pastikan `timeoutMs` model cukup.                  |
| Jawaban muncul sekaligus di akhir                | Ada buffer di jalur streaming                                                                                             | Pastikan Worker mengembalikan `ReadableStream`; jangan kompres body SSE; uji dengan `curl -N`.     |
| Teks terputus padahal model masih jalan          | Jeda antar potongan > `idleTimeoutMs` (30 detik)                                                                          | Naikkan `idleTimeoutMs` pada model tersebut.                                                       |
| Error 1102 di Cloudflare                         | CPU 10 ms terlampaui (plan Free)                                                                                          | Kurangi kerja CPU di Worker, atau upgrade ke Paid.                                                 |
| Error 1027 di Cloudflare                         | Batas 100.000 request/hari                                                                                                | Tunggu reset 00:00 UTC atau upgrade.                                                               |
| Build Vercel gagal karena `maxDuration`          | Nilai melebihi batas plan                                                                                                 | Turunkan ke 300 (Hobby) atau 800 (Pro).                                                            |
| Halaman preview Vercel bisa diakses publik       | Preview deployment tidak diproteksi                                                                                       | Settings → Deployment Protection → Vercel Authentication.                                          |

Log: `wrangler tail` untuk Worker, tab **Logs** pada deployment Vercel untuk proxy.

---

## Bagian F — Merawat setelah live

| Kebutuhan               | Caranya                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ganti kata sandi        | Ubah `APP_PASSWORD` di Vercel → Redeploy. Sesi lama tetap valid sampai kedaluwarsa.                                                                        |
| Paksa semua sesi keluar | Ganti `SESSION_SECRET` → semua cookie lama tidak valid.                                                                                                    |
| Rotasi token Worker     | `wrangler secret put WORKER_TOKEN` (nilai baru) → ubah `WORKER_*_TOKEN` di Vercel → redeploy. Lakukan berurutan agar tidak ada jendela gagal yang panjang. |
| Rollback Worker         | `wrangler deployments list` lalu `wrangler rollback <version-id>`.                                                                                         |
| Rollback Vercel         | Deployments → pilih deployment lama → **Promote to Production**.                                                                                           |
| Lihat error produksi    | `wrangler tail` (Worker) + Vercel Logs (proxy). Pesan error yang tampil ke pengguna sengaja dibuat ringkas dan tidak memuat URL/token.                     |
| Domain sendiri          | Vercel → Settings → Domains → tambahkan domain, arahkan DNS sesuai instruksi.                                                                              |

---

## Bagian G — Ringkasan biaya

| Komponen                | Biaya untuk satu pengguna        |
| ----------------------- | -------------------------------- |
| Cloudflare Workers Free | $0 (100.000 request/hari)        |
| Vercel Hobby            | $0                               |
| Model AI                | sesuai provider yang kamu tunjuk |

Yang paling mungkin menagih adalah model AI itu sendiri, bukan infrastrukturnya.
