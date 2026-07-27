/**
 * File: js/utils.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Berisi fungsi-fungsi utilitas umum yang dipakai bersama oleh
 * seluruh halaman: notifikasi (toast), dark mode, dan helper UI lain.
 *
 * Fungsi terkait tanggal/status hari/perhitungan point akan ditambahkan
 * pada tahap berikutnya (Form Input Lembur & Implementasi hitungPoint()).
 */

/* ============================================================
 * TOAST NOTIFICATION
 * ============================================================ */

/**
 * Menampilkan notifikasi toast sementara di pojok kanan atas layar.
 *
 * @param {string} message - Pesan yang ingin ditampilkan.
 * @param {"success"|"error"|"info"} [type="info"] - Jenis notifikasi (menentukan warna).
 * @param {number} [duration=3500] - Lama tampil dalam milidetik.
 */
export function showToast(message, type = "info", duration = 3500) {
  // Buat container toast jika belum ada
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className =
      "fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm";
    document.body.appendChild(container);
  }

  const colorMap = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };

  const toast = document.createElement("div");
  toast.className = `toast-item ${colorMap[type] || colorMap.info} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg flex items-start gap-2`;
  toast.innerHTML = `
    <span class="flex-1">${message}</span>
    <button type="button" class="shrink-0 opacity-80 hover:opacity-100" aria-label="Tutup notifikasi">&times;</button>
  `;

  // Tombol tutup manual
  toast.querySelector("button").addEventListener("click", () => {
    removeToast(toast);
  });

  container.appendChild(toast);

  // Otomatis hilang setelah durasi tertentu
  const timer = setTimeout(() => removeToast(toast), duration);

  // Simpan timer di elemen agar bisa dibatalkan jika ditutup manual
  toast.dataset.timer = timer;
}

/**
 * Menghapus satu toast dengan animasi fade-out.
 * @param {HTMLElement} toast
 */
function removeToast(toast) {
  if (toast.dataset.timer) clearTimeout(Number(toast.dataset.timer));
  toast.classList.add("toast-hide");
  setTimeout(() => toast.remove(), 200);
}

/* ============================================================
 * DARK MODE
 * ============================================================ */

const THEME_STORAGE_KEY = "myovertimes-theme";

/**
 * Menerapkan tema (dark/light) ke elemen <html> dan menyimpan preferensi.
 * @param {"dark"|"light"} theme
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Mengambil preferensi tema tersimpan, atau mengikuti preferensi sistem
 * jika pengguna belum pernah memilih secara manual.
 * @returns {"dark"|"light"}
 */
export function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Inisialisasi dark mode: menerapkan tema tersimpan dan (opsional)
 * menghubungkan tombol toggle jika elemen dengan id yang diberikan ada.
 * @param {string} [toggleButtonId="theme-toggle"]
 */
export function initTheme(toggleButtonId = "theme-toggle") {
  applyTheme(getPreferredTheme());

  const toggleBtn = document.getElementById(toggleButtonId);
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.contains("dark");
    applyTheme(isDark ? "light" : "dark");
  });
}

/* ============================================================
 * LOADING STATE PADA TOMBOL
 * ============================================================ */

/**
 * Mengatur tampilan loading pada sebuah tombol (disable + teks berubah)
 * agar pengguna tahu proses sedang berjalan dan mencegah submit ganda.
 *
 * @param {HTMLButtonElement} button
 * @param {boolean} isLoading
 * @param {string} [loadingText="Memproses..."]
 */
