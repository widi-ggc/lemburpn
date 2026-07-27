/**
 * File: js/firebase.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Berisi inisialisasi Firebase App menggunakan Firebase Modular SDK (v10+)
 * yang dimuat langsung dari CDN sebagai ES6 Module (tanpa bundler/npm).
 *
 * Modul ini mengekspor instance `app`, `auth`, dan `db` agar dapat
 * digunakan kembali (reusable) oleh seluruh file JavaScript lain
 * (auth.js, dashboard.js, lembur.js, laporan.js, utils.js).
 *
 * PENTING:
 * Ganti seluruh nilai pada objek `firebaseConfig` di bawah ini dengan
 * konfigurasi proyek Firebase Anda sendiri. Nilai ini didapat dari:
 * Firebase Console > Project Settings > General > Your apps > SDK setup and configuration.
 */

// Import fungsi-fungsi Firebase Modular SDK dari CDN resmi Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/**
 * Konfigurasi proyek Firebase.
 * TODO: Ganti dengan konfigurasi proyek Firebase Anda sendiri.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCA1hBWQATcockty9UeNllfW1JUrT1ItQQ",
  authDomain: "myovertimespn.firebaseapp.com",
  projectId: "myovertimespn",
  storageBucket: "myovertimespn.firebasestorage.app",
  messagingSenderId: "1070970188154",
  appId: "1:1070970188154:web:fcf1c873945643c5cb26c3"
};

// Inisialisasi Firebase App
const app = initializeApp(firebaseConfig);

// Inisialisasi Firebase Authentication
const auth = getAuth(app);

// Inisialisasi Firestore Database
const db = getFirestore(app);

/**
 * Mengaktifkan cache offline Firestore (IndexedDB persistence).
 * Memungkinkan aplikasi tetap menampilkan data terakhir saat koneksi
 * internet terputus, dan otomatis sinkron kembali saat online.
 * Kegagalan diabaikan secara aman (misal: multi-tab tanpa dukungan,
 * atau browser yang tidak mendukung IndexedDB) agar tidak menghentikan
 * eksekusi aplikasi.
 */
enableIndexedDbPersistence(db).catch((error) => {
  if (error.code === "failed-precondition") {
    // Persistence hanya bisa aktif di satu tab pada satu waktu.
    console.warn(
      "Firestore persistence dinonaktifkan: aplikasi terbuka di beberapa tab sekaligus."
    );
  } else if (error.code === "unimplemented") {
    // Browser yang digunakan tidak mendukung fitur ini.
    console.warn("Firestore persistence tidak didukung oleh browser ini.");
  }
});

/**
 * Mengatur tipe persistence sesi Firebase Authentication
 * berdasarkan pilihan "Remember Me" pada halaman Login.
 *
 * @param {boolean} rememberMe - true untuk sesi tetap login (localStorage),
 *                               false untuk sesi hanya selama tab terbuka (sessionStorage).
 * @returns {Promise<void>}
 */
export function setAuthPersistence(rememberMe) {
  const persistenceType = rememberMe
    ? browserLocalPersistence
    : browserSessionPersistence;
  return setPersistence(auth, persistenceType);
}

// Nama brand aplikasi, dipakai bersama oleh seluruh halaman (tanpa logo/gambar).
export const APP_NAME = "MyOvertimes";

// Ekspor firebaseConfig juga, dipakai khusus oleh js/karyawan.js untuk membuat
// instance Firebase App KEDUA sementara saat Admin mendaftarkan akun karyawan
// baru (agar sesi login Admin tidak tergantikan oleh akun baru tersebut).
export { app, auth, db, firebaseConfig };
