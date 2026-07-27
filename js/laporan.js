/**
 * File: js/laporan.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Tahap ini (Filter dan Pencarian) berisi:
 * - Ambil seluruh data lembur secara realtime (cakupan sesuai role,
 *   sama seperti Dashboard & Input Lembur)
 * - Filter berdasarkan: Periode Buku, Status Hari, Kata Kunci (Keterangan),
 *   Rentang Tanggal, dan (khusus Admin) Karyawan
 * - Tabel hasil filter + footer Total Jam Lembur & Total Point mengikuti
 *   data yang sedang ditampilkan (bukan seluruh data)
 *
 * Catatan: Periode Buku dipakai menggantikan filter "Bulan" & "Tahun"
 * kalender biasa, karena aplikasi ini memakai sistem buka-tutup buku
 * tanggal 21 s.d. 20 bulan berikutnya (lihat js/utils.js -> getPeriodeBuku()).
 *
 * Menyusul di tahap berikutnya: Export Excel (SheetJS).
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
  formatAngka,
  getPeriodeBuku,
  showToast,
} from "./utils.js";

let currentUserProfile = null;
let seluruhData = []; // seluruh data (belum difilter), hasil listener realtime
let dataTerfilter = []; // hasil setelah filter diterapkan (dipakai juga oleh Export Excel)
let daftarKaryawan = []; // khusus admin, untuk filter & tampilan nama
let unsubscribeLaporan = null;

/**
 * Titik masuk halaman Laporan. Dipanggil dari laporan.html.
 */
export function initLaporanPage() {
  protectPage(async (userProfile) => {
    currentUserProfile = userProfile;

    const namaEl = document.getElementById("user-nama");
    if (namaEl) namaEl.textContent = userProfile.nama;

    const roleBadge = document.getElementById("role-badge");
    if (roleBadge && userProfile.role === "admin") {
      roleBadge.textContent = "Admin";
      roleBadge.classList.remove("hidden");
    }

    initLogout();
    initSidebarDrawer();

    if (userProfile.role === "admin") {
      await muatDaftarKaryawan();
      tampilkanFilterKaryawan();
    }

    initFilterEvents();
    initExportEvent();
    listenSeluruhData();
  });
}

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
 * KHUSUS ADMIN: DAFTAR & FILTER KARYAWAN
 * ============================================================ */

async function muatDaftarKaryawan() {
  try {
    const snapshot = await getDocs(collection(db, "users"));
    daftarKaryawan = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      nama: docSnap.data().nama || docSnap.data().email || docSnap.id,
    }));
  } catch (error) {
    console.error("Gagal memuat daftar karyawan:", error);
    daftarKaryawan = [];
  }
}

function cariNamaKaryawan(uid) {
  const found = daftarKaryawan.find((k) => k.uid === uid);
  return found ? found.nama : uid;
}

function tampilkanFilterKaryawan() {
  const container = document.getElementById("filter-karyawan-container");
  const select = document.getElementById("filter-karyawan");
  if (!container || !select) return;

  container.classList.remove("hidden");
  select.innerHTML =
    `<option value="semua">Semua Karyawan</option>` +
    daftarKaryawan.map((k) => `<option value="${k.uid}">${escapeHtml(k.nama)}</option>`).join("");
}

/* ============================================================
 * AMBIL DATA (REALTIME) SESUAI CAKUPAN ROLE
 * ============================================================ */

function listenSeluruhData() {
  const lemburRef = collection(db, "lembur");
  const q =
    currentUserProfile.role === "admin"
      ? query(lemburRef)
      : query(lemburRef, where("createdBy", "==", currentUserProfile.uid));

  if (unsubscribeLaporan) unsubscribeLaporan();

  unsubscribeLaporan = onSnapshot(
    q,
    (snapshot) => {
      seluruhData = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      perbaruiDaftarPeriode();
      terapkanFilter();
    },
    (error) => {
      console.error("Gagal memuat data laporan:", error);
      showToast("Gagal memuat data laporan. Periksa koneksi Anda.", "error");
    }
  );
}

