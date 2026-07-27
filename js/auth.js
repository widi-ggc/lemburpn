/**
 * File: js/auth.js
 * Bagian dari: Web App Manajemen Lembur Karyawan (MyOvertimes)
 *
 * Berisi seluruh logika autentikasi:
 * - Login dengan email & password (Firebase Authentication)
 * - Remember Me (persistence sesi)
 * - Logout
 * - Proteksi halaman (redirect otomatis jika belum/sudah login)
 */

import { auth, db, setAuthPersistence } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showToast, setButtonLoading, terjemahkanErrorAuth } from "./utils.js";

// Key localStorage untuk menyimpan email terakhir saat "Remember Me" dicentang
const REMEMBERED_EMAIL_KEY = "myovertimes-remembered-email";

/* ============================================================
 * INISIALISASI HALAMAN LOGIN (login.html)
 * ============================================================ */

/**
 * Menyiapkan seluruh interaksi pada halaman Login:
 * - Autofill email jika sebelumnya "Remember Me" dicentang
 * - Toggle show/hide password
 * - Submit form -> proses login
 * - Redirect ke dashboard jika user ternyata sudah login
 */
export function initLoginPage() {
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const rememberCheckbox = document.getElementById("login-remember");
  const togglePasswordBtn = document.getElementById("toggle-password");
  const submitBtn = document.getElementById("login-submit");
  const errorBox = document.getElementById("login-error");

  if (!form) return; // Bukan halaman login, hentikan.

  // Jika pengguna sudah login sebelumnya, langsung arahkan ke dashboard
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = "dashboard.html";
    }
  });

  // Isi otomatis email jika sebelumnya "Remember Me" pernah dicentang
  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  if (rememberedEmail) {
    emailInput.value = rememberedEmail;
    rememberCheckbox.checked = true;
  }

  // Toggle tampilkan/sembunyikan password
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      togglePasswordBtn.setAttribute(
        "aria-label",
        isPassword ? "Sembunyikan password" : "Tampilkan password"
      );
      // Ganti ikon mata terbuka <-> mata tercoret
      togglePasswordBtn.querySelector(".icon-eye-open").classList.toggle("hidden");
      togglePasswordBtn.querySelector(".icon-eye-closed").classList.toggle("hidden");
    });
  }

  // Proses submit form login
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberCheckbox.checked;

    if (!email || !password) {
      showError("Email dan password wajib diisi.");
      return;
    }

    setButtonLoading(submitBtn, true, "Masuk...");

    try {
      // Atur tipe persistence sesi berdasarkan pilihan Remember Me
      await setAuthPersistence(rememberMe);

      // Proses login ke Firebase Authentication
      await signInWithEmailAndPassword(auth, email, password);

      // Simpan/hapus email yang diingat sesuai pilihan Remember Me
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      showToast("Login berhasil. Mengarahkan ke dashboard...", "success", 1500);
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Login error:", error);
      showError(terjemahkanErrorAuth(error.code));
      setButtonLoading(submitBtn, false);
    }
  });

  function showError(message) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }

  function hideError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }
}

/* ============================================================
 * PROTEKSI HALAMAN (dashboard.html, lembur.html, laporan.html, setting.html)
 * ============================================================ */

/**
 * Melindungi halaman agar hanya bisa diakses oleh user yang sudah login.
 * Jika belum login, otomatis diarahkan ke login.html.
 * Jika sudah login, callback dipanggil dengan data user (termasuk profil
 * dari Firestore koleksi `users`, misalnya nama & role).
 *
 * Cara pakai di halaman lain:
 *   import { protectPage } from "./auth.js";
 *   protectPage((userProfile) => {
 *     console.log(userProfile.nama, userProfile.role);
 *   });
 *
 * @param {(userProfile: {uid: string, email: string, nama: string, role: string}) => void} onAuthenticated
 */
export function protectPage(onAuthenticated) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    // Ambil data profil tambahan (nama, role) dari Firestore koleksi `users`
    let nama = user.email;
    let role = "user";
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        nama = data.nama || nama;
        role = data.role || role;
      }
    } catch (error) {
      console.error("Gagal mengambil profil pengguna:", error);
    }

    if (typeof onAuthenticated === "function") {
      onAuthenticated({ uid: user.uid, email: user.email, nama, role });
    }
  });
}

/* ============================================================
 * LOGOUT
 * ============================================================ */

/**
 * Melakukan logout dari Firebase Authentication lalu mengarahkan
 * pengguna kembali ke halaman Login.
 * Dipasang pada tombol "Logout" di sidebar setiap halaman terproteksi.
 *
 * @param {string} [logoutButtonId="logout-button"]
 */
export function initLogout(logoutButtonId = "logout-button") {
  const logoutBtn = document.getElementById(logoutButtonId);
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    const confirmLogout = window.confirm("Yakin ingin logout?");
    if (!confirmLogout) return;

    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch (error) {
      console.error("Logout error:", error);
      showToast("Gagal logout. Silakan coba lagi.", "error");
    }
  });
}