export function setButtonLoading(button, isLoading, loadingText = "Memproses...") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.dataset.originalText || button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
      <span class="inline-flex items-center gap-2">
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        ${loadingText}
      </span>
    `;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  }
}

/* ============================================================
 * FORMAT TANGGAL & ANGKA (LOKAL INDONESIA)
 * ============================================================ */

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const NAMA_HARI = [
  "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu",
];

/**
 * Mengubah string tanggal format "YYYY-MM-DD" menjadi format panjang
 * berbahasa Indonesia, contoh: "2026-07-25" -> "25 Juli 2026".
 * @param {string} dateStr - format "YYYY-MM-DD"
 * @returns {string}
 */
export function formatTanggalIndo(dateStr) {
  if (!dateStr) return "-";
  const [tahun, bulan, tanggal] = dateStr.split("-").map(Number);
  if (!tahun || !bulan || !tanggal) return dateStr;
  return `${tanggal} ${NAMA_BULAN[bulan - 1]} ${tahun}`;
}

/**
 * Mengambil nama hari (dalam Bahasa Indonesia) dari sebuah tanggal.
 * @param {string} dateStr - format "YYYY-MM-DD"
 * @returns {string} contoh: "Sabtu"
 */
export function getNamaHari(dateStr) {
  if (!dateStr) return "-";
  const [tahun, bulan, tanggal] = dateStr.split("-").map(Number);
  const date = new Date(tahun, bulan - 1, tanggal);
  return NAMA_HARI[date.getDay()];
}

/**
 * Mengambil label singkat "Bulan Tahun" dari tanggal, contoh: "Jul 2026".
 * Dipakai untuk mengelompokkan data per bulan pada grafik Dashboard.
 * @param {string} dateStr - format "YYYY-MM-DD"
 * @returns {string}
 */
export function getLabelBulan(dateStr) {
  const [tahun, bulan] = dateStr.split("-").map(Number);
  return `${NAMA_BULAN[bulan - 1].slice(0, 3)} ${tahun}`;
}

/**
 * Mengembalikan kunci unik "YYYY-MM" dari sebuah tanggal, untuk
 * dipakai sebagai key pengelompokan data per bulan.
 * @param {string} dateStr - format "YYYY-MM-DD"
 * @returns {string}
 */
export function getKunciBulan(dateStr) {
  const [tahun, bulan] = dateStr.split("-");
  return `${tahun}-${bulan}`;
}

/**
 * Memformat angka menggunakan pemisah desimal koma ala Indonesia.
 * Contoh: formatAngka(1.5) -> "1,5"
 * @param {number} num
 * @param {number} [maxDecimals=1]
 * @returns {string}
 */
export function formatAngka(num, maxDecimals = 1) {
  const value = Number(num) || 0;
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/**
 * Menentukan status hari (Hari Kerja / Minggu / Libur Nasional) secara
 * otomatis berdasarkan tanggal. Aturan:
 * - Jika hari dalam seminggu adalah Minggu -> "Minggu"
 * - Jika tanggal termasuk daftar Libur Nasional -> "Libur Nasional"
 * - Selain itu -> "Hari Kerja"
 *
 * @param {string} tanggal - format "YYYY-MM-DD"
 * @param {Set<string>|string[]} daftarLiburNasional - kumpulan tanggal libur nasional format "YYYY-MM-DD"
 * @returns {"Hari Kerja"|"Minggu"|"Libur Nasional"}
 */
export function tentukanStatusHari(tanggal, daftarLiburNasional = []) {
  if (!tanggal) return "Hari Kerja";

  const namaHari = getNamaHari(tanggal);
  if (namaHari === "Minggu") return "Minggu";

  const daftarSet =
    daftarLiburNasional instanceof Set
      ? daftarLiburNasional
      : new Set(daftarLiburNasional);

  if (daftarSet.has(tanggal)) return "Libur Nasional";

  return "Hari Kerja";
}

/**
 * Menentukan Periode Buku dari sebuah tanggal, dengan aturan:
 * periode dimulai tanggal 21 dan berakhir tanggal 20 bulan berikutnya.
 * Contoh: tanggal 25 Juli 2026 -> Periode Agustus 2026 (karena >= 21 Juli).
 *         tanggal 15 Juli 2026 -> Periode Juli 2026 (karena < 21 Juli).
 *
 * @param {string} tanggalStr - format "YYYY-MM-DD"
 * @returns {{key: string, label: string}} key format "YYYY-MM", label contoh "Agustus 2026"
 */
export function getPeriodeBuku(tanggalStr) {
  const [tahun, bulan, tanggal] = tanggalStr.split("-").map(Number);

  let periodeBulan = bulan;
  let periodeTahun = tahun;

  if (tanggal >= 21) {
    periodeBulan += 1;
    if (periodeBulan > 12) {
      periodeBulan = 1;
      periodeTahun += 1;
    }
  }

  const key = `${periodeTahun}-${String(periodeBulan).padStart(2, "0")}`;
  const label = `${NAMA_BULAN[periodeBulan - 1]} ${periodeTahun}`;
  return { key, label };
}

/**
 * Mengembalikan rentang tanggal awal & akhir dari sebuah kunci Periode Buku.
 * Contoh: getRentangPeriodeBuku("2026-08") -> { mulai: "2026-07-21", selesai: "2026-08-20" }
 *
 * @param {string} periodeKey - format "YYYY-MM" (bulan periode, bukan bulan kalender awal)
 * @returns {{mulai: string, selesai: string}}
 */
export function getRentangPeriodeBuku(periodeKey) {
  const [tahun, bulan] = periodeKey.split("-").map(Number);

  let bulanMulai = bulan - 1;
  let tahunMulai = tahun;
  if (bulanMulai < 1) {
    bulanMulai = 12;
    tahunMulai -= 1;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const mulai = `${tahunMulai}-${pad(bulanMulai)}-21`;
  const selesai = `${tahun}-${pad(bulan)}-20`;
  return { mulai, selesai };
}

/* ============================================================
 * PERHITUNGAN TOTAL POINT LEMBUR
 * ============================================================ */

/**
 * Menghitung Total Point lembur berdasarkan Jam Lembur dan Status Hari.
 *
 * Aturan:
 * 1. Hari Minggu & Libur Nasional -> Point = Jam Lembur x 2
 * 2. Hari Kerja (Senin–Sabtu):
 *    - Jika Jam Lembur <= 1 jam -> Point = Jam Lembur x 1.5
 *    - Jika Jam Lembur >  1 jam -> Point = 1.5 + ((Jam Lembur - 1) x 2)
 *
 * Fungsi ini dipakai di SELURUH aplikasi (Form Input Lembur, Edit Data,
 * dan mana pun Total Point perlu dihitung ulang) agar hasilnya konsisten.
 *
 * @param {number} jamLembur - jumlah jam lembur (0, 0.5, 1, 1.5, ... 6)
 * @param {string} statusHari - "Hari Kerja" | "Minggu" | "Libur Nasional"
 * @returns {number} Total Point
 */
export function hitungPoint(jamLembur, statusHari) {
  // Hari Minggu dan Libur Nasional
  if (statusHari === "Minggu" || statusHari === "Libur Nasional") {
    return jamLembur * 2;
  }

  // Hari Kerja
  if (jamLembur <= 1) {
    return jamLembur * 1.5;
  }

  return 1.5 + (jamLembur - 1) * 2;
}

/* ============================================================
 * PESAN ERROR FIREBASE AUTH (BAHASA INDONESIA)
 * ============================================================ */

/**
 * Menerjemahkan kode error Firebase Authentication menjadi pesan
 * berbahasa Indonesia yang mudah dipahami pengguna awam.
 *
 * @param {string} errorCode - contoh: "auth/wrong-password"
 * @returns {string}
 */
export function terjemahkanErrorAuth(errorCode) {
  const pesan = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/user-disabled": "Akun ini telah dinonaktifkan. Hubungi admin.",
    "auth/user-not-found": "Email atau password salah.",
    "auth/wrong-password": "Email atau password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/too-many-requests":
      "Terlalu banyak percobaan login gagal. Silakan coba lagi beberapa saat lagi.",
    "auth/network-request-failed":
      "Gagal terhubung ke server. Periksa koneksi internet Anda.",
    "auth/missing-password": "Password wajib diisi.",
  };
  return pesan[errorCode] || "Terjadi kesalahan saat login. Silakan coba lagi.";
}
