/**
 * File: js/dashboard.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Berisi logika halaman Dashboard:
 * - Ambil data lembur secara realtime dari Firestore, dengan cakupan
 *   berbeda tergantung role:
 *     - role "karyawan" -> hanya data miliknya sendiri
 *     - role "admin"    -> seluruh data semua karyawan, dengan opsi
 *                          filter per karyawan
 * - Hitung ringkasan statistik (card)
 * - Render grafik Total Point & Total Jam Lembur per PERIODE BUKU
 *   (periode berjalan tanggal 21 s.d. 20 bulan berikutnya)
 * - Render tabel 10 data lembur terakhir (menampilkan kolom "Karyawan"
 *   khusus saat login sebagai Admin)
 *
 * Catatan: statusHari dan totalPoint pada setiap dokumen lembur sudah
 * dihitung & disimpan sejak proses input (lihat tahap "Form Input Lembur"
 * dan "Implementasi hitungPoint()"). Dashboard hanya membaca & meringkas.
 */

import { db } from "./firebase.js";
import { protectPage, initLogout } from "./auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  formatTanggalIndo,
  getPeriodeBuku,
  formatAngka,
  showToast,
} from "./utils.js";

let chartPoint = null;
let chartJam = null;
let chartDistribusiStatus = null;
let chartRankingKaryawan = null;
let unsubscribeLembur = null;

let currentRole = "karyawan";
let currentUid = null;
let daftarKaryawan = []; // { uid, nama } — hanya dimuat untuk Admin
let filterKaryawanUid = "semua"; // "semua" atau uid tertentu (khusus Admin)

/**
 * Titik masuk halaman Dashboard. Dipanggil dari dashboard.html.
 */
export function initDashboardPage() {
  protectPage(async (userProfile) => {
    const namaEl = document.getElementById("user-nama");
    if (namaEl) namaEl.textContent = userProfile.nama;

    currentRole = userProfile.role;
    currentUid = userProfile.uid;

    initLogout();
    initSidebarDrawer();

    if (currentRole === "admin") {
      await tampilkanFilterAdmin();
    }

    listenLemburData();
  });
}

/**
 * Membuka/menutup drawer sidebar pada tampilan mobile.
 */
function initSidebarDrawer() {
  const openBtn = document.getElementById("open-sidebar");
  const closeBtn = document.getElementById("close-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const sidebar = document.getElementById("sidebar");

  const openDrawer = () => {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
  };
  const closeDrawer = () => {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
  };

  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);
}

/* ============================================================
 * KHUSUS ADMIN: BADGE ROLE + FILTER KARYAWAN
 * ============================================================ */

/**
 * Menampilkan badge "Admin" pada topbar dan menyiapkan dropdown
 * filter karyawan (hanya untuk role admin).
 */
async function tampilkanFilterAdmin() {
  const roleBadge = document.getElementById("role-badge");
  if (roleBadge) {
    roleBadge.textContent = "Admin";
    roleBadge.classList.remove("hidden");
  }

  const filterContainer = document.getElementById("admin-filter-container");
  const filterSelect = document.getElementById("filter-karyawan");
  if (!filterContainer || !filterSelect) return;

  filterContainer.classList.remove("hidden");

  const rankingContainer = document.getElementById("ranking-karyawan-container");
  rankingContainer?.classList.remove("hidden");

  try {
    const snapshot = await getDocs(collection(db, "users"));
    daftarKaryawan = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      nama: docSnap.data().nama || docSnap.data().email || docSnap.id,
    }));

    filterSelect.innerHTML =
      `<option value="semua">Semua Karyawan</option>` +
      daftarKaryawan
        .map((k) => `<option value="${k.uid}">${escapeHtml(k.nama)}</option>`)
        .join("");
  } catch (error) {
    console.error("Gagal memuat daftar karyawan:", error);
  }

  filterSelect.addEventListener("change", () => {
    filterKaryawanUid = filterSelect.value;
    listenLemburData();
  });
}

/**
 * Mencari nama karyawan dari cache `daftarKaryawan` berdasarkan uid.
 * Dipakai untuk menampilkan kolom "Karyawan" pada tabel (tampilan Admin).
 * @param {string} uid
 * @returns {string}
 */
function cariNamaKaryawan(uid) {
  const found = daftarKaryawan.find((k) => k.uid === uid);
  return found ? found.nama : uid;
}

/* ============================================================
 * QUERY DATA (REALTIME) — CAKUPAN SESUAI ROLE
 * ============================================================ */

/**
 * Mendengarkan (realtime) data lembur sesuai cakupan role:
 * - karyawan -> where createdBy == uid miliknya sendiri
 * - admin    -> seluruh data, atau difilter ke satu karyawan tertentu
 *               jika dipilih pada dropdown filter
 */
