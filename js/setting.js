/**
 * File: js/setting.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Halaman khusus ADMIN untuk mengelola daftar Libur Nasional secara
 * mandiri (tambah/ubah/hapus tanggal) TANPA perlu mengubah kode program,
 * sesuai permintaan awal. Status Hari pada Form Input Lembur & Laporan
 * membaca koleksi Firestore `liburNasional` yang dikelola dari sini.
 *
 * Halaman ini hanya bisa diakses oleh user dengan role "admin".
 * Karyawan yang mencoba membuka halaman ini akan otomatis diarahkan
 * kembali ke Dashboard.
 */

import { db } from "./firebase.js";
import { protectPage, initLogout } from "./auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { formatTanggalIndo, showToast, setButtonLoading } from "./utils.js";

let daftarLibur = [];
let editingId = null;
let unsubscribeLibur = null;

/**
 * Titik masuk halaman Setting Libur Nasional. Dipanggil dari setting.html.
 */
export function initSettingPage() {
  protectPage((userProfile) => {
    // Halaman ini khusus Admin. Karyawan otomatis dialihkan ke Dashboard.
    if (userProfile.role !== "admin") {
      showToast("Halaman ini khusus untuk Admin.", "error");
      window.location.href = "dashboard.html";
      return;
    }

    const namaEl = document.getElementById("user-nama");
    if (namaEl) namaEl.textContent = userProfile.nama;

    const roleBadge = document.getElementById("role-badge");
    if (roleBadge) {
      roleBadge.textContent = "Admin";
      roleBadge.classList.remove("hidden");
    }

    initLogout();
    initSidebarDrawer();
    initForm();
    initTabelEvents();
    listenDaftarLibur();
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
 * LISTENER REALTIME + RENDER TABEL
 * ============================================================ */

function listenDaftarLibur() {
  const liburRef = collection(db, "liburNasional");
  const q = query(liburRef, orderBy("tanggal", "asc"));

  if (unsubscribeLibur) unsubscribeLibur();

  unsubscribeLibur = onSnapshot(
    q,
    (snapshot) => {
      daftarLibur = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderTabelLibur();
    },
    (error) => {
      console.error("Gagal memuat daftar libur nasional:", error);
      showToast("Gagal memuat daftar libur nasional.", "error");
    }
  );
}

function renderTabelLibur() {
  const tbody = document.getElementById("tabel-libur-body");
  const emptyState = document.getElementById("tabel-libur-empty");
  if (!tbody) return;

  if (daftarLibur.length === 0) {
    tbody.innerHTML = "";
    emptyState?.classList.remove("hidden");
    return;
  }
  emptyState?.classList.add("hidden");

  tbody.innerHTML = daftarLibur
    .map(
      (d, i) => `
    <tr class="border-b border-gray-100 dark:border-gray-700 last:border-0" data-id="${d.id}">
      <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${i + 1}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">${formatTanggalIndo(d.tanggal)}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${escapeHtml(d.keterangan || "-")}</td>
      <td class="px-4 py-3 text-sm">
        <div class="flex items-center gap-2">
          <button type="button" data-action="edit" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold">Edit</button>
          <button type="button" data-action="hapus" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold">Hapus</button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

function initTabelEvents() {
  const tbody = document.getElementById("tabel-libur-body");
  if (!tbody) return;

  tbody.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const row = btn.closest("tr[data-id]");
    const id = row?.dataset.id;
    const data = daftarLibur.find((d) => d.id === id);
    if (!data) return;

    if (btn.dataset.action === "edit") {
      isiFormUntukEdit(data, id);
    } else if (btn.dataset.action === "hapus") {
      hapusLibur(id);
    }
  });
}

/* ============================================================
 * FORM TAMBAH / EDIT
 * ============================================================ */

function initForm() {
  const form = document.getElementById("libur-form");
  if (!form) return;

  const tanggalInput = document.getElementById("libur-tanggal");
  const keteranganInput = document.getElementById("libur-keterangan");
  const submitBtn = document.getElementById("libur-submit");
  const cancelBtn = document.getElementById("btn-batal-edit-libur");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const tanggal = tanggalInput.value;
    const keterangan = keteranganInput.value.trim();

    if (!tanggal) {
      showToast("Tanggal wajib diisi.", "error");
      return;
    }
    if (!keterangan) {
      showToast("Keterangan wajib diisi (contoh: Hari Raya Idul Fitri).", "error");
      return;
    }

    // Cegah tanggal duplikat di daftar libur nasional
    const sudahAda = daftarLibur.some((d) => d.tanggal === tanggal && d.id !== editingId);
    if (sudahAda) {
      showToast("Tanggal tersebut sudah ada di daftar Libur Nasional.", "error");
      return;
    }

    setButtonLoading(submitBtn, true, editingId ? "Memperbarui..." : "Menyimpan...");

    try {
      if (editingId) {
        await updateDoc(doc(db, "liburNasional", editingId), { tanggal, keterangan });
        showToast("Data libur nasional berhasil diperbarui.", "success");
      } else {
        await addDoc(collection(db, "liburNasional"), { tanggal, keterangan });
        showToast("Tanggal libur nasional berhasil ditambahkan.", "success");
      }
      batalkanEdit(form);
    } catch (error) {
      console.error("Gagal menyimpan data libur nasional:", error);
      showToast("Gagal menyimpan data. Anda mungkin tidak memiliki akses.", "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  cancelBtn?.addEventListener("click", () => batalkanEdit(form));
}

function isiFormUntukEdit(data, id) {
  editingId = id;

  document.getElementById("libur-tanggal").value = data.tanggal;
  document.getElementById("libur-keterangan").value = data.keterangan || "";
  document.getElementById("libur-submit").textContent = "Update";
  document.getElementById("btn-batal-edit-libur")?.classList.remove("hidden");
  document.getElementById("libur-form-title").textContent = "Edit Tanggal Libur Nasional";

  document.getElementById("libur-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function batalkanEdit(form) {
  editingId = null;
  form.reset();
  document.getElementById("libur-submit").textContent = "Tambah";
  document.getElementById("btn-batal-edit-libur")?.classList.add("hidden");
  document.getElementById("libur-form-title").textContent = "Tambah Tanggal Libur Nasional";
}

/**
 * Menghapus satu tanggal libur nasional, dengan konfirmasi.
 * @param {string} id
 */
async function hapusLibur(id) {
  const konfirmasi = window.confirm("Yakin ingin menghapus tanggal libur nasional ini?");
  if (!konfirmasi) return;

  try {
    await deleteDoc(doc(db, "liburNasional", id));
    showToast("Tanggal libur nasional berhasil dihapus.", "success");
  } catch (error) {
    console.error("Gagal menghapus data libur nasional:", error);
    showToast("Gagal menghapus data. Anda mungkin tidak memiliki akses.", "error");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
