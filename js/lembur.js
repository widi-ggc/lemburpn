/**
 * File: js/lembur.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Tahap ini (CRUD Firestore) menambahkan:
 * - Simpan data baru ke Firestore (Create)
 * - Edit data yang sudah ada (Update) — dipicu dari Tabel Data (Tahap 8)
 *   lewat fungsi export `isiFormUntukEdit()`
 * - Hapus data (Delete) dengan konfirmasi — dipicu dari Tabel Data (Tahap 8)
 *   lewat fungsi export `hapusLemburData()`
 * - Validasi: tidak boleh ada 2 data lembur dengan tanggal sama untuk
 *   user (createdBy) yang sama
 *
 * Tahap sebelumnya (Form Input Lembur & hitungPoint()) tetap dipakai:
 * - Ambil daftar Libur Nasional dari Firestore untuk menentukan Status Hari
 * - Auto-isi field "Hari" dan "Status Hari"
 * - Preview Total Point secara live
 *
 * Menyusul di tahap berikutnya:
 * - Tabel daftar seluruh data lembur (Tahap 8)
 * - Menu Setting Libur Nasional yang bisa dikelola Admin (dibangun bersamaan
 *   dengan Tahap 8, karena strukturnya serupa: tabel + CRUD)
 */

import { db } from "./firebase.js";
import { protectPage, initLogout } from "./auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getNamaHari,
  tentukanStatusHari,
  hitungPoint,
  formatAngka,
  formatTanggalIndo,
  showToast,
  setButtonLoading,
  tampilkanMenuKaryawanJikaAdmin,
} from "./utils.js";

// Cache daftar tanggal libur nasional (Set berisi string "YYYY-MM-DD")
let daftarLiburNasional = new Set();

// Data tabel yang sedang ditampilkan (hasil listener realtime terakhir)
let currentTableData = [];

// Daftar karyawan (uid -> nama), hanya dimuat untuk role admin, dipakai
// menampilkan kolom "Karyawan" pada tabel.
let daftarKaryawan = [];

// Unsubscribe function dari listener realtime tabel, agar bisa dihentikan
// ketika tidak dibutuhkan lagi (mencegah listener ganda).
let unsubscribeTabel = null;

// Profil user yang sedang login (diisi saat protectPage berhasil)
let currentUserProfile = null;

// ID dokumen yang sedang diedit (null jika sedang mode "tambah baru")
let editingId = null;
// UID pemilik asli data yang sedang diedit (dipakai untuk validasi tanggal duplikat & permission)
let editingOwnerUid = null;

/**
 * Titik masuk halaman Input Lembur. Dipanggil dari lembur.html.
 */
export function initLemburPage() {
  protectPage(async (userProfile) => {
    currentUserProfile = userProfile;

    const namaEl = document.getElementById("user-nama");
    if (namaEl) namaEl.textContent = userProfile.nama;

    const roleBadge = document.getElementById("role-badge");
    if (roleBadge && userProfile.role === "admin") {
      roleBadge.textContent = "Admin";
      roleBadge.classList.remove("hidden");
    }

    tampilkanMenuKaryawanJikaAdmin(userProfile.role);

    initLogout();
    initSidebarDrawer();

    if (userProfile.role === "admin") {
      await muatDaftarKaryawan();
    }

    await muatDaftarLiburNasional();
    initForm();
    initTabelEvents();
    listenLemburTable();
  });
}

/**
 * Memuat daftar karyawan (uid & nama) dari koleksi `users`, khusus untuk
 * role admin, agar tabel bisa menampilkan kolom "Karyawan".
 */
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

/**
 * Mengambil seluruh daftar tanggal Libur Nasional dari koleksi Firestore
 * `liburNasional` (dikelola oleh Admin melalui menu Setting). Dipanggil
 * sekali saat halaman dimuat.
 */
async function muatDaftarLiburNasional() {
  try {
    const snapshot = await getDocs(collection(db, "liburNasional"));
    daftarLiburNasional = new Set(
      snapshot.docs.map((docSnap) => docSnap.data().tanggal).filter(Boolean)
    );
  } catch (error) {
    console.error("Gagal memuat daftar libur nasional:", error);
    daftarLiburNasional = new Set();
  }
}

/* ============================================================
 * CRUD: CEK DUPLIKAT, SIMPAN (CREATE/UPDATE), HAPUS
 * ============================================================ */

/**
 * Mengecek apakah user tertentu sudah pernah menginput data lembur pada
 * tanggal yang sama. Dipakai untuk mencegah duplikat sesuai aturan:
 * "Tidak boleh ada data lembur dengan tanggal yang sama untuk user yang sama."
 *
 * @param {string} ownerUid - uid pemilik data (createdBy)
 * @param {string} tanggal - format "YYYY-MM-DD"
 * @param {string|null} excludeId - id dokumen yang dikecualikan (dipakai saat mode edit)
 * @returns {Promise<boolean>} true jika sudah ada data lain di tanggal tsb.
 */
