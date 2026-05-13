// ──────────────────────────────────────────────
// Página de Login / Cadastro
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Redireciona se já estiver logado
  if (getToken() && getUser()) {
    window.location.href = '/dashboard';
    return;
  }

  // ── Toggle mostrar/ocultar senha ──────────
  document.querySelectorAll('.input-pw__toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-pw').querySelector('input');
      const show  = input.type === 'password';
      input.type  = show ? 'text' : 'password';
      btn.querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });
  });

  // ── Tabs ──────────────────────────────────
  const tabs    = document.querySelectorAll('.auth-tab');
  const panels  = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t   => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // ── Login ─────────────────────────────────
  document.getElementById('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors('login');

    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = e.target.querySelector('button[type=submit]');

    setLoading(btn, true);
    try {
      const data = await api.post('/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      window.location.href = '/dashboard';
    } catch (err) {
      showError('loginError', err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  // ── Cadastro ──────────────────────────────
  document.getElementById('formRegister').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors('register');

    const name     = document.getElementById('registerName').value.trim();
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm  = document.getElementById('registerConfirm').value;
    const btn      = e.target.querySelector('button[type=submit]');

    if (password !== confirm) {
      showError('registerError', 'As senhas não coincidem');
      return;
    }

    setLoading(btn, true);
    try {
      const data = await api.post('/auth/register', { name, email, password });
      setToken(data.token);
      setUser(data.user);
      window.location.href = '/dashboard';
    } catch (err) {
      showError('registerError', err.message);
    } finally {
      setLoading(btn, false);
    }
  });
});

// ── Helpers ───────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearErrors(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
    if (el.classList.contains('form-error')) { el.textContent = ''; el.style.display = 'none'; }
  });
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.dataset.original = btn.dataset.original || btn.innerHTML;
  btn.innerHTML = loading
    ? '<span class="spinner"></span> Aguarde...'
    : btn.dataset.original;
}
