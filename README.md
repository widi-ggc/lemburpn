# Web App Manajemen Lembur Karyawan

Struktur proyek awal (Tahap 1 dari 14). Dibangun bertahap sesuai roadmap di bawah.
Tidak menggunakan framework (React/Vue/Angular/Laravel) — murni HTML5, Tailwind CSS (CDN/utility class), dan Vanilla JavaScript (ES6 Modules).

## Fitur Kelola Karyawan (Khusus Admin)

Selain roadmap awal, ditambahkan halaman **Kelola Karyawan** (`karyawan.html`) agar Admin bisa mendaftarkan akun karyawan baru langsung dari aplikasi (tidak perlu manual lewat Firebase Console lagi).

**Skema data `users` sekarang:**
```
users/{uid}
  nomorId    : string   // Nomor ID Karyawan, WAJIB UNIK
  nama       : string
  divisi     : string
  email      : string
  role       : "admin" | "karyawan"
  createdAt  : string (ISO date)
```

**Cara kerja pendaftaran akun baru:**
- Nomor ID dicek dulu ke Firestore — jika sudah dipakai karyawan lain, akan ditolak dengan pesan error.
- Saat submit, aplikasi membuat akun login (Firebase Authentication) DAN profil data (Firestore) sekaligus.
- Teknik khusus dipakai agar sesi login Admin tidak ikut tergantikan oleh akun karyawan yang baru dibuat: proses pembuatan akun dijalankan lewat **instance Firebase App kedua yang sementara**, langsung dibuang setelah selesai. Detail teknisnya ada di komentar `js/karyawan.js`.

**Keterbatasan yang perlu Anda ketahui:**
- **Edit** data karyawan hanya mengubah Nomor ID, Nama, Divisi, dan Role — Email & Password tidak bisa diubah dari halaman ini (perlu Firebase Admin SDK/Cloud Functions untuk itu, di luar cakupan proyek static ini).
- **Hapus** karyawan hanya menghapus profil datanya di Firestore. Akun login-nya (Firebase Authentication) **tidak otomatis ikut terhapus** — jika ingin benar-benar mencabut akses login seseorang, hapus juga manual lewat Firebase Console → Authentication → Users. Ini keterbatasan umum di semua aplikasi Firebase sisi client (bukan bug).
- Data lembur milik karyawan yang dihapus profilnya **tidak ikut terhapus** (tetap tersimpan sebagai riwayat).

**Penting — akun Admin pertama tetap harus dibuat manual:** halaman Kelola Karyawan hanya bisa diakses setelah Anda login sebagai Admin. Jadi akun Admin **paling pertama** tetap harus dibuat lewat Firebase Console secara manual (lihat langkah-langkah di percakapan sebelumnya: Authentication → Add user, lalu buat dokumen di Firestore koleksi `users` dengan Document ID = UID user tsb., isi field `nomorId`, `nama`, `divisi`, `email`, `role: "admin"`, `createdAt`). Setelah punya 1 akun Admin, seluruh akun berikutnya (Admin maupun Karyawan) sudah bisa didaftarkan langsung lewat halaman Kelola Karyawan.

## Cara Deploy ke GitHub Pages

Aplikasi ini adalah situs statis murni (HTML/CSS/JS tanpa proses build), jadi bisa langsung di-hosting gratis di GitHub Pages. Ikuti langkah ini persis, tanpa perlu paham Git sama sekali (pakai cara upload lewat website).

### Langkah 1 — Buat Akun & Repository GitHub

1. Buka **https://github.com**, buat akun jika belum punya (klik **Sign up**)
2. Setelah login, klik ikon **+** di kanan atas → **New repository**
3. Isi **Repository name**, misalnya: `myovertimes`
4. Pilih **Public** (GitHub Pages gratis mengharuskan repo bersifat publik, kecuali Anda punya GitHub Pro)
5. **Jangan centang** "Add a README file" (biar tidak bentrok saat upload nanti)
6. Klik **Create repository**

### Langkah 2 — Upload Seluruh File Proyek

1. Di halaman repository yang baru dibuat, klik link **"uploading an existing file"** (atau menu **Add file → Upload files**)
2. **Drag & drop seluruh isi folder** `lembur-app` (semua file dan folder: `index.html`, `login.html`, `css/`, `js/`, dst.) ke area upload
   - Pastikan struktur foldernya tetap terjaga (folder `js/` dan `css/` harus tetap jadi folder, bukan file lepas)
   - Jika drag-drop folder tidak berhasil di browser Anda, upload isi folder `js/` dan `css/` satu per satu ke masing-masing folder secara terpisah
3. Scroll ke bawah, isi kotak commit message misalnya: `Upload aplikasi MyOvertimes`
4. Klik **Commit changes**

### Langkah 3 — Aktifkan GitHub Pages

