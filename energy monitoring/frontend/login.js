// ── Token helpers ─────────────────────────────────────────────────────
function getToken() {
    return sessionStorage.getItem('energyai_token') || localStorage.getItem('energyai_token');
}

function getAuthHeaders(json = false) {
    const t = getToken();
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
}

// ── Session helpers ───────────────────────────────────────────────────
function saveSession(user, token, remember) {
    const store = remember ? localStorage : sessionStorage;
    store.setItem('energyai_user', JSON.stringify(user));
    if (token) store.setItem('energyai_token', token);
}

function getSession() {
    const raw = sessionStorage.getItem('energyai_user') || localStorage.getItem('energyai_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// ── Auth guard — call on every protected page ─────────────────────────
function requireAuth() {
    const token = getToken();
    const user  = getSession();

    if (!token || !user) {
        window.location.href = 'index.html';
        return;
    }

    // Populate username in header
    const el = document.getElementById('userName');
    if (el) el.textContent = 'Welcome, ' + (user.name || 'User');

    // Show Users nav only for admin
    const navUsers = document.getElementById('navUsers');
    if (navUsers) navUsers.style.display = (user.role === 'admin') ? 'flex' : 'none';
}

// ── Admin-only guard ──────────────────────────────────────────────────
function requireAdmin() {
    requireAuth();
    const user = getSession();
    if (!user || user.role !== 'admin') {
        window.location.href = 'index.html';
    }
}

// ── Logout ────────────────────────────────────────────────────────────
function logout() {
    // Preserve per-user hasData cache so returning users skip upload prompt
    // (data is still in MongoDB — no need to re-upload)
    sessionStorage.removeItem('energyai_user');
    sessionStorage.removeItem('energyai_token');
    sessionStorage.removeItem('energyai_hasData');
    localStorage.removeItem('energyai_user');
    localStorage.removeItem('energyai_token');
    // NOTE: intentionally keep energyai_hasData_<email> in localStorage
    window.location.href = 'index.html';
}

// ── Password toggle ───────────────────────────────────────────────────
function togglePassword() {
    const input = document.getElementById('password');
    const icon  = document.getElementById('eyeIcon');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        if (icon) icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// ── Post-login redirect ───────────────────────────────────────────────
function redirectAfterLogin(user) {
    const overlay    = document.getElementById('loginOverlay');
    const appContent = document.getElementById('appContent');
    if (overlay && appContent) {
        overlay.style.display  = 'none';
        appContent.style.display = 'flex';
        const el = document.getElementById('userName');
        if (el) el.textContent = 'Welcome, ' + (user.name || 'User');
        const navUsers = document.getElementById('navUsers');
        if (navUsers) navUsers.style.display = (user.role === 'admin') ? 'flex' : 'none';

        // Restore sessionStorage hasData from localStorage for this user
        if (user.email) {
            const userKey = 'energyai_hasData_' + btoa(user.email);
            if (localStorage.getItem(userKey) === 'true') {
                sessionStorage.setItem('energyai_hasData', 'true');
            }
        }

        if (typeof checkUserDataAndShowDashboard === 'function') checkUserDataAndShowDashboard();
    } else {
        window.location.href = 'index.html';
    }
}

// ── Login form ────────────────────────────────────────────────────────
window._loginTab = 'user';

function switchLoginTab(tab) {
    window._loginTab = tab;
    const userTab    = document.getElementById('userTab');
    const adminTab   = document.getElementById('adminTab');
    const title      = document.getElementById('loginTitle');
    const subtitle   = document.getElementById('loginSubtitle');
    const signupLink = document.getElementById('signupLink');
    const adminHint  = document.getElementById('adminHint');
    const emailInput = document.getElementById('email');
    const active   = 'background:linear-gradient(135deg,#FFD700,#b8960c);color:#000;border:none;border-radius:0.4rem;font-size:0.9rem;font-weight:bold;cursor:pointer;flex:1;padding:0.6rem;';
    const inactive = 'background:transparent;color:#aaaaaa;border:none;border-radius:0.4rem;font-size:0.9rem;font-weight:bold;cursor:pointer;flex:1;padding:0.6rem;';

    if (tab === 'admin') {
        if (adminTab)   adminTab.style.cssText   = active;
        if (userTab)    userTab.style.cssText     = inactive;
        if (title)      title.textContent         = 'Admin Login';
        if (subtitle)   subtitle.textContent      = 'Sign in with your admin credentials';
        if (signupLink) signupLink.style.display  = 'none';
        if (adminHint)  adminHint.style.display   = 'block';
        // Pre-fill admin email to avoid typos
        if (emailInput && !emailInput.value) emailInput.value = 'admin@energyai.com';
    } else {
        if (userTab)    userTab.style.cssText     = active;
        if (adminTab)   adminTab.style.cssText    = inactive;
        if (title)      title.textContent         = 'Welcome back';
        if (subtitle)   subtitle.textContent      = 'Sign in to your EnergyAI account';
        if (signupLink) signupLink.style.display  = 'block';
        if (adminHint)  adminHint.style.display   = 'none';
        // Clear pre-filled admin email when switching back
        if (emailInput && emailInput.value === 'admin@energyai.com') emailInput.value = '';
    }

    // Clear any previous error
    const err = document.getElementById('errorMsg');
    if (err) err.style.display = 'none';
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email     = document.getElementById('email').value.trim();
        const password  = document.getElementById('password').value;
        const remember  = document.getElementById('rememberMe')?.checked || false;
        const btn       = document.getElementById('loginBtn');
        const errorMsg  = document.getElementById('errorMsg');
        const errorText = document.getElementById('errorText');
        const isAdmin   = window._loginTab === 'admin';

        btn.disabled  = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        if (errorMsg) errorMsg.style.display = 'none';

        try {
            const res  = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (isAdmin && data.data.user.role !== 'admin') {
                    if (errorText) errorText.textContent = 'This account does not have admin access.';
                    if (errorMsg)  errorMsg.style.display = 'flex';
                    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
                    btn.disabled  = false;
                    return;
                }
                saveSession(data.data.user, data.data.token, remember);
                redirectAfterLogin(data.data.user);
                return;
            }

            if (errorText) errorText.textContent = data.message || 'Invalid email or password.';
            if (errorMsg)  errorMsg.style.display = 'flex';
        } catch (err) {
            if (errorText) errorText.textContent = 'Cannot connect to server. Make sure the backend is running.';
            if (errorMsg)  errorMsg.style.display = 'flex';
        }

        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        btn.disabled  = false;
    });
}