function listenLemburData() {
  const lemburRef = collection(db, "lembur");
  let q;

  if (currentRole === "admin") {
    q =
      filterKaryawanUid === "semua"
        ? query(lemburRef)
        : query(lemburRef, where("createdBy", "==", filterKaryawanUid));
  } else {
    q = query(lemburRef, where("createdBy", "==", currentUid));
  }

  // Hentikan listener sebelumnya jika ada (mencegah listener ganda / bocor)
  if (unsubscribeLembur) unsubscribeLembur();

  unsubscribeLembur = onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      renderDashboard(data);
    },
    (error) => {
      console.error("Gagal memuat data dashboard:", error);
      showToast("Gagal memuat data dashboard. Periksa koneksi Anda.", "error");
    }
  );
}

/**
 * Merender seluruh bagian dashboard (card, grafik, tabel) berdasarkan
 * data lembur yang diterima dari Firestore.
 * @param {Array<Object>} data
 */
function renderDashboard(data) {
  renderCards(data);
  renderCharts(data);
  renderChartDistribusiStatus(data);
  if (currentRole === "admin") renderChartRankingKaryawan(data);
  renderTabelTerakhir(data);
}

/* ============================================================
 * CARD RINGKASAN
 * ============================================================ */

function renderCards(data) {
  const totalHariLembur = data.length;
  const totalJamLembur = data.reduce((sum, d) => sum + (Number(d.jamLembur) || 0), 0);
  const totalPoint = data.reduce((sum, d) => sum + (Number(d.totalPoint) || 0), 0);
  const totalHariKerja = data.filter((d) => d.statusHari === "Hari Kerja").length;
  const totalHariMinggu = data.filter((d) => d.statusHari === "Minggu").length;
  const totalHariLibur = data.filter((d) => d.statusHari === "Libur Nasional").length;

  setCardValue("card-total-hari-lembur", totalHariLembur);
  setCardValue("card-total-jam-lembur", formatAngka(totalJamLembur));
  setCardValue("card-total-point", formatAngka(totalPoint));
  setCardValue("card-total-hari-kerja", totalHariKerja);
  setCardValue("card-total-hari-minggu", totalHariMinggu);
  setCardValue("card-total-hari-libur", totalHariLibur);
}

function setCardValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ============================================================
 * GRAFIK (CHART.JS) — DIKELOMPOKKAN PER PERIODE BUKU (21 s.d. 20)
 * ============================================================ */

function renderCharts(data) {
  const grouped = new Map(); // key: "YYYY-MM" (periode) -> { label, point, jam }

  data.forEach((d) => {
    if (!d.tanggal) return;
    const periode = getPeriodeBuku(d.tanggal);
    if (!grouped.has(periode.key)) {
      grouped.set(periode.key, { label: periode.label, point: 0, jam: 0 });
    }
    const entry = grouped.get(periode.key);
    entry.point += Number(d.totalPoint) || 0;
    entry.jam += Number(d.jamLembur) || 0;
  });

  // Urutkan berdasarkan kunci periode (kronologis) lalu ambil 6 periode terakhir
  const sortedKeys = Array.from(grouped.keys()).sort();
  const last6Keys = sortedKeys.slice(-6);

  const labels = last6Keys.map((k) => grouped.get(k).label);
  const pointData = last6Keys.map((k) => Number(grouped.get(k).point.toFixed(1)));
  const jamData = last6Keys.map((k) => Number(grouped.get(k).jam.toFixed(1)));

  renderChartPoint(labels, pointData);
  renderChartJam(labels, jamData);
}

function renderChartPoint(labels, values) {
  const ctx = document.getElementById("chart-point");
  if (!ctx) return;

  if (chartPoint) chartPoint.destroy();

  chartPoint = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["-"],
      datasets: [
        {
          label: "Total Point",
          data: values.length ? values : [0],
          backgroundColor: "#2563eb",
          borderRadius: 6,
          maxBarThickness: 40,
        },
      ],
    },
    options: chartBaseOptions(),
  });
}

function renderChartJam(labels, values) {
  const ctx = document.getElementById("chart-jam");
  if (!ctx) return;

  if (chartJam) chartJam.destroy();

  chartJam = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["-"],
      datasets: [
        {
          label: "Total Jam Lembur",
          data: values.length ? values : [0],
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: "#16a34a",
        },
      ],
    },
    options: chartBaseOptions(),
  });
}

/**
 * Opsi dasar Chart.js yang dipakai kedua grafik, termasuk penyesuaian
 * warna agar tetap terbaca pada dark mode.
 */
function chartBaseOptions() {
  const isDark = document.documentElement.classList.contains("dark");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const textColor = isDark ? "#cbd5e1" : "#475569";

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: "transparent" },
        ticks: { color: textColor },
      },
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
    },
  };
}

/* ============================================================
 * GRAFIK: DISTRIBUSI STATUS HARI (DOUGHNUT)
 * ============================================================ */