1. Di repository, klik tab **Settings** (paling kanan atas)
2. Di sidebar kiri, klik **Pages**
3. Pada bagian **Build and deployment → Source**, pilih **Deploy from a branch**
4. Pada **Branch**, pilih `main` dan folder `/ (root)`, lalu klik **Save**
5. Tunggu 1–2 menit, refresh halaman ini — akan muncul kotak hijau berisi URL situs Anda, formatnya:
   `https://NAMA-AKUN-ANDA.github.io/myovertimes/`

### Langkah 4 — WAJIB: Daftarkan Domain ke Firebase

Firebase akan **menolak proses login** dari domain yang belum dikenal. Ini langkah yang sering terlewat:

1. Buka **Firebase Console** → project Anda → **Build → Authentication**
2. Klik tab **Settings** → **Authorized domains**
3. Klik **Add domain**
4. Masukkan domain GitHub Pages Anda **tanpa `https://` dan tanpa path**, contoh: `NAMA-AKUN-ANDA.github.io`
5. Klik **Add**

### Langkah 5 — Uji Coba

1. Buka URL GitHub Pages Anda di browser
2. Harusnya otomatis diarahkan ke halaman Login
3. Login dengan akun Admin yang sudah dibuat sebelumnya
4. Coba buka dari perangkat/browser lain dengan akun yang sama — datanya harus tetap sinkron (karena semuanya tersimpan di Firestore, bukan di GitHub Pages)

**Setiap kali Anda mengubah kode nanti:** ulangi Langkah 2 (upload ulang file yang berubah), GitHub Pages akan otomatis memperbarui situsnya dalam 1–2 menit.

## Cara Deploy ke Firebase Hosting

Ini cara hosting resmi dari Firebase sendiri — sedikit lebih teknis dari GitHub Pages karena butuh Terminal/Command Prompt, tapi keuntungannya: domain hasil deploy **otomatis sudah diizinkan untuk Login** (tidak perlu langkah "Authorized domains" seperti di GitHub Pages).

### Langkah 1 — Install Node.js (jika belum ada)

1. Buka **https://nodejs.org**
2. Download versi **LTS** (Recommended), sesuai sistem operasi Anda (Windows/Mac)
3. Install seperti install aplikasi biasa (Next → Next → Finish)
4. Untuk memastikan berhasil, buka **Terminal** (Mac) atau **Command Prompt/PowerShell** (Windows), ketik:
   ```
   node -v
   ```
   Jika muncul nomor versi (misal `v20.11.0`), berarti berhasil.

### Langkah 2 — Install Firebase CLI

Di Terminal/Command Prompt yang sama, ketik:
```
npm install -g firebase-tools
```
Tunggu sampai selesai (bisa beberapa menit).

### Langkah 3 — Login ke Firebase lewat Terminal

```
firebase login
```
Browser akan otomatis terbuka, minta Anda login dengan akun Google yang sama dengan yang dipakai membuat project Firebase. Klik **Allow/Izinkan**.

### Langkah 4 — Masuk ke Folder Proyek

Pindah ke folder tempat semua file `lembur-app` Anda berada, contoh:
```
cd Downloads/lembur-app
```
(sesuaikan path-nya dengan lokasi folder Anda menyimpan file-file ini)

### Langkah 5 — Inisialisasi Firebase Hosting

```
firebase init hosting
```
Anda akan ditanya beberapa hal — jawab persis seperti ini:

| Pertanyaan | Jawaban |
|---|---|
| "Please select an option" | Pilih **Use an existing project** |
| Pilih project | Pilih project Firebase yang sudah Anda buat sebelumnya |
| "What do you want to use as your public directory?" | Ketik **`.`** (titik saja, artinya folder saat ini) lalu Enter |
| "Configure as a single-page app (rewrite all urls to /index.html)?" | Ketik **N** (No) — karena aplikasi ini punya beberapa halaman terpisah, bukan satu halaman |
| "Set up automatic builds and deploys with GitHub?" | Ketik **N** (No) |
| "File index.html already exists. Overwrite?" | Ketik **N** (No) — **PENTING, jangan sampai salah jawab ini**, supaya `index.html` Anda tidak tertimpa |

Proses ini akan membuat 2 file baru: `firebase.json` dan `.firebaserc`.

### Langkah 6 — Deploy

```
firebase deploy --only hosting
```

Setelah selesai, akan muncul **Hosting URL**, formatnya:
```
https://NAMA-PROJECT-ANDA.web.app
```

### Langkah 7 — Uji Coba

1. Buka URL tersebut di browser
2. Login menggunakan akun Admin yang sudah dibuat
3. Domain `.web.app` ini **otomatis sudah diizinkan** oleh Firebase Authentication, jadi login harusnya langsung berhasil tanpa langkah tambahan

**Setiap kali ada perubahan kode nanti**, cukup ulangi Langkah 6 saja (`firebase deploy --only hosting`) dari folder proyek yang sama.

## Cara Menerapkan Firestore Security Rules

File `firestore.rules` di root proyek berisi aturan keamanan sesungguhnya (bukan cuma di tampilan aplikasi). Cara menerapkannya, khusus untuk pemula:

1. Buka **https://console.firebase.google.com**, pilih project Anda
2. Di sidebar kiri, klik **Build → Firestore Database**
3. Klik tab **Rules** (di sebelah tab "Data")
4. **Hapus semua isi kotak** yang ada di sana
5. Buka file `firestore.rules` yang sudah saya buatkan, **salin seluruh isinya**
6. **Tempel** ke kotak Rules di Firebase Console
7. Klik tombol **Publish**

Setelah dipublish, aturan berlaku **langsung saat itu juga** tanpa perlu deploy ulang aplikasi. Anda bisa mengulangi langkah ini kapan pun aturan perlu diubah.

## Aturan Bisnis Tambahan

Selain roadmap awal, aplikasi ini juga menerapkan:

- **Periode Buku**: periode laporan berjalan tanggal **21 s.d. 20 bulan berikutnya** (bukan bulan kalender biasa). Contoh: tanggal 25 Juli 2026 masuk **Periode Agustus 2026**. Diimplementasikan lewat `getPeriodeBuku()` dan `getRentangPeriodeBuku()` di `js/utils.js`, dipakai pada grafik Dashboard dan (nanti) filter Laporan.
- **Role Admin vs Karyawan** (field `role` pada koleksi `users`):
  - **Karyawan**: hanya bisa input, lihat, edit, hapus, dan ekspor data lemburnya sendiri.
  - **Admin**: bisa melihat seluruh data semua karyawan (dengan filter per karyawan di Dashboard), serta mengedit/menghapus data siapa pun, dan mengelola daftar Libur Nasional.
  - Diterapkan pada query Firestore di setiap halaman, dan akan diperkuat lagi lewat Firestore Security Rules (Tahap 12) agar aturan ini benar-benar aman di sisi server, bukan cuma di tampilan.

## Struktur Folder

```
/
├── index.html          # Entry point, redirect ke login/dashboard sesuai status auth
├── login.html           # Halaman Login (Firebase Authentication)
├── dashboard.html        # Dashboard: card ringkasan, grafik, tabel data terakhir
├── lembur.html           # Halaman Input & CRUD data lembur
├── laporan.html          # Halaman Laporan: filter, tabel lengkap, export Excel
├── setting.html          # Halaman Setting: kelola daftar Libur Nasional
├── karyawan.html          # Halaman Kelola Karyawan (khusus Admin): daftar & kelola akun karyawan
├── css/
│   └── style.css         # Custom style tambahan di luar Tailwind
├── js/
│   ├── firebase.js       # Inisialisasi Firebase App, Auth, Firestore (Modular SDK)
│   ├── auth.js            # Logic login, logout, remember me, proteksi halaman
│   ├── dashboard.js       # Logic dashboard: query Firestore, hitung statistik, render Chart.js
│   ├── lembur.js          # Logic form input lembur, hitungPoint(), CRUD Firestore
│   ├── laporan.js         # Logic laporan: filter, render tabel, export Excel (SheetJS)
│   ├── setting.js         # Logic CRUD daftar Libur Nasional (khusus Admin)
│   ├── karyawan.js        # Logic pendaftaran & kelola akun karyawan (khusus Admin)
│   └── utils.js           # Helper umum: format tanggal, cek status hari, hitungPoint(), dsb.
└── assets/                # Tidak digunakan — branding aplikasi berupa teks "MyOvertimes" saja
```

**Branding:** Aplikasi tidak menggunakan logo/gambar. Nama aplikasi **"MyOvertimes"** ditampilkan sebagai teks pada sidebar, halaman Login, dan judul halaman (didefinisikan sekali di `js/firebase.js` sebagai konstanta `APP_NAME` agar konsisten di seluruh aplikasi).

## Roadmap Pengerjaan

1. ✅ Struktur folder proyek — **(tahap ini, selesai)**
2. ✅ Konfigurasi Firebase — **(selesai)**
3. ✅ Halaman Login — **(selesai)**
4. ✅ Dashboard — **(selesai)**
5. ✅ Form Input Lembur — **(selesai)**
6. ✅ Implementasi fungsi hitungPoint() — **(selesai)**
7. ✅ CRUD Firestore — **(selesai)**
8. ✅ Tabel Data — **(selesai)**
9. ✅ Filter dan Pencarian — **(selesai)**
10. ✅ Export Excel — **(selesai)**
11. ✅ Dashboard Statistik dan Grafik — **(selesai)**
12. ✅ Firestore Security Rules — **(selesai)**
13. ✅ Deploy ke GitHub Pages — **(selesai)**
14. ✅ Deploy ke Firebase Hosting — **(selesai)**

🎉 **Seluruh 14 tahap roadmap selesai.** Aplikasi MyOvertimes sudah lengkap: dari struktur proyek, autentikasi, dashboard, input & CRUD lembur, perhitungan point otomatis, filter & laporan, export Excel, sistem role Admin/Karyawan, Periode Buku, keamanan Firestore, hingga siap di-deploy ke GitHub Pages maupun Firebase Hosting.
