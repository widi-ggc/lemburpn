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