function renderChartDistribusiStatus(data) {
  const ctx = document.getElementById("chart-distribusi-status");
  if (!ctx) return;

  const jumlahKerja = data.filter((d) => d.statusHari === "Hari Kerja").length;
  const jumlahMinggu = data.filter((d) => d.statusHari === "Minggu").length;
  const jumlahLibur = data.filter((d) => d.statusHari === "Libur Nasional").length;

  if (chartDistribusiStatus) chartDistribusiStatus.destroy();

  const isDark = document.documentElement.classList.contains("dark");

  chartDistribusiStatus = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Hari Kerja", "Minggu", "Libur Nasional"],
      datasets: [
        {
          data: [jumlahKerja, jumlahMinggu, jumlahLibur],
          backgroundColor: ["#2563eb", "#f59e0b", "#dc2626"],
          borderColor: isDark ? "#1f2937" : "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: isDark ? "#cbd5e1" : "#475569", boxWidth: 12, padding: 12 },
        },
      },
    },
  });
}

/* ============================================================
 * GRAFIK: RANKING TOTAL POINT PER KARYAWAN (KHUSUS ADMIN)
 * ============================================================ */

function renderChartRankingKaryawan(data) {
  const ctx = document.getElementById("chart-ranking-karyawan");
  if (!ctx) return;

  // Jumlahkan total point per karyawan (createdBy)
  const totalPerKaryawan = new Map(); // uid -> total point

  data.forEach((d) => {
    const uid = d.createdBy;
    if (!uid) return;
    totalPerKaryawan.set(uid, (totalPerKaryawan.get(uid) || 0) + (Number(d.totalPoint) || 0));
  });

  // Urutkan dari total point tertinggi, ambil 8 teratas agar grafik tetap terbaca
  const ranking = Array.from(totalPerKaryawan.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const labels = ranking.map(([uid]) => cariNamaKaryawan(uid));
  const values = ranking.map(([, total]) => Number(total.toFixed(1)));

  if (chartRankingKaryawan) chartRankingKaryawan.destroy();

  chartRankingKaryawan = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["-"],
      datasets: [
        {
          label: "Total Point",
          data: values.length ? values : [0],
          backgroundColor: "#7c3aed",
          borderRadius: 6,
          maxBarThickness: 32,
        },
      ],
    },
    options: chartRankingOptions(),
  });
}

/**
 * Opsi Chart.js khusus untuk grafik ranking (horizontal bar) — sumbu nilai
 * berada di X sehingga beginAtZero perlu diterapkan di X, bukan Y.
 */
function chartRankingOptions() {
  const isDark = document.documentElement.classList.contains("dark");
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const textColor = isDark ? "#cbd5e1" : "#475569";

  return {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
      y: {
        grid: { color: "transparent" },
        ticks: { color: textColor },
      },
    },
  };
}

/* ============================================================
 * TABEL 10 DATA TERAKHIR
 * ============================================================ */

function renderTabelTerakhir(data) {
  const tbody = document.getElementById("tabel-terakhir-body");
  const emptyState = document.getElementById("tabel-terakhir-empty");
  const kolomKaryawanHeader = document.getElementById("th-karyawan");
  if (!tbody) return;

  // Kolom "Karyawan" hanya ditampilkan untuk role Admin
  if (kolomKaryawanHeader) {
    kolomKaryawanHeader.classList.toggle("hidden", currentRole !== "admin");
  }

  // Urutkan berdasarkan tanggal terbaru, ambil 10 teratas
  const sorted = [...data].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  const terakhir = sorted.slice(0, 10);

  if (terakhir.length === 0) {
    tbody.innerHTML = "";
    emptyState?.classList.remove("hidden");
    return;
  }
  emptyState?.classList.add("hidden");

  tbody.innerHTML = terakhir
    .map((d, i) => {
      const kolomKaryawan =
        currentRole === "admin"
          ? `<td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${escapeHtml(cariNamaKaryawan(d.createdBy))}</td>`
          : "";
      return `
    <tr class="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${i + 1}</td>
      ${kolomKaryawan}
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${formatTanggalIndo(d.tanggal)}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${d.hari || "-"}</td>
      <td class="px-4 py-3 text-sm">${badgeStatus(d.statusHari)}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${formatAngka(d.jamLembur)}</td>
      <td class="px-4 py-3 text-sm font-medium text-primary-600 dark:text-primary-400">${formatAngka(d.totalPoint)}</td>
      <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title="${escapeHtml(d.keterangan || "-")}">${escapeHtml(d.keterangan || "-")}</td>
    </tr>
  `;
    })
    .join("");
}

/**
 * Menghasilkan badge warna sesuai jenis status hari.
 * @param {string} status
 * @returns {string} HTML badge
 */
function badgeStatus(status) {
  const styleMap = {
    "Hari Kerja": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Minggu": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    "Libur Nasional": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  const style = styleMap[status] || "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style}">${status || "-"}</span>`;
}

/**
 * Mencegah XSS sederhana saat menampilkan teks bebas dari user (keterangan, nama).
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
