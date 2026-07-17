/**
 * auth-guard.js
 * ------------------------------------------------------------------
 * Proteksi login satu-pintu untuk semua halaman dashboard.
 * Cukup pasang satu baris ini di setiap halaman yang mau dikunci:
 *
 *     <script src="auth-guard.js"></script>
 *
 * Script ini otomatis:
 *  - Mendeteksi navbar situs (.site-navbar atau .navbar) dan MEMBIARKANNYA tetap normal
 *  - Mem-blur & mengunci semua konten LAIN di halaman sampai user login
 *  - Login lewat Google Apps Script + Google Sheet (email/password)
 *  - Fallback kredensial master (username biasa, bukan email)
 *  - Fitur ganti password
 *  - Mengunci scroll (wheel/touch/keyboard) selama belum login
 *
 * PENTING: ini proteksi tampilan (client-side), bukan keamanan sungguhan.
 * Siapa pun yang membuka "View Page Source" bisa melihat kredensial master
 * dan struktur halaman yang di-blur. Cocok untuk mencegah akses orang awam,
 * bukan untuk melindungi data yang benar-benar sensitif.
 * ------------------------------------------------------------------
 */
(function () {
  "use strict";

  /* ============ KONFIGURASI — edit di sini saja, berlaku di semua halaman ============ */
  const WEBAPP_URL = "PASTE_URL_WEB_APP_ANDA_DI_SINI"; // URL hasil deploy Google Apps Script
  const MASTER_USER = "admin";
  const MASTER_PASS = "sanggala25";
  const CONTACT_EMAIL = "gis@carbonxco.com";
  const SESSION_KEY = "dashboardAuthed";
  const SESSION_EMAIL_KEY = "dashboardAuthedEmail";
  /* ===================================================================================== */

  const CSS = `
    .authg-lock { filter: blur(8px); pointer-events: none; user-select: none; }
    html.authg-noscroll, html.authg-noscroll body { overflow: hidden !important; height: 100% !important; }

    #authgOverlay {
      position: fixed; left: 0; right: 0; bottom: 0;
      background: rgba(53, 103, 96, 0.18);
      backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999;
      font-family: Arial, Helvetica, sans-serif;
    }
    #authgOverlay.authg-hidden { display: none; }

    .authg-card {
      background: #fff; border: 1px solid #DCDACC; border-radius: 10px;
      box-shadow: 0 12px 40px rgba(0,0,0,.18);
      padding: 32px 30px; width: 320px; text-align: center;
    }
    .authg-icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: #FFFAF3; border: 1px solid #DCDACC;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 14px; overflow: hidden;
    }
    .authg-icon img { width: 28px; height: 28px; object-fit: contain; }
    .authg-card h2 { font-size: 15px; color: #356760; margin-bottom: 6px; }
    .authg-card p { font-size: 11px; color: #6b7280; margin-bottom: 18px; line-height: 1.5; }
    .authg-field { margin-bottom: 12px; text-align: left; }
    .authg-field label {
      display: block; font-size: 10px; font-weight: 700; color: #6b7280;
      text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px;
    }
    .authg-field input {
      width: 100%; padding: 9px 10px; border: 1px solid #DCDACC; border-radius: 6px;
      font-size: 13px; font-family: Arial, Helvetica, sans-serif; outline: none;
      box-sizing: border-box; transition: border-color .15s;
    }
    .authg-field input:focus { border-color: #618273; }
    .authg-btn {
      width: 100%; padding: 10px; border: none; border-radius: 6px;
      background: #356760; color: #fff; font-size: 13px; font-weight: 700;
      cursor: pointer; margin-top: 6px; transition: background .15s;
      font-family: Arial, Helvetica, sans-serif;
    }
    .authg-btn:hover { background: #618273; }
    .authg-btn:disabled { opacity: .6; cursor: not-allowed; }
    .authg-error { color: #b91c1c; font-size: 11px; margin-top: 10px; min-height: 14px; }
    .authg-success { color: #166534; font-size: 11px; margin-top: 10px; min-height: 14px; }
    .authg-hidden-el { display: none !important; }
    .authg-switch { margin-top: 14px; font-size: 11px; }
    .authg-switch a { color: #618273; text-decoration: none; font-weight: 600; }
    .authg-switch a:hover { color: #356760; }
    .authg-contact {
      margin-top: 10px; padding-top: 10px; border-top: 1px solid #DCDACC;
      font-size: 10.5px; color: #6b7280; line-height: 1.5;
    }
    .authg-contact a { color: #618273; font-weight: 700; text-decoration: none; }
    .authg-contact a:hover { color: #356760; }

    .authg-logout-btn {
      display: none;
      align-items: center; gap: 5px;
      padding: 6px 12px;
      border: 1px solid #DCDACC;
      border-radius: 20px;
      background: #FFFAF3;
      color: #356760;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: Arial, Helvetica, sans-serif;
      transition: background .15s, color .15s;
      white-space: nowrap;
    }
    .authg-logout-btn:hover { background: #618273; color: #fff; }
    .authg-logout-btn.authg-show { display: inline-flex; }

    /* fallback: kalau tidak ada spacer khusus di navbar (mis. halaman dengan top-bar gelap),
       tombol logout ditampilkan mengambang tetap di pojok kanan atas */
    .authg-logout-fixed {
      position: fixed; top: 14px; right: 16px; z-index: 100000;
    }
  `;

  function injectCSS() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "authgOverlay";
    overlay.innerHTML = `
      <div class="authg-card">
        <div class="authg-icon"><img src="assets/logo/Sanggala_color.png" alt="Sanggala Corridor Project"></div>

        <div id="authgLoginView">
          <h2>Akses Terbatas</h2>
          <p>Masukkan email dan password untuk melanjutkan.</p>
          <form id="authgLoginForm">
            <div class="authg-field">
              <label for="authgEmail">Email / Username</label>
              <input type="text" id="authgEmail" autocomplete="username" autocapitalize="off" spellcheck="false" required>
            </div>
            <div class="authg-field">
              <label for="authgPass">Password</label>
              <input type="password" id="authgPass" autocomplete="current-password" required>
            </div>
            <button type="submit" class="authg-btn" id="authgLoginBtn">Masuk</button>
            <div class="authg-error" id="authgLoginError"></div>
          </form>
          <div class="authg-switch"><a href="#" id="authgShowChangePass">Ganti password</a></div>
          <div class="authg-contact">
            kontak <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> untuk pengguna baru
          </div>
        </div>

        <div id="authgChangePassView" class="authg-hidden-el">
          <h2>Ganti Password</h2>
          <p>Masukkan email, password lama, dan password baru Anda.</p>
          <form id="authgChangePassForm">
            <div class="authg-field">
              <label for="authgCpEmail">Email</label>
              <input type="email" id="authgCpEmail" autocomplete="username" autocapitalize="off" spellcheck="false" required>
            </div>
            <div class="authg-field">
              <label for="authgCpOld">Password Lama</label>
              <input type="password" id="authgCpOld" autocomplete="current-password" required>
            </div>
            <div class="authg-field">
              <label for="authgCpNew">Password Baru</label>
              <input type="password" id="authgCpNew" autocomplete="new-password" required minlength="4">
            </div>
            <button type="submit" class="authg-btn" id="authgCpBtn">Simpan Password Baru</button>
            <div class="authg-error" id="authgCpError"></div>
          </form>
          <div class="authg-switch"><a href="#" id="authgShowLogin">&larr; Kembali ke halaman login</a></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function callBackend(payload) {
    return fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); });
  }

  function init() {
    injectCSS();

    // Navbar situs dibiarkan normal — semua elemen body LAIN dianggap konten yang dikunci.
    // Urutan pencarian: navbar situs standar dulu, baru fallback ke top-bar internal
    // (dipakai halaman yang link Home/Activities/Dashboard-nya dipindah ke dropdown menu).
    const navbar = document.querySelector(".site-navbar, .navbar, .top-bar");
    const lockables = Array.prototype.filter.call(document.body.children, function (el) {
      return el !== navbar && el.tagName !== "SCRIPT";
    });

    const overlay = buildOverlay();

    // ---- Tombol Logout (pojok kanan atas) ----
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "authg-logout-btn";
    logoutBtn.textContent = "Logout";
    if (navbar) {
      const spacer = navbar.querySelector(".site-navbar-spacer, .navbar-spacer");
      if (spacer) {
        spacer.appendChild(logoutBtn);
      } else if (navbar.lastElementChild) {
        navbar.lastElementChild.appendChild(logoutBtn);
      } else {
        navbar.appendChild(logoutBtn);
      }
    } else {
      logoutBtn.classList.add("authg-logout-fixed");
      document.body.appendChild(logoutBtn);
    }

    function positionOverlay() {
      overlay.style.top = navbar ? navbar.offsetHeight + "px" : "0px";
    }
    positionOverlay();
    window.addEventListener("resize", positionOverlay);

    function lock() {
      lockables.forEach(function (el) { el.classList.add("authg-lock"); });
      overlay.classList.remove("authg-hidden");
      logoutBtn.classList.remove("authg-show");
      document.documentElement.classList.add("authg-noscroll");
      window.scrollTo(0, 0);
    }
    function unlock() {
      lockables.forEach(function (el) { el.classList.remove("authg-lock"); });
      overlay.classList.add("authg-hidden");
      logoutBtn.classList.add("authg-show");
      document.documentElement.classList.remove("authg-noscroll");
    }
    function isLocked() {
      return document.documentElement.classList.contains("authg-noscroll");
    }

    logoutBtn.addEventListener("click", function () {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_EMAIL_KEY);
      lock();
    });

    // Jaring pengaman tambahan supaya scroll benar-benar terkunci di semua device
    const SCROLL_KEYS = [" ", "PageDown", "PageUp", "End", "Home", "ArrowDown", "ArrowUp"];
    window.addEventListener("wheel", function (e) { if (isLocked()) e.preventDefault(); }, { passive: false });
    window.addEventListener("touchmove", function (e) { if (isLocked()) e.preventDefault(); }, { passive: false });
    window.addEventListener("keydown", function (e) {
      if (isLocked() && SCROLL_KEYS.indexOf(e.key) !== -1) e.preventDefault();
    });

    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      unlock();
    } else {
      lock();
    }

    // ---- Elemen form ----
    const loginView = document.getElementById("authgLoginView");
    const changeView = document.getElementById("authgChangePassView");
    const loginForm = document.getElementById("authgLoginForm");
    const changeForm = document.getElementById("authgChangePassForm");
    const loginError = document.getElementById("authgLoginError");
    const cpError = document.getElementById("authgCpError");
    const loginBtn = document.getElementById("authgLoginBtn");
    const cpBtn = document.getElementById("authgCpBtn");

    function showLoginView() {
      loginView.classList.remove("authg-hidden-el");
      changeView.classList.add("authg-hidden-el");
      loginError.textContent = "";
      cpError.textContent = "";
      cpError.className = "authg-error";
    }
    function showChangeView() {
      loginView.classList.add("authg-hidden-el");
      changeView.classList.remove("authg-hidden-el");
      loginError.textContent = "";
      cpError.textContent = "";
    }
    document.getElementById("authgShowChangePass").addEventListener("click", function (e) {
      e.preventDefault(); showChangeView();
    });
    document.getElementById("authgShowLogin").addEventListener("click", function (e) {
      e.preventDefault(); showLoginView();
    });

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const email = document.getElementById("authgEmail").value.trim().toLowerCase();
      const password = document.getElementById("authgPass").value;
      loginError.textContent = "";

      // Kredensial master — bypass langsung tanpa cek ke Apps Script/Sheet.
      if (email === MASTER_USER && password === MASTER_PASS) {
        sessionStorage.setItem(SESSION_KEY, "true");
        sessionStorage.setItem(SESSION_EMAIL_KEY, "admin");
        unlock();
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = "Memeriksa...";
      callBackend({ action: "login", email: email, password: password })
        .then(function (result) {
          if (result.success) {
            sessionStorage.setItem(SESSION_KEY, "true");
            sessionStorage.setItem(SESSION_EMAIL_KEY, email);
            unlock();
          } else {
            loginError.textContent = result.message || "Email atau password salah.";
          }
        })
        .catch(function () {
          loginError.textContent = "Gagal terhubung ke server. Coba lagi.";
        })
        .finally(function () {
          loginBtn.disabled = false;
          loginBtn.textContent = "Masuk";
        });
    });

    changeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const email = document.getElementById("authgCpEmail").value.trim().toLowerCase();
      const oldPassword = document.getElementById("authgCpOld").value;
      const newPassword = document.getElementById("authgCpNew").value;
      cpError.textContent = "";

      cpBtn.disabled = true;
      cpBtn.textContent = "Menyimpan...";
      callBackend({ action: "changePassword", email: email, oldPassword: oldPassword, newPassword: newPassword })
        .then(function (result) {
          if (result.success) {
            cpError.className = "authg-success";
            cpError.textContent = "Password berhasil diganti. Silakan login dengan password baru.";
            changeForm.reset();
            setTimeout(showLoginView, 1800);
          } else {
            cpError.className = "authg-error";
            cpError.textContent = result.message || "Gagal mengganti password.";
          }
        })
        .catch(function () {
          cpError.className = "authg-error";
          cpError.textContent = "Gagal terhubung ke server. Coba lagi.";
        })
        .finally(function () {
          cpBtn.disabled = false;
          cpBtn.textContent = "Simpan Password Baru";
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
