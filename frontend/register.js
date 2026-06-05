// Toggle password visibility
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// Password strength meter
const passwordInput = document.getElementById('password');
if (passwordInput) {
    passwordInput.addEventListener('input', function() {
        const val = this.value;
        const fill = document.getElementById('strengthFill');
        let strength = 0;
        if (val.length >= 6) strength++;
        if (val.length >= 10) strength++;
        if (/[A-Z]/.test(val)) strength++;
        if (/[0-9]/.test(val)) strength++;
        if (/[^A-Za-z0-9]/.test(val)) strength++;

        const widths = ['0%', '20%', '40%', '60%', '80%', '100%'];
        const colors = ['#2a2a2a', '#ff6b35', '#ff6b35', '#FFD700', '#43e97b', '#43e97b'];
        fill.style.width = widths[strength];
        fill.style.background = colors[strength];
    });
}

// Register form handler
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = document.getElementById('registerBtn');
        const errorMsg = document.getElementById('errorMsg');
        const errorText = document.getElementById('errorText');
        const successMsg = document.getElementById('successMsg');
        const successText = document.getElementById('successText');

        errorMsg.style.display = 'none';
        successMsg.style.display = 'none';
        if (password !== confirmPassword) {
            errorText.textContent = 'Passwords do not match.';
            errorMsg.style.display = 'flex';
            return;
        }

        if (password.length < 6) {
            errorText.textContent = 'Password must be at least 6 characters.';
            errorMsg.style.display = 'flex';
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await res.json();

            if (data.success) {
                successText.textContent = 'Account created! Redirecting...';
                successMsg.style.display = 'flex';
                // Use sessionStorage by default — user can choose remember-me on login
                if (data.data?.token) sessionStorage.setItem('energyai_token', data.data.token);
                if (data.data?.user)  sessionStorage.setItem('energyai_user', JSON.stringify(data.data.user));
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                errorText.textContent = data.message || 'Registration failed.';
                errorMsg.style.display = 'flex';
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
                btn.disabled = false;
            }
        } catch (err) {
            errorText.textContent = 'Server error. Please try again.';
            errorMsg.style.display = 'flex';
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Sign Up';
            btn.disabled = false;
        }
    });
}
