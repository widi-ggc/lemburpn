/**
 * File: js/karyawan.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Halaman khusus ADMIN untuk mendaftarkan akun karyawan baru (agar bisa
 * login) dan mengelola data karyawan: Nomor ID (wajib unik), Nama, Divisi.
 *
 * TEKNIK "SECONDARY FIREBASE APP":
 * Membuat akun login baru lewat Firebase Authentication di sisi client
 * (createUserWithEmailAndPassword) SECARA OTOMATIS akan membuat browser
 * "berpindah login" ke akun baru tersebut, menggantikan sesi Admin yang
 * sedang aktif. Untuk mencegah ini, proses pembuatan akun dilakukan lewat
 * instance Firebase App KEDUA yang sesi-nya terpisah dari app utama,
 * lalu langsung dibuang (deleteApp) setelah selesai. Sesi Admin di app
 * utama sama sekali tidak tersentuh.
 *
 * Halaman ini hanya bisa diakses oleh user dengan role "admin".
 */

import { db, firebaseConfig } from "./firebase.js";
import { protectPage, initLogout } from "./auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as signOutSecondary,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  where,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  showToast,
  setButtonLoading,
  terjemahkanErrorAuth,
  tampilkanMenuKaryawanJikaAdmin,
} from "./utils.js";

let daftarKaryawan = [];
let editingUid = null; // uid yang sedang diedit (null = mode tambah baru)
let unsubscribeKaryawan = null;

/**
 * Titik masuk halaman Kelola Karyawan. Dipanggil dari karyawan.html.
 */
export function initKaryawanPage() {
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

    tampilkanMenuKaryawanJikaAdmin(userProfile.role);

    initLogout();
    initSidebarDrawer();
    initForm();
    initTabelEvents();
    listenDaftarKaryawan();
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

function listenDaftarKaryawan() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, orderBy("nama", "asc"));

  if (unsubscribeKaryawan) unsubscribeKaryawan();

  unsubscribeKaryawan = onSnapshot(
    q,
    (snapshot) => {
      daftarKaryawan = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
      renderTabelKaryawan();
    },
    (error) => {
      console.error("Gagal memuat daftar karyawan:", error);
      showToast("Gagal memuat daftar karyawan.", "error");
    }
  );
}

function renderTabelKaryawan() {
  const tbody = document.getElementById("tabel-karyawan-body");
  const emptyState = document.getElementById("tabel-karyawan-empty");
  if (!tbody) return;

  if (daftarKaryawan.length === 0) {
    tbody.innerHTML = "";
    emptyState?.classList.remove("hidden");
    return;
  }
  emptyState?.classList.add("hidden");

  tbody.innerHTML = daftarKaryawan
    .map(
      (k, i) => `
    <tr class="border-b border-gray-100 dark:border-gray-700 last:border-0" data-uid="${k.uid}">
      <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${i + 1}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 font-medium">${escapeHtml(k.nomorId || "-")}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${escapeHtml(k.nama || "-")}</td>
      <td class="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">${escapeHtml(k.divisi || "-")}</td>
      <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${escapeHtml(k.email || "-")}</td>
      <td class="px-4 py-3 text-sm">${badgeRole(k.role)}</td>
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

function badgeRole(role) {
  const isAdmin = role === "admin";
  const style = isAdmin
    ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
    : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style}">${isAdmin ? "Admin" : "Karyawan"}</span>`;
}

function initTabelEvents() {
  const tbody = document.getElementById("tabel-karyawan-body");
  if (!tbody) return;

  tbody.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const row = btn.closest("tr[data-uid]");
    const uid = row?.dataset.uid;
    const data = daftarKaryawan.find((k) => k.uid === uid);
    if (!data) return;

    if (btn.dataset.action === "edit") {
      isiFormUntukEdit(data);
    } else if (btn.dataset.action === "hapus") {
      hapusKaryawan(data);
    }
  });
}

/* ============================================================
 * VALIDASI NOMOR ID UNIK
 * ============================================================ */

/**
 * Mengecek apakah Nomor ID Karyawan sudah dipakai oleh karyawan lain.
 * @param {string} nomorId
 * @param {string|null} excludeUid - uid yang dikecualikan (dipakai saat mode edit)
 * @returns {Promise<boolean>}
 */
async function cekNomorIdSudahAda(nomorId, excludeUid = null) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("nomorId", "==", nomorId));
  const snapshot = await getDocs(q);
  return snapshot.docs.some((docSnap) => docSnap.id !== excludeUid);
}

/* ============================================================
 * FORM: TAMBAH (DAFTAR AKUN BARU) / EDIT
 * ============================================================ */

