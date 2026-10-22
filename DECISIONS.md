# Keputusan teknis

- **Next.js 15 + React 19 + Tailwind 3, npm.** Versi dipin agar build reprodusibel; `package-lock.json` ikut di-commit.
- **Route handler Node, bukan edge.** Streaming dan `AbortController` sama-sama didukung, tetapi Node memberi batas waktu function yang eksplisit (`maxDuration = 60`) dan tidak menambah batas ukuran respons edge. Tidak ada keuntungan edge untuk satu pengguna.
- **Browser ↔ Vercel memakai NDJSON, bukan SSE.** Satu JSON per baris tidak bisa di-buffer sebagian proxy dan parser-nya ±20 baris, sementara Worker tetap memakai kontrak SSE/JSON yang sudah ditentukan.
- **Registry model tetap di server; client menerima field tampilan lewat props RSC.** Ini menjaga nama env dan konfigurasi Worker tidak masuk bundle, tanpa memecah registry jadi dua file.
- **zod hanya di server dan dimuat dinamis untuk validasi impor.** Client memakai type guard kecil untuk event stream agar bundel awal tidak bertambah ±13 KB.
- **Shiki core + JavaScript regex engine + impor bahasa per-blok.** Tidak ada WASM yang perlu diunduh/diizinkan CSP; tema `github-light`/`github-dark` di-tokenisasi sekaligus sehingga toggle tema hanya mengganti CSS variable, bukan mengulang highlight.
- **CSP nonce via middleware + `force-dynamic`.** Halaman statis tidak bisa memakai nonce per-request; aplikasi ini tidak butuh caching HTML.
- **Tanpa Vercel AI SDK.** Kontrak Worker ditentukan pemilik; yang dibutuhkan hanya `fetch` + parser, dan SDK akan menambah lapisan serta asumsi format.
- **Konteks dipangkas dari pesan terlama, bukan memotong satu pesan.** Pesan terakhir selalu dikirim utuh agar tempelan besar tetap sampai; jumlah yang dibuang diberitahukan di atas input.
- **"Lanjutkan" menambahkan teks ke pesan asisten yang sama** dengan instruksi user tambahan, agar riwayat tidak dipenuhi pesan palsu.
- **Lampiran jadi blok kode berlabel**: satu baris nama file dalam inline code diikuti fenced block. Format ini tetap terbaca sebagai teks biasa dan tidak merusak isi kode saat disalin.
- **`<dialog>` native dan `window.confirm`** untuk system prompt dan hapus percakapan; keduanya sudah menangani fokus, Esc, dan pembaca layar tanpa dependensi UI.
- **Rate limit login di memori proses.** Cukup untuk satu instance dan memperlambat tebing password; batas ini didokumentasikan di README, bukan dianggap global.
- **Framing ditolak secara default, dengan opt-in `ALLOW_IFRAME_EMBED=1`** untuk panel preview yang menempelkan app dalam iframe; opsi ini tidak dipakai di produksi.
- **`img-src` tidak mengizinkan domain luar**, sehingga gambar dari internet di dalam markdown tidak dimuat (pilihan sadar untuk privasi).
- **Fallback hanya sebelum token pertama dan selalu ditampilkan.** Menyembunyikan perpindahan model akan menyesatkan saat membandingkan kualitas jawaban.
- **Timeout diuji dengan entri registry sementara** (`probe-test`, `timeoutMs: 1500`, `idleTimeoutMs: 1200`) yang dihapus setelah verifikasi; ini sekaligus membuktikan penambahan model hanya butuh satu entri + satu env var.
