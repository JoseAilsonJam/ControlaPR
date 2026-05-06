// ──────────────────────────────────────────────
// Utilitários de API, autenticação e UI
// ──────────────────────────────────────────────

const API = '/api';

// ── Token / Usuário ──────────────────────────
function getToken()       { return localStorage.getItem('cpr_token'); }
function setToken(t)      { localStorage.setItem('cpr_token', t); }
function getUser()        { const u = localStorage.getItem('cpr_user'); return u ? JSON.parse(u) : null; }
function setUser(u)       { localStorage.setItem('cpr_user', JSON.stringify(u)); }

function logout() {
  localStorage.removeItem('cpr_token');
  localStorage.removeItem('cpr_user');
  window.location.href = '/';
}

function requireAuth() {
  if (!getToken() || !getUser()) { window.location.href = '/'; return false; }
  return true;
}

// ── Requisição base ──────────────────────────
async function req(method, endpoint, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);

  const res  = await fetch(`${API}${endpoint}`, opts);
  const data = await res.json();

  if (res.status === 401) { logout(); return; }
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

const api = {
  get:   (ep)       => req('GET',   ep),
  post:  (ep, body) => req('POST',  ep, body),
  patch: (ep, body) => req('PATCH', ep, body),
};

// ── Formatação de datas ──────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Status helpers ───────────────────────────
const STATUS_CLASS = {
  'Pendente de Conferência': 'pendente',
  'Conferindo':              'conferindo',
  'Comentado':               'comentado',
  'Aprovado':                'aprovado',
  'Corrigido':               'corrigido',
  'Comentado Novamente':     'comentado-novamente',
};

const STATUS_ICON = {
  'Pendente de Conferência': 'fa-clock',
  'Conferindo':              'fa-magnifying-glass',
  'Comentado':               'fa-comment',
  'Aprovado':                'fa-circle-check',
  'Corrigido':               'fa-wrench',
  'Comentado Novamente':     'fa-comments',
};

function badgeHtml(status) {
  const cls = STATUS_CLASS[status] || 'pendente';
  return `<span class="badge badge--${cls}">${status}</span>`;
}

// Ações disponíveis baseadas nas regras de negócio
function getActions(pr, currentUserId) {
  const isCreator         = pr.created_by === currentUserId;
  const isOtherUser       = !isCreator;
  const isCurrentReviewer = pr.conferindo_por === currentUserId;
  const actions           = [];

  switch (pr.status) {
    case 'Pendente de Conferência':
      if (isOtherUser) {
        actions.push({ status: 'Conferindo', label: 'Iniciar Conferência', cls: 'btn--info', needsComment: false });
      }
      break;

    case 'Conferindo':
      if (isCurrentReviewer) {
        actions.push({ status: 'Pendente de Conferência', label: 'Liberar PR', cls: 'btn--secondary', needsComment: false });
        if (pr.status_antes_conferindo === 'Corrigido') {
          actions.push({ status: 'Comentado Novamente', label: 'Comentar Novamente', cls: 'btn--purple', needsComment: true });
        } else {
          actions.push({ status: 'Comentado', label: 'Comentar', cls: 'btn--warning', needsComment: false });
        }
        actions.push({ status: 'Aprovado', label: 'Aprovar', cls: 'btn--success', needsComment: false });
      }
      break;

    case 'Comentado':
      if (isCurrentReviewer) {
        actions.push({ status: 'Conferindo', label: 'Voltar para Conferindo', cls: 'btn--secondary', needsComment: false });
      }
      if (isCreator) {
        actions.push({ status: 'Corrigido', label: 'Marcar como Corrigido', cls: 'btn--primary', needsComment: false });
      }
      break;

    case 'Aprovado':
      if (isCurrentReviewer) {
        actions.push({ status: 'Conferindo', label: 'Voltar para Conferindo', cls: 'btn--secondary', needsComment: false });
      }
      break;

    case 'Corrigido':
      if (pr.conferindo_por) {
        // Conferente bloqueado: só ele pode retomar
        if (pr.conferindo_por === currentUserId) {
          actions.push({ status: 'Conferindo', label: 'Retomar Conferência', cls: 'btn--info', needsComment: false });
        }
      } else if (isOtherUser) {
        actions.push({ status: 'Conferindo', label: 'Iniciar Conferência', cls: 'btn--info', needsComment: false });
      }
      break;

    case 'Comentado Novamente':
      if (isCreator) {
        actions.push({ status: 'Corrigido', label: 'Marcar como Corrigido', cls: 'btn--primary', needsComment: false });
      }
      break;
  }

  return actions;
}

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'info', title = '') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const el    = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <i class="toast__icon fa-solid ${icons[type] || icons.info}"></i>
    <div class="toast__content">
      ${title ? `<strong>${title}</strong>` : ''}
      <p>${msg}</p>
    </div>`;

  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Modal helpers ────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// Fecha modal ao clicar no backdrop
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// ── Sidebar: preenche dados do usuário ───────
function initSidebar() {
  const user = getUser();
  if (!user) return;

  const el = document.getElementById('sidebarUserName');
  const em = document.getElementById('sidebarUserEmail');
  const av = document.getElementById('sidebarAvatar');
  if (el) el.textContent  = user.name;
  if (em) em.textContent  = user.email;
  if (av) av.textContent  = user.name.charAt(0).toUpperCase();

  document.getElementById('btnLogout')?.addEventListener('click', () => {
    if (confirm('Deseja sair do sistema?')) logout();
  });

  document.getElementById('btnEditProfile')?.addEventListener('click', () => {
    const u = getUser();
    document.getElementById('profileName').value  = u.name;
    document.getElementById('profileEmail').value = u.email;
    document.getElementById('profileCurrentPw').value = '';
    document.getElementById('profileNewPw').value     = '';
    document.getElementById('profileConfirmPw').value = '';
    openModal('modalProfile');
  });

  document.getElementById('formProfile')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn        = e.target.querySelector('button[type=submit]');
    const name       = document.getElementById('profileName').value.trim();
    const email      = document.getElementById('profileEmail').value.trim();
    const currentPw  = document.getElementById('profileCurrentPw').value;
    const newPw      = document.getElementById('profileNewPw').value;
    const confirmPw  = document.getElementById('profileConfirmPw').value;

    if (!name || !email) { toast('Nome e e-mail são obrigatórios', 'warning'); return; }
    if (newPw && newPw !== confirmPw) { toast('As senhas não coincidem', 'warning'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    try {
      const body = { name, email };
      if (newPw) { body.currentPassword = currentPw; body.newPassword = newPw; }
      const data = await api.patch('/auth/profile', body);
      setToken(data.token);
      setUser(data.user);
      const av2 = document.getElementById('sidebarAvatar');
      if (document.getElementById('sidebarUserName')) document.getElementById('sidebarUserName').textContent = data.user.name;
      if (document.getElementById('sidebarUserEmail')) document.getElementById('sidebarUserEmail').textContent = data.user.email;
      if (av2) av2.textContent = data.user.name.charAt(0).toUpperCase();
      toast('Perfil atualizado com sucesso!', 'success');
      closeModal('modalProfile');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar';
    }
  });

  document.getElementById('btnCancelProfile')?.addEventListener('click', () => closeModal('modalProfile'));
}
