# Worker contoh

Implementasi acuan kontrak endpoint AI Gateway dalam satu Worker: melayani `/openai`,
`/sse-text`, dan `/json-text`, memeriksa bearer token, serta melakukan streaming.

```bash
npm install
npm run dev        # http://127.0.0.1:8788 (mode MOCK=1 dari wrangler.jsonc)
npm run deploy     # setelah wrangler login
```

Sebelum deploy:

```bash
wrangler secret put WORKER_TOKEN      # token yang nanti dipakai Vercel
wrangler secret put UPSTREAM_TOKEN    # token provider model (bila ada)
```

Lalu isi `vars` di `wrangler.jsonc`:

```jsonc
"vars": {
  "MOCK": "0",
  "UPSTREAM_URL": "https://api.openai.com/v1/chat/completions",
  "UPSTREAM_MODEL": "gpt-4.1-mini"
}
```

URL Worker hasil deploy dipakai di Vercel dengan menambahkan path sesuai format, mis.
`https://<worker>.workers.dev/openai` untuk model berformat `openai`.

Penjelasan langkah demi langkah ada di [`../../docs/DEPLOY.md`](../../docs/DEPLOY.md).