/**
 * Mengisi dropdown filter Periode Buku berdasarkan periode yang benar-benar
 * ada pada data (bukan daftar tetap), diurutkan dari yang terbaru.
 */
function perbaruiDaftarPeriode() {
  const select = document.getElementById("filter-periode");
  if (!select) return;

  const nilaiSebelumnya = select.value || "semua";

  const map = new Map(); // key -> label
  seluruhData.forEach((d) => {
    if (!d.tanggal) return;
    const periode = getPeriodeBuku(d.tanggal);
    map.set(periode.key, periode.label);
  });

  const keysUrut = Array.from(map.keys()).sort().reverse();

  select.innerHTML =
    `<option value="semua">Semua Periode</option>` +
    keysUrut.map((key) => `<option value="${key}">${map.get(key)}</option>`).join("");

  // Pertahankan pilihan sebelumnya jika masih tersedia di daftar baru
  if (keysUrut.includes(nilaiSebelumnya) || nilaiSebelumnya === "semua") {
    select.value = nilaiSebelumnya;
  }
}

/* ============================================================
 * FILTER
 * ============================================================ */

function initFilterEvents() {
  const ids = [
    "filter-periode",
    "filter-status",
    "filter-keyword",
    "filter-dari",
    "filter-sampai",
    "filter-karyawan",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const eventName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventName, () => terapkanFilter());
  });

  document.getElementById("btn-reset-filter")?.addEventListener("click", () => {
    document.getElementById("filter-periode").value = "semua";
    document.getElementById("filter-status").value = "semua";
    document.getElementById("filter-keyword").value = "";
    document.getElementById("filter-dari").value = "";
    document.getElementById("filter-sampai").value = "";
    const filterKaryawan = document.getElementById("filter-karyawan");
    if (filterKaryawan) filterKaryawan.value = "semua";
    terapkanFilter();
  });
}

/**
 * Menerapkan seluruh filter aktif ke `seluruhData`, menyimpan hasilnya
 * ke `dataTerfilter` (dipakai juga oleh Export Excel di tahap berikutnya),
 * lalu merender ke tabel.
 */
function terapkanFilter() {
  const periode = document.getElementById("filter-periode")?.value || "semua";
  const status = document.getElementById("filter-status")?.value || "semua";
  const keyword = (document.getElementById("filter-keyword")?.value || "").trim().toLowerCase();
  const dari = document.getElementById("filter-dari")?.value || "";
  const sampai = document.getElementById("filter-sampai")?.value || "";
  const karyawanUid = document.getElementById("filter-karyawan")?.value || "semua";

  dataTerfilter = seluruhData.filter((d) => {
    if (!d.tanggal) return false;

    if (periode !== "semua" && getPeriodeBuku(d.tanggal).key !== periode) return false;
    if (status !== "semua" && d.statusHari !== status) return false;
    if (keyword && !(d.keterangan || "").toLowerCase().includes(keyword)) return false;
    if (dari && d.tanggal < dari) return false;
    if (sampai && d.tanggal > sampai) return false;
    if (currentUserProfile.role === "admin" && karyawanUid !== "semua" && d.createdBy !== karyawanUid)
      return false;

    return true;
  });

  renderTabelLaporan();
}

/* ============================================================
 * RENDER TABEL HASIL FILTER
 * ============================================================ */

