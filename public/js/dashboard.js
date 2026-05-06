// ──────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initSidebar();
  await loadDashboard();
});

async function loadDashboard() {
  try {
    const data = await api.get('/dashboard');
    renderStats(data.counts);
    renderAlerts(data.alerts);
    renderActivity(data.recentActivity);
  } catch (err) {
    toast('Erro ao carregar dashboard: ' + err.message, 'error');
  }
}

// ── Estatísticas ──────────────────────────────
function renderStats(counts) {
  const statuses = [
    { key: 'Pendente de Conferência', mod: 'pendente',            icon: 'fa-clock',           label: 'Pendente de Conferência' },
    { key: 'Conferindo',              mod: 'conferindo',           icon: 'fa-magnifying-glass', label: 'Em Conferência'         },
    { key: 'Comentado',               mod: 'comentado',            icon: 'fa-comment',          label: 'Comentado'              },
    { key: 'Corrigido',               mod: 'corrigido',            icon: 'fa-wrench',           label: 'Corrigido'              },
    { key: 'Comentado Novamente',     mod: 'comentado-novamente',  icon: 'fa-comments',         label: 'Comentado Novamente'    },
    { key: 'Aprovado',                mod: 'aprovado',             icon: 'fa-circle-check',     label: 'Aprovado'               },
  ];

  const grid = document.getElementById('statsGrid');
  grid.innerHTML = statuses.map(s => `
    <div class="stat-card stat-card--${s.mod}">
      <div class="stat-card__icon">
        <i class="fa-solid ${s.icon}"></i>
      </div>
      <div class="stat-card__info">
        <p>${s.label}</p>
        <h3>${counts[s.key] ?? 0}</h3>
      </div>
    </div>
  `).join('');
}

// ── Alertas de PRs antigos ────────────────────
function renderAlerts(alerts) {
  const container = document.getElementById('alertsContainer');

  if (!alerts || alerts.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lista = alerts.map(a => {
    const url   = a.title || a.url;
    const dias  = a.dias_pendente;
    return `<li><strong>${dias} dia${dias !== 1 ? 's' : ''}</strong> — <a href="${a.url}" target="_blank" rel="noopener">${url}</a> (por ${a.creator_name})</li>`;
  }).join('');

  container.innerHTML = `
    <div class="alert alert--warning">
      <i class="alert__icon fa-solid fa-triangle-exclamation"></i>
      <div class="alert__content">
        <strong>⚠ Atenção! ${alerts.length} PR${alerts.length > 1 ? 's estão' : ' está'} pendente${alerts.length > 1 ? 's' : ''} há mais de 7 dias</strong>
        <p>Os seguintes Pull Requests aguardam conferência e podem estar bloqueando o time:</p>
        <ul>${lista}</ul>
      </div>
    </div>`;
}

// ── Atividade recente ─────────────────────────
function renderActivity(activity) {
  const el = document.getElementById('activityList');

  if (!activity || activity.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fa-solid fa-timeline"></i></div>
        <h3>Nenhuma atividade recente</h3>
        <p>As alterações de status dos PRs aparecerão aqui.</p>
      </div>`;
    return;
  }

  el.innerHTML = activity.map(a => {
    const icon = STATUS_ICON[a.new_status] || 'fa-arrow-right';
    const prLabel = a.pr_title || truncateUrl(a.pr_url);
    return `
      <div class="activity-list__item">
        <div class="activity-list__item-dot">
          <i class="fa-solid ${icon}" style="font-size:11px;color:var(--c)"></i>
        </div>
        <div class="activity-list__item-info">
          <p>
            <strong>${a.changed_by_name}</strong> marcou como
            ${badgeHtml(a.new_status)} —
            <a href="${a.pr_url}" target="_blank" rel="noopener">${prLabel}</a>
          </p>
          <span>${fmtDate(a.changed_at)}</span>
        </div>
      </div>`;
  }).join('');
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '') || url;
  } catch { return url.length > 50 ? url.slice(0, 50) + '…' : url; }
}
