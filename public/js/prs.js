// ──────────────────────────────────────────────
// Pull Requests
// ──────────────────────────────────────────────

let allPRs        = [];
let filterStatus  = 'Todos';
let searchTerm    = '';
let currentPR     = null;
let pendingAction = null; // { status, needsComment }

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  initSidebar();
  bindEvents();
  await loadPRs();

  // Atualiza a lista automaticamente quando qualquer PR mudar
  initRealtime(async (data) => {
    await loadPRs(data.id);
  });
});

// ── Eventos ───────────────────────────────────
function bindEvents() {
  // Novo PR
  document.getElementById('btnNewPR').addEventListener('click', () => openModal('modalNewPR'));
  document.getElementById('btnCancelNewPR').addEventListener('click', () => closeModal('modalNewPR'));

  document.getElementById('formNewPR').addEventListener('submit', async e => {
    e.preventDefault();
    const btn         = e.target.querySelector('button[type=submit]');
    const url         = document.getElementById('prUrl').value.trim();
    const title       = document.getElementById('prTitle').value.trim();
    const description = document.getElementById('prDescription').value.trim();

    if (!url) { toast('Informe a URL do PR', 'warning'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    try {
      await api.post('/prs', { url, title: title || null, description: description || null });
      toast('PR cadastrado com sucesso!', 'success');
      closeModal('modalNewPR');
      document.getElementById('formNewPR').reset();
      await loadPRs();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Cadastrar PR';
    }
  });

  // Pesquisa
  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase();
    renderTable();
  });

  // Fechar modal detalhe
  document.getElementById('btnCloseDetail').addEventListener('click', () => closeModal('modalDetail'));

  // Modal de alteração de status
  document.getElementById('btnCancelStatus').addEventListener('click', () => closeModal('modalStatus'));

  document.getElementById('formStatus').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentPR || !pendingAction) return;

    const comment = document.getElementById('statusComment').value.trim();
    const btn     = e.target.querySelector('button[type=submit]');

    if (pendingAction.needsComment && !comment) {
      toast('Adicione um comentário antes de prosseguir', 'warning');
      return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    try {
      await api.patch(`/prs/${currentPR.id}/status`, {
        status:  pendingAction.status,
        comment: comment || null,
      });
      toast(`Status alterado para "${pendingAction.status}"`, 'success');
      closeModal('modalStatus');
      closeModal('modalDetail');
      await loadPRs();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar';
    }
  });
}

// ── Carregar PRs ──────────────────────────────
let _carregando = false;

async function loadPRs(highlightId = null) {
  if (_carregando) return; // evita requisições simultâneas
  _carregando = true;

  const tbody = document.getElementById('prTableBody');

  // Spinner apenas no carregamento inicial
  if (allPRs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#94a3b8"><span class="spinner"></span></td></tr>`;
  }

  try {
    allPRs = await api.get('/prs');
    renderFilters();
    renderTable();

    // Flash na linha do PR alterado
    if (highlightId) {
      setTimeout(() => {
        const row = tbody.querySelector(`tr[data-id="${highlightId}"]`);
        if (row) {
          row.classList.add('row-flash');
          row.addEventListener('animationend', () => row.classList.remove('row-flash'), { once: true });
        }
      }, 60);
    }
  } catch (err) {
    toast('Erro ao carregar PRs: ' + err.message, 'error');
    if (allPRs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#dc2626">Erro ao carregar dados</td></tr>`;
    }
  } finally {
    _carregando = false;
  }
}

// ── Filtros ───────────────────────────────────
function renderFilters() {
  const statusList = [
    'Todos',
    'Pendente de Conferência',
    'Conferindo',
    'Comentado',
    'Corrigido',
    'Comentado Novamente',
    'Aprovado',
  ];
  const container = document.getElementById('filterButtons');
  container.innerHTML = statusList.map(s => {
    const count = s === 'Todos' ? allPRs.filter(p => p.status !== 'Aprovado').length : allPRs.filter(p => p.status === s).length;
    return `<button class="filter-btn ${filterStatus === s ? 'active' : ''}" data-status="${s}">
      ${s} <span style="opacity:.6">(${count})</span>
    </button>`;
  }).join('');

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.status;
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTable();
    });
  });
}