function initForm() {
  const form = document.getElementById("karyawan-form");
  if (!form) return;

  const nomorIdInput = document.getElementById("karyawan-nomor-id");
  const namaInput = document.getElementById("karyawan-nama");
  const divisiInput = document.getElementById("karyawan-divisi");
  const emailInput = document.getElementById("karyawan-email");
  const passwordInput = document.getElementById("karyawan-password");
  const roleSelect = document.getElementById("karyawan-role");
  const submitBtn = document.getElementById("karyawan-submit");
  const cancelBtn = document.getElementById("btn-batal-edit-karyawan");
  const emailPasswordWrapper = document.getElementById("email-password-wrapper");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nomorId = nomorIdInput.value.trim();
    const nama = namaInput.value.trim();
    const divisi = divisiInput.value.trim();
    const role = roleSelect.value;

    if (!nomorId || !nama || !divisi) {
      showToast("Nomor ID, Nama, dan Divisi wajib diisi.", "error");
      return;
    }

    setButtonLoading(submitBtn, true, editingUid ? "Menyimpan..." : "Mendaftarkan...");

    try {
      const nomorIdSudahAda = await cekNomorIdSudahAda(nomorId, editingUid);
      if (nomorIdSudahAda) {
        showToast("Nomor ID tersebut sudah dipakai karyawan lain.", "error");
        setButtonLoading(submitBtn, false);
        return;
      }

      if (editingUid) {
        // Mode EDIT: hanya perbarui data profil (email & password tidak diubah di sini)
        await updateDoc(doc(db, "users", editingUid), { nomorId, nama, divisi, role });
        showToast("Data karyawan berhasil diperbarui.", "success");
      } else {
        // Mode TAMBAH: buat akun login baru + profil Firestore
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
          showToast("Email dan Password wajib diisi untuk akun baru.", "error");
          setButtonLoading(submitBtn, false);
          return;
        }
        if (password.length < 6) {
          showToast("Password minimal 6 karakter.", "error");
          setButtonLoading(submitBtn, false);
          return;
        }

        const newUid = await buatAkunKaryawanBaru(email, password);

        await setDoc(doc(db, "users", newUid), {
          nomorId,
          nama,
          divisi,
          email,
          role,
          createdAt: new Date().toISOString(),
        });

        showToast(`Akun karyawan "${nama}" berhasil didaftarkan.`, "success");
      }

      batalkanEdit(form, emailPasswordWrapper);
    } catch (error) {
      console.error("Gagal menyimpan data karyawan:", error);
      if (error.code && error.code.startsWith("auth/")) {
        showToast(terjemahkanErrorAuth(error.code), "error");
      } else {
        showToast("Gagal menyimpan data. Silakan coba lagi.", "error");
      }
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  cancelBtn?.addEventListener("click", () => batalkanEdit(form, emailPasswordWrapper));
}

/**
 * Membuat akun login baru (Firebase Authentication) lewat instance Firebase
 * App KEDUA yang bersifat sementara, agar sesi login Admin di app utama
 * tidak ikut tergantikan oleh akun baru tersebut.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string>} uid akun yang baru dibuat
 */
async function buatAkunKaryawanBaru(email, password) {
  const namaAppSementara = `Sementara-${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, namaAppSementara);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = credential.user.uid;

    // Keluar dari sesi sementara ini & buang instance app-nya.
    // Sesi Admin di app utama (bukan app sementara ini) sama sekali tidak terpengaruh.
    await signOutSecondary(secondaryAuth);
    await deleteApp(secondaryApp);

    return newUid;
  } catch (error) {
    // Pastikan app sementara tetap dibuang meskipun terjadi error
    await deleteApp(secondaryApp).catch(() => {});
    throw error;
  }
}

function isiFormUntukEdit(data) {
  editingUid = data.uid;

  document.getElementById("karyawan-nomor-id").value = data.nomorId || "";
  document.getElementById("karyawan-nama").value = data.nama || "";
  document.getElementById("karyawan-divisi").value = data.divisi || "";
  document.getElementById("karyawan-role").value = data.role || "karyawan";

  document.getElementById("email-password-wrapper")?.classList.add("hidden");
  document.getElementById("karyawan-submit").textContent = "Update";
  document.getElementById("btn-batal-edit-karyawan")?.classList.remove("hidden");
  document.getElementById("karyawan-form-title").textContent = `Edit Data: ${data.nama}`;
  document.getElementById("info-edit-email")?.classList.remove("hidden");

  document.getElementById("karyawan-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function batalkanEdit(form, emailPasswordWrapper) {
  editingUid = null;
  form.reset();
  document.getElementById("karyawan-role").value = "karyawan";
  emailPasswordWrapper?.classList.remove("hidden");
  document.getElementById("karyawan-submit").textContent = "Daftarkan";
  document.getElementById("btn-batal-edit-karyawan")?.classList.add("hidden");
  document.getElementById("karyawan-form-title").textContent = "Daftarkan Karyawan Baru";
  document.getElementById("info-edit-email")?.classList.add("hidden");
}

/**
 * Menghapus data profil karyawan dari Firestore, dengan konfirmasi.
 *
 * KETERBATASAN PENTING: ini hanya menghapus PROFIL & AKSES DATA di
 * Firestore. Akun LOGIN-nya (Firebase Authentication) tidak ikut terhapus
 * secara otomatis dari sisi client (butuh Firebase Admin SDK / Cloud
 * Functions untuk itu). Jika ingin benar-benar mencegah orang tsb. login,
 * hapus juga manual lewat Firebase Console -> Authentication -> Users.
 *
 * @param {Object} data
 */
async function hapusKaryawan(data) {
  const konfirmasi = window.confirm(
    `Hapus data karyawan "${data.nama}"? Data lembur miliknya TIDAK ikut terhapus. ` +
      `Catatan: akun login-nya masih perlu dihapus manual lewat Firebase Console jika diperlukan.`
  );
  if (!konfirmasi) return;

  try {
    await deleteDoc(doc(db, "users", data.uid));
    showToast("Data karyawan berhasil dihapus.", "success");
  } catch (error) {
    console.error("Gagal menghapus data karyawan:", error);
    showToast("Gagal menghapus data. Anda mungkin tidak memiliki akses.", "error");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