async function cekTanggalSudahAda(ownerUid, tanggal, excludeId = null) {
  const lemburRef = collection(db, "lembur");
  const q = query(
    lemburRef,
    where("createdBy", "==", ownerUid),
    where("tanggal", "==", tanggal)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.some((docSnap) => docSnap.id !== excludeId);
}

/**
 * Menyimpan data lembur ke Firestore — otomatis menentukan Create atau
 * Update tergantung apakah sedang dalam mode edit (`editingId`).
 *
 * @param {Object} dataForm - { tanggal, hari, statusHari, jamLembur, totalPoint, keterangan }
 * @returns {Promise<void>}
 */
async function simpanLembur(dataForm) {
  const modeEdit = Boolean(editingId);
  // Saat tambah baru, pemilik data = user yang sedang login.
  // Saat edit, pemilik data = pemilik asli dokumen (bisa berbeda dari Admin yang mengedit).
  const ownerUid = modeEdit ? editingOwnerUid : currentUserProfile.uid;

  const sudahAda = await cekTanggalSudahAda(ownerUid, dataForm.tanggal, editingId);
  if (sudahAda) {
    const error = new Error("Tanggal tersebut sudah pernah diinput.");
    error.code = "DUPLICATE_TANGGAL";
    throw error;
  }

  if (modeEdit) {
    await updateDoc(doc(db, "lembur", editingId), { ...dataForm });
  } else {
    await addDoc(collection(db, "lembur"), {
      ...dataForm,
      createdBy: currentUserProfile.uid,
      createdAt: serverTimestamp(),
    });
  }
}

/**
 * Menghapus satu data lembur berdasarkan ID, dengan konfirmasi terlebih
 * dahulu. Dipanggil dari Tabel Data (Tahap 8) melalui tombol "Hapus".
 *
 * Catatan keamanan: pembatasan sesungguhnya (Karyawan hanya boleh
 * menghapus data miliknya sendiri, Admin boleh menghapus data siapa pun)
 * ditegakkan lewat Firestore Security Rules (Tahap 12) — bukan hanya
 * lewat kode di sisi client ini.
 *
 * @param {string} id - ID dokumen Firestore
 * @returns {Promise<boolean>} true jika berhasil dihapus
 */
export async function hapusLemburData(id) {
  const konfirmasi = window.confirm(
    "Yakin ingin menghapus data lembur ini? Tindakan ini tidak dapat dibatalkan."
  );
  if (!konfirmasi) return false;

  try {
    await deleteDoc(doc(db, "lembur", id));
    showToast("Data lembur berhasil dihapus.", "success");
    return true;
  } catch (error) {
    console.error("Gagal menghapus data lembur:", error);
    showToast("Gagal menghapus data. Anda mungkin tidak memiliki akses.", "error");
    return false;
  }
}

/**
 * Mengisi form Input Lembur dengan data yang sudah ada untuk keperluan
 * Edit, lalu mengaktifkan mode edit. Dipanggil dari Tabel Data (Tahap 8)
 * saat tombol "Edit" pada suatu baris ditekan.
 *
 * @param {Object} data - dokumen lembur { tanggal, hari, statusHari, jamLembur, totalPoint, keterangan, createdBy }
 * @param {string} id - ID dokumen Firestore
 */
export function isiFormUntukEdit(data, id) {
  const tanggalInput = document.getElementById("input-tanggal");
  const hariInput = document.getElementById("input-hari");
  const statusHidden = document.getElementById("input-status-hidden");
  const statusBadge = document.getElementById("input-status-badge");
  const jamSelect = document.getElementById("input-jam");
  const keteranganInput = document.getElementById("input-keterangan");
  const submitBtn = document.getElementById("lembur-submit");
  const cancelBtn = document.getElementById("btn-batal-edit");
  const formTitle = document.getElementById("form-title");

  if (!tanggalInput) return;

  editingId = id;
  editingOwnerUid = data.createdBy;

  tanggalInput.value = data.tanggal;
  hariInput.value = data.hari;
  statusHidden.value = data.statusHari;
  jamSelect.value = String(data.jamLembur);
  keteranganInput.value = data.keterangan || "";

  const styleMap = {
    "Hari Kerja": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "Minggu": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    "Libur Nasional": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  statusBadge.textContent = data.statusHari;
  statusBadge.className =
    "inline-block px-3 py-1.5 rounded-lg text-sm font-medium w-full text-center " +
    (styleMap[data.statusHari] || "");

  jamSelect.dispatchEvent(new Event("input"));

  if (submitBtn) submitBtn.textContent = "Update";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  if (formTitle) formTitle.textContent = "Edit Data Lembur";

  document.getElementById("lembur-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Membatalkan mode edit dan mengembalikan form ke kondisi "tambah baru".
 */
function batalkanEdit(form, statusBadgeSetter, pointUpdater) {
  editingId = null;
  editingOwnerUid = null;

  form.reset();
  document.getElementById("input-hari").value = "";
  document.getElementById("input-status-hidden").value = "";
  statusBadgeSetter("-");
  pointUpdater();

  const submitBtn = document.getElementById("lembur-submit");
  const cancelBtn = document.getElementById("btn-batal-edit");
  const formTitle = document.getElementById("form-title");
  if (submitBtn) submitBtn.textContent = "Simpan";
  if (cancelBtn) cancelBtn.classList.add("hidden");
  if (formTitle) formTitle.textContent = "Tambah Data Lembur";
}

/* ============================================================
 * TABEL DATA: LISTENER REALTIME, RENDER, EDIT & HAPUS
 * ============================================================ */

/**
 * Mendengarkan (realtime) data lembur sesuai cakupan role, lalu merender
 * ke tabel di bawah form:
 * - karyawan -> hanya data miliknya sendiri
 * - admin    -> seluruh data semua karyawan
 */
function listenLemburTable() {
  const lemburRef = collection(db, "lembur");
  const q =
    currentUserProfile.role === "admin"
      ? query(lemburRef)
      : query(lemburRef, where("createdBy", "==", currentUserProfile.uid));

  if (unsubscribeTabel) unsubscribeTabel();

  unsubscribeTabel = onSnapshot(
    q,
    (snapshot) => {
      currentTableData = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      renderTabelLembur();
    },
    (error) => {
      console.error("Gagal memuat tabel data lembur:", error);
      showToast("Gagal memuat data. Periksa koneksi Anda.", "error");
    }
  );
}

/**
 * Merender seluruh baris tabel data lembur, diurutkan berdasarkan
 * tanggal terbaru, beserta footer Total Jam Lembur & Total Point.
 */
function renderTabelLembur() {
  const tbody = document.getElementById("tabel-lembur-body");
  const emptyState = document.getElementById("tabel-lembur-empty");
  const kolomKaryawanHeader = document.getElementById("th-tabel-karyawan");
  const footerJam = document.getElementById("footer-total-jam");
  const footerPoint = document.getElementById("footer-total-point");
  if (!tbody) return;

  const isAdmin = currentUserProfile.role === "admin";
  kolomKaryawanHeader?.classList.toggle("hidden", !isAdmin);

  const footerLabel = document.getElementById("footer-total-label");
  if (footerLabel) footerLabel.colSpan = isAdmin ? 5 : 4;

  const sorted = [...currentTableData].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

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
      <tr class="border-b border-gray-100 dark:border-gray-700 last:border-0" data-id="${d.id}">
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${i + 1}</td>
        ${kolomKaryawan}
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">${formatTanggalIndo(d.tanggal)}</td>
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${d.hari || "-"}</td>
        <td class="px-4 py-3 text-sm">${badgeStatus(d.statusHari)}</td>
        <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${formatAngka(d.jamLembur)}</td>
        <td class="px-4 py-3 text-sm font-medium text-primary-600 dark:text-primary-400">${formatAngka(d.totalPoint)}</td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title="${escapeHtml(d.keterangan || "-")}">${escapeHtml(d.keterangan || "-")}</td>
        <td class="px-4 py-3 text-sm">
          <div class="flex items-center gap-2">
            <button type="button" data-action="edit" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold">Edit</button>
            <button type="button" data-action="hapus" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold">Hapus</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");

  footerJam.textContent = formatAngka(totalJam);
  footerPoint.textContent = formatAngka(totalPoint);
}

/**
 * Memasang event delegation pada tabel untuk menangani klik tombol
 * Edit dan Hapus di setiap baris.
 */
function initTabelEvents() {
  const tbody = document.getElementById("tabel-lembur-body");
  if (!tbody) return;

  tbody.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const row = btn.closest("tr[data-id]");
    const id = row?.dataset.id;
    const data = currentTableData.find((d) => d.id === id);
    if (!data) return;

    if (btn.dataset.action === "edit") {
      isiFormUntukEdit(data, id);
    } else if (btn.dataset.action === "hapus") {
      hapusLemburData(id);
    }
  });
}

/**
 * Menghasilkan badge warna sesuai jenis status hari (dipakai tabel).
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
 * Mencegah XSS sederhana saat menampilkan teks bebas dari user.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
 * FORM: AUTO HARI/STATUS, PREVIEW POINT, SUBMIT
 * ============================================================ */

/**
 * Menyiapkan seluruh interaksi form Input Lembur.
 */
function initForm() {
  const form = document.getElementById("lembur-form");
  if (!form) return;

  const tanggalInput = document.getElementById("input-tanggal");
  const hariInput = document.getElementById("input-hari");
  const statusBadge = document.getElementById("input-status-badge");
  const statusHidden = document.getElementById("input-status-hidden");
  const jamSelect = document.getElementById("input-jam");
  const keteranganInput = document.getElementById("input-keterangan");
  const pointPreview = document.getElementById("input-point-preview");
  const resetBtn = document.getElementById("btn-reset");
  const cancelBtn = document.getElementById("btn-batal-edit");
  const submitBtn = document.getElementById("lembur-submit");

  // Batasi tanggal maksimal = hari ini (tidak boleh input lembur di masa depan)
  const hariIni = new Date();
  const tanggalMaksimal = hariIni.toISOString().split("T")[0];
  tanggalInput.setAttribute("max", tanggalMaksimal);

  tanggalInput.addEventListener("change", () => {
    perbaruiHariDanStatus();
    perbaruiPoint();
  });

  jamSelect.addEventListener("input", () => {
    perbaruiPoint();
  });

  function perbaruiHariDanStatus() {
    const tanggal = tanggalInput.value;
    if (!tanggal) {
      hariInput.value = "";
      setStatusBadge("-");
      statusHidden.value = "";
      return;
    }

    const hari = getNamaHari(tanggal);
    const status = tentukanStatusHari(tanggal, daftarLiburNasional);

    hariInput.value = hari;
    statusHidden.value = status;
    setStatusBadge(status);
  }

  function perbaruiPoint() {
    const status = statusHidden.value;
    const jam = jamSelect.value;
    const jamAngka = Number(jam);

    if (!status || jam === "" || Number.isNaN(jamAngka) || jamAngka < 0) {
      pointPreview.textContent = "-";
      pointPreview.className =
        "w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 px-3 py-2.5 text-sm";
      return;
    }

    const point = hitungPoint(jamAngka, status);
    pointPreview.textContent = `${formatAngka(point)} Point`;
    pointPreview.className =
      "w-full rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-semibold px-3 py-2.5 text-sm";
  }

  function setStatusBadge(status) {
    const styleMap = {
      "Hari Kerja": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      "Minggu": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      "Libur Nasional": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      "-": "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
    };
    statusBadge.textContent = status;
    statusBadge.className =
      "inline-block px-3 py-1.5 rounded-lg text-sm font-medium w-full text-center " +
      (styleMap[status] || styleMap["-"]);
  }

  // Tombol Reset: kosongkan seluruh form (tanpa keluar dari mode edit jika sedang edit)
  resetBtn.addEventListener("click", () => {
    form.reset();
    hariInput.value = "";
    statusHidden.value = "";
    setStatusBadge("-");
    perbaruiPoint();
  });

  // Tombol Batal Edit: keluar dari mode edit, kembali ke mode tambah baru
  cancelBtn?.addEventListener("click", () => {
    batalkanEdit(form, setStatusBadge, perbaruiPoint);
  });

  // Submit form -> Simpan (Create) atau Update ke Firestore
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!tanggalInput.value) {
      showToast("Tanggal wajib diisi.", "error");
      return;
    }
    const jamAngka = Number(jamSelect.value);
    if (jamSelect.value === "" || Number.isNaN(jamAngka)) {
      showToast("Jam Lembur wajib diisi dengan angka.", "error");
      return;
    }
    if (jamAngka < 0) {
      showToast("Jam Lembur tidak boleh kurang dari 0.", "error");
      return;
    }
    if (jamAngka > 24) {
      showToast("Jam Lembur tidak masuk akal (lebih dari 24 jam sehari).", "error");
      return;
    }

    const dataForm = {
      tanggal: tanggalInput.value,
      hari: hariInput.value,
      statusHari: statusHidden.value,
      jamLembur: jamAngka,
      totalPoint: hitungPoint(jamAngka, statusHidden.value),
      keterangan: keteranganInput.value.trim(),
    };

    setButtonLoading(submitBtn, true, editingId ? "Memperbarui..." : "Menyimpan...");

    try {
      const modeEdit = Boolean(editingId);
      await simpanLembur(dataForm);

      showToast(
        modeEdit ? "Data lembur berhasil diperbarui." : "Data lembur berhasil disimpan.",
        "success"
      );

      batalkanEdit(form, setStatusBadge, perbaruiPoint);
    } catch (error) {
      console.error("Gagal menyimpan data lembur:", error);
      if (error.code === "DUPLICATE_TANGGAL") {
        showToast("Tanggal tersebut sudah pernah diinput.", "error");
      } else {
        showToast("Gagal menyimpan data. Silakan coba lagi.", "error");
      }
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // Set nilai awal saat halaman pertama kali dibuka
  setStatusBadge("-");
  perbaruiPoint();
}