// ── Tabela ────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('prTableBody');
  const user  = getUser();

  let filtered = filterStatus === 'Todos' ? allPRs.filter(p => p.status !== 'Aprovado') : allPRs.filter(p => p.status === filterStatus);

  if (searchTerm) {
    filtered = filtered.filter(p =>
      (p.title || '').toLowerCase().includes(searchTerm) ||
      p.url.toLowerCase().includes(searchTerm) ||
      p.creator_name.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-code-branch"></i></div>
            <h3>Nenhum PR encontrado</h3>
            <p>Tente ajustar os filtros ou cadastre um novo PR.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(pr => {
    const actions   = getActions(pr, user.id);
    const isOwner   = pr.created_by === user.id;
    const isReviwer = pr.conferindo_por === user.id;
    const label     = pr.title || pr.url;

    // ── Coluna Conferente ──────────────────────
    let conferenteHtml = '<span style="font-size:11px;color:#9ca3af">—</span>';
    if (pr.conferindo_por_name) {
      const euTag  = isReviwer ? ' <span style="font-size:10px;color:#9ca3af">(você)</span>' : '';
      const icon   = pr.status === 'Conferindo'
        ? 'fa-magnifying-glass'
        : 'fa-user-check';
      const color  = pr.status === 'Conferindo' ? '#4b5563' : '#6b7280';
      conferenteHtml = `<span style="font-size:12px;color:${color}">
        <i class="fa-solid ${icon}" style="margin-right:4px"></i>${escHtml(pr.conferindo_por_name)}${euTag}
      </span>`;
    }

    // ── Coluna Ações rápidas ──────────────────
    let actionsHtml;
    const bloqueadoPorOutro = pr.conferindo_por && !isReviwer && !isOwner;

    if (pr.status === 'Conferindo' && bloqueadoPorOutro) {
      actionsHtml = `<span style="font-size:11px;color:#4b5563">
        <i class="fa-solid fa-lock" style="margin-right:3px"></i>Em conferência
      </span>`;
    } else if (pr.status === 'Corrigido' && pr.conferindo_por && !isReviwer && !isOwner) {
      actionsHtml = `<span style="font-size:11px;color:#6b7280">
        <i class="fa-solid fa-clock-rotate-left" style="margin-right:3px"></i>Aguardando ${escHtml(pr.conferindo_por_name)}
      </span>`;
    } else if (actions.length > 0) {
      actionsHtml = actions.map(a =>
        `<button class="btn btn--sm ${a.cls}"
          onclick="event.stopPropagation();openActionModal(${pr.id},'${escAttr(a.status)}',${a.needsComment},'${escAttr(a.label)}')"
        >${a.label}</button>`
      ).join(' ');
    } else {
      actionsHtml = `<span style="font-size:11px;color:#94a3b8">—</span>`;
    }

    return `
      <tr data-id="${pr.id}">
        <td>
          <div style="font-weight:500;color:#1f2937;font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(pr.url)}">
            ${escHtml(label)}
          </div>
          <a class="pr-url-cell" href="${escHtml(pr.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${escHtml(pr.url)}">
            ${escHtml(pr.url)}
          </a>
        </td>
        <td>${badgeHtml(pr.status)}</td>
        <td>
          <span style="font-size:13px">${escHtml(pr.creator_name)}</span>
          ${isOwner ? '<br><span style="font-size:10px;color:#9ca3af">(você)</span>' : ''}
        </td>
        <td>${conferenteHtml}</td>
        <td style="white-space:nowrap">${fmtDateShort(pr.created_at)}</td>
        <td style="white-space:nowrap">${fmtDateShort(pr.updated_at)}</td>
        <td>${actionsHtml}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => openDetail(parseInt(row.dataset.id)));
  });
}

// ── Detalhe do PR ─────────────────────────────
async function openDetail(id) {
  openModal('modalDetail');
  const body = document.getElementById('modalDetailBody');
  body.innerHTML = `<div style="text-align:center;padding:40px"><span class="spinner"></span></div>`;

  try {
    const pr   = await api.get(`/prs/${id}`);
    const user = getUser();
    currentPR  = pr;

    const actions     = getActions(pr, user.id);
    const isCreator   = pr.created_by === user.id;
    const isReviewer  = pr.conferindo_por === user.id;

    // Banner de bloqueio — quando o usuário não pode interagir
    let lockBanner = '';
    const bloqueado = pr.conferindo_por && !isReviewer && !isCreator;
    if (bloqueado) {
      if (pr.status === 'Conferindo') {
        lockBanner = `
          <div class="alert alert--info" style="margin-bottom:16px">
            <i class="alert__icon fa-solid fa-lock"></i>
            <div class="alert__content">
              <strong>PR em conferência</strong>
              <p>Este PR está sendo revisado por <strong>${escHtml(pr.conferindo_por_name)}</strong> no momento.</p>
            </div>
          </div>`;
      } else if (pr.status === 'Corrigido') {
        lockBanner = `
          <div class="alert alert--info" style="margin-bottom:16px">
            <i class="alert__icon fa-solid fa-clock-rotate-left"></i>
            <div class="alert__content">
              <strong>Aguardando retomada pelo conferente</strong>
              <p>Somente <strong>${escHtml(pr.conferindo_por_name)}</strong> pode retomar a conferência deste PR.</p>
            </div>
          </div>`;
      } else if (pr.status === 'Comentado' || pr.status === 'Comentado Novamente') {
        lockBanner = `
          <div class="alert alert--info" style="margin-bottom:16px">
            <i class="alert__icon fa-solid fa-user-check"></i>
            <div class="alert__content">
              <strong>Revisão em andamento</strong>
              <p>Este PR está sendo acompanhado por <strong>${escHtml(pr.conferindo_por_name)}</strong>. Aguardando correção do autor.</p>
            </div>
          </div>`;
      }
    }

    const actionsHtml = actions.length > 0
      ? actions.map(a =>
          `<button class="btn ${a.cls}"
            onclick="openActionModal(${pr.id},'${escAttr(a.status)}',${a.needsComment},'${escAttr(a.label)}')"
          >${a.label}</button>`
        ).join('')
      : `<span class="no-actions">Nenhuma ação disponível para você neste momento.</span>`;

    // Edição de URL: apenas o criador pode editar
    const urlEditHtml = isCreator ? `
      <div id="urlEditSection" style="margin-top:6px">
        <button type="button" class="btn btn--ghost btn--sm" onclick="toggleUrlEdit()">
          <i class="fa-solid fa-pen"></i> Editar URL
        </button>
        <div id="urlEditForm" style="display:none;margin-top:8px">
          <div style="display:flex;gap:8px;align-items:center">
            <input type="url" id="urlEditInput" class="form-control" value="${escHtml(pr.url)}" placeholder="Nova URL do PR">
            <button type="button" class="btn btn--primary btn--sm" onclick="saveUrl(${pr.id})">Salvar</button>
            <button type="button" class="btn btn--ghost btn--sm" onclick="toggleUrlEdit()">Cancelar</button>
          </div>
        </div>
      </div>` : '';

    body.innerHTML = `
      ${lockBanner}

      <div style="margin-bottom:12px">${badgeHtml(pr.status)}</div>

      ${pr.title ? `<h3 style="font-size:16px;margin-bottom:8px">${escHtml(pr.title)}</h3>` : ''}

      <a href="${escHtml(pr.url)}" target="_blank" rel="noopener"
         style="display:block;font-size:13px;color:#b91c1c;word-break:break-all;margin-bottom:4px">
        <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px"></i> ${escHtml(pr.url)}
      </a>

      ${urlEditHtml}

      ${pr.description ? `<p style="font-size:13px;color:#475569;margin:12px 0">${escHtml(pr.description)}</p>` : ''}

      <div class="pr-detail-meta" style="margin-top:12px">
        <div class="meta-item"><label>Criado por:</label>${escHtml(pr.creator_name)}</div>
        <div class="meta-item"><label>Criado em:</label>${fmtDate(pr.created_at)}</div>
        <div class="meta-item"><label>Atualizado:</label>${fmtDate(pr.updated_at)}</div>
        ${pr.conferindo_por ? `<div class="meta-item"><label>${pr.status === 'Conferindo' ? 'Em conferência por:' : 'Conferente:'}</label>${escHtml(pr.conferindo_por_name)}</div>` : ''}
      </div>

      <div class="pr-actions">
        <h4><i class="fa-solid fa-bolt"></i> Ações disponíveis</h4>
        ${actionsHtml}
      </div>

      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:12px">
        <i class="fa-solid fa-timeline"></i> Histórico de atividades
      </h4>

      <div class="timeline">
        ${renderTimeline(pr.logs)}
      </div>`;
  } catch (err) {
    body.innerHTML = `<p style="color:#dc2626">${err.message}</p>`;
  }
}

// ── Timeline (usa activity_logs) ──────────────
function renderTimeline(logs) {
  if (!logs || logs.length === 0) {
    return '<p style="font-size:12px;color:#94a3b8">Sem histórico disponível.</p>';
  }

  return logs.map(l => {
    const isStatus = l.action_type === 'STATUS' || l.action_type === 'CRIACAO';
    const isUrl    = l.action_type === 'URL';
    const icon     = isUrl ? 'fa-link' : (STATUS_ICON[l.new_value] || 'fa-arrow-right');

    // Linha visual de mudança de status
    let changeLine = '';
    if (isStatus && l.old_value) {
      changeLine = `<div style="margin-top:5px">${badgeHtml(l.old_value)} <i class="fa-solid fa-arrow-right" style="font-size:10px;color:#94a3b8;margin:0 4px"></i> ${badgeHtml(l.new_value)}</div>`;
    } else if (isStatus && !l.old_value) {
      changeLine = `<div style="margin-top:5px">${badgeHtml(l.new_value)}</div>`;
    } else if (isUrl) {
      changeLine = `
        <div style="margin-top:5px;font-size:11px;color:#94a3b8">
          <span style="text-decoration:line-through">${escHtml(l.old_value)}</span><br>
          <span style="color:#b91c1c">${escHtml(l.new_value)}</span>
        </div>`;
    }

    return `
      <div class="timeline__item">
        <div class="timeline__item-dot">
          <i class="fa-solid ${icon}"></i>
        </div>
        <p>${escHtml(l.message)}</p>
        ${changeLine}
        <time>${fmtDate(l.created_at)}</time>
        ${l.comment ? `<div class="timeline__item-comment">"${escHtml(l.comment)}"</div>` : ''}
      </div>`;
  }).join('');
}

// ── Modal de alteração de status ──────────────
function openActionModal(prId, status, needsComment, label) {
  currentPR     = allPRs.find(p => p.id === prId) || currentPR;
  pendingAction = { status, needsComment };

  document.getElementById('statusModalTitle').textContent   = label;
  document.getElementById('statusModalNewStatus').innerHTML = badgeHtml(status);
  document.getElementById('statusComment').value            = '';

  const commentGroup = document.getElementById('commentGroup');
  commentGroup.style.display = needsComment ? 'block' : 'none';

  const commentLabel = document.getElementById('commentLabel');
  if (commentLabel) {
    commentLabel.textContent = ['Comentado', 'Comentado Novamente'].includes(status)
      ? 'Comentário (obrigatório)'
      : 'Comentário (opcional)';
  }

  openModal('modalStatus');
}

// ── Edição de URL ─────────────────────────────
function toggleUrlEdit() {
  const form = document.getElementById('urlEditForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveUrl(prId) {
  const input  = document.getElementById('urlEditInput');
  const newUrl = input?.value.trim();

  if (!newUrl) { toast('Informe uma URL válida', 'warning'); return; }

  try {
    await api.patch(`/prs/${prId}/url`, { url: newUrl });
    toast('URL atualizada com sucesso!', 'success');
    closeModal('modalDetail');
    await loadPRs();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Escape helpers ────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'");
}