function renderTabelLaporan() {
  const tbody = document.getElementById("tabel-laporan-body");
  const emptyState = document.getElementById("tabel-laporan-empty");
  const kolomKaryawanHeader = document.getElementById("th-laporan-karyawan");
  const footerLabel = document.getElementById("footer-laporan-label");
  const footerJam = document.getElementById("footer-laporan-jam");
  const footerPoint = document.getElementById("footer-laporan-point");
  const jumlahBadge = document.getElementById("jumlah-hasil");
  if (!tbody) return;

  const isAdmin = currentUserProfile.role === "admin";
  kolomKaryawanHeader?.classList.toggle("hidden", !isAdmin);
  if (footerLabel) footerLabel.colSpan = isAdmin ? 5 : 4;

  const sorted = [...dataTerfilter].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  if (jumlahBadge) jumlahBadge.textContent = `${sorted.length} data`;

  if (sorted.length === 0) {
    tbody.innerHTML = "";
    emptyState?.classList.remove("hidden");
    footerJam.textContent = formatAngka(0);
    footerPoint.textContent = formatAngka(0);
    return;
  }
  emptyState?.classList.add("hidden");

  let totalJam = 0;
  let totalPoint = 0;

  tbody.innerHTML = sorted
    .map((d, i) => {
      totalJam += Number(d.jamLembur) || 0;
      totalPoint += Number(d.totalPoint) || 0;

      const kolomKaryawan = isAdmin
        ? `<td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${escapeHtml(cariNamaKaryawan(d.createdBy))}</td>`
        : "";

      return `
      <tr class="border-b border-gray-100 dark:border-gray-700 last:border-0">
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${i + 1}</td>
        ${kolomKaryawan}
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">${formatTanggalIndo(d.tanggal)}</td>
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${d.hari || "-"}</td>
        <td class="px-4 py-3 text-sm">${badgeStatus(d.statusHari)}</td>
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${formatAngka(d.jamLembur)}</td>
        <td class="px-4 py-3 text-sm font-medium text-primary-600 dark:text-primary-400">${formatAngka(d.totalPoint)}</td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[220px] truncate" title="${escapeHtml(d.keterangan || "-")}">${escapeHtml(d.keterangan || "-")}</td>
      </tr>
    `;
    })
    .join("");

  footerJam.textContent = formatAngka(totalJam);
  footerPoint.textContent = formatAngka(totalPoint);
}

function badgeStatus(status) {
  const styleMap = {
    "Hari Kerja": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Minggu": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    "Libur Nasional": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  const style = styleMap[status] || "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style}">${status || "-"}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
 * EXPORT EXCEL (SheetJS)
 * ============================================================ */

/**
 * Memasang event klik pada tombol "Export Excel".
 */
function initExportEvent() {
  document.getElementById("btn-export-excel")?.addEventListener("click", () => {
    exportKeExcel();
  });
}

/**
 * Mengekspor data hasil filter yang SEDANG TAMPIL di tabel (bukan seluruh
 * data) ke file Excel (.xlsx), dengan format kolom sama seperti tabel,
 * memakai library SheetJS yang dimuat lewat CDN di laporan.html.
 */
function exportKeExcel() {
  if (dataTerfilter.length === 0) {
    showToast("Tidak ada data untuk diekspor. Coba ubah filter terlebih dahulu.", "error");
    return;
  }

  const isAdmin = currentUserProfile.role === "admin";
  const sorted = [...dataTerfilter].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

  // Baris header, mengikuti kolom yang tampil di tabel
  const header = [
    "No",
    ...(isAdmin ? ["Karyawan"] : []),
    "Tanggal",
    "Hari",
    "Status Hari",
    "Jam Lembur",
    "Total Point",
    "Keterangan",
  ];

  let totalJam = 0;
  let totalPoint = 0;

  const rows = sorted.map((d, i) => {
    totalJam += Number(d.jamLembur) || 0;
    totalPoint += Number(d.totalPoint) || 0;

    const baris = [i + 1];
    if (isAdmin) baris.push(cariNamaKaryawan(d.createdBy));
    baris.push(
      formatTanggalIndo(d.tanggal),
      d.hari || "-",
      d.statusHari || "-",
      Number(d.jamLembur) || 0,
      Number(d.totalPoint) || 0,
      d.keterangan || ""
    );
    return baris;
  });

  // Baris footer total, kolom "Total" diletakkan tepat sebelum kolom Jam Lembur
  const kolomKosongSebelumTotal = isAdmin ? ["", "", "", ""] : ["", "", ""];
  const baristotal = [...kolomKosongSebelumTotal, "Total", totalJam, totalPoint, ""];

  const sheetData = [header, ...rows, baristotal];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Lebar kolom otomatis menyesuaikan judul kolom agar mudah dibaca
  worksheet["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 4) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Lembur");

  const namaFile = `Laporan_Lembur_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, namaFile);

  showToast(`Berhasil mengekspor ${sorted.length} data ke Excel.`, "success");
}
