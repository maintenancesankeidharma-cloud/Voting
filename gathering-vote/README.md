# Voting Keikutsertaan Gathering

Website satu halaman untuk voting keikutsertaan gathering kegiatan (Ya / Tidak / Mungkin) lengkap dengan dashboard ringkasan hasil. Data disimpan di **Supabase**, website di-host di **GitHub Pages**.

## Fitur
- Form voting: Nama + Kontak + pilih status (Ya / Tidak / Mungkin)
- Dashboard summary: jumlah & persentase per status, grafik batang, dan daftar peserta
- Data gabungan semua peserta (dari Supabase), otomatis diperbarui

## 1. Setup Supabase

1. Buat proyek gratis di [supabase.com](https://supabase.com)
2. Buka **SQL Editor** → New query → salin isi `supabase-schema.sql` → Run
3. Buka **Settings → API**. Salin `Project URL` dan `anon public` key.
4. Buka **`config.js`** lalu isi:
   ```js
   window.SUPABASE_URL = "https://xxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGci...";
   ```

> Keamanan: karena pakai `anon` key dengan RLS, publik hanya bisa INSERT & SELECT. Disarankan dashboard tidak menampilkan data terlalu sensitif.

## 2. Uji lokal
Buka `index.html` di browser (atau jalankan `python -m http.server` lalu buka `http://localhost:8000`).

## 3. Deploy ke GitHub Pages

**Cara A – Deploy isi folder `gathering-vote` sebagai situs (rekomendasi):**
1. Push folder ini ke repo GitHub.
2. Buat file `.github/workflows/deploy.yml` di root repo dengan isi berikut (sudah disertakan di `.github/workflows/`):
   ```yaml
   name: Deploy Gathering Vote to GitHub Pages
   on:
     push:
       branches: [main, master]
     workflow_dispatch:
   permissions:
     contents: read
     pages: write
     id-token: write
   concurrency:
     group: pages
     cancel-in-progress: false
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v3
           with:
             path: gathering-vote
         - uses: actions/deploy-pages@v4
   ```
3. Di repo GitHub: **Settings → Pages → Source: GitHub Actions**
4. Push perubahan → GitHub Pages otomatis membangun & men-deploy.

**Cara B – Sederhana (cabang `gh-pages`):**
1. Jalankan dari folder proyek:
   ```
   git init
   git branch -M main
   git add .
   git commit -m "init"
   git push -u origin main
   git push origin main:gh-pages
   ```
2. **Settings → Pages → Deploy from a branch → `gh-pages` / root**
3. Situs bisa dibuka di `https://<username>.github.io/<repo>/`

## Struktur File
```
gathering-vote/
├── index.html           # Halaman form + dashboard
├── app.js               # Logika voting & tampilan dashboard
├── config.js            # ★ Isi URL & anon key Supabase di sini
├── supabase-schema.sql  # Skema tabel + kebijakan RLS
└── .github/workflows/deploy.yml  # Workflow deploy GitHub Pages
```
