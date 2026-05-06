// ──────────────────────────────────────────────
// Atualizações em tempo real via Server-Sent Events
// ──────────────────────────────────────────────

let _source         = null;
let _onUpdate       = null;
let _reconnectTimer = null;
let _tentativas     = 0;

function initRealtime(onUpdate) {
  _onUpdate = onUpdate;
  _conectar();
}

function _conectar() {
  const token = getToken();
  if (!token) return;

  _setStatus('conectando');

  if (_source) { _source.close(); _source = null; }

  _source = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

  // Conexão estabelecida
  _source.addEventListener('conectado', () => {
    _tentativas = 0;
    _setStatus('online');
  });

  // PR teve status alterado
  _source.addEventListener('pr_atualizado', e => {
    _handleEvento(JSON.parse(e.data), 'atualizado');
  });

  // Novo PR cadastrado
  _source.addEventListener('pr_criado', e => {
    _handleEvento(JSON.parse(e.data), 'criado');
  });

  // Erro / conexão perdida → reconecta com back-off
  _source.onerror = () => {
    _source.close();
    _source = null;
    _setStatus('offline');

    _tentativas++;
    // Espera progressiva: 3s, 6s, 10s, 15s, máx 30s
    const delay = Math.min(3000 + (_tentativas - 1) * 3000, 30000);
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(_conectar, delay);
  };
}

function _handleEvento(data, tipo) {
  const eu = getUser();

  // Não notifica quem acabou de fazer a ação
  if (data.changedById === eu?.id) {
    if (_onUpdate) _onUpdate(data);
    return;
  }

  // Toast para os demais usuários
  let msg = '';
  if (tipo === 'criado') {
    msg = `Novo PR cadastrado por <strong>${data.changedBy}</strong>`;
  } else if (data.urlAlterada) {
    msg = `URL do PR #${data.id} alterada por <strong>${data.changedBy}</strong>`;
  } else {
    msg = `PR #${data.id} → <strong>${data.status}</strong> por <strong>${data.changedBy}</strong>`;
  }

  _toastRealtime(msg);
  if (_onUpdate) _onUpdate(data);
}

// Toast específico para eventos em tempo real (usa innerHTML)
function _toastRealtime(htmlMsg) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = 'toast toast--info';
  el.innerHTML = `
    <i class="toast__icon fa-solid fa-rotate"></i>
    <div class="toast__content">
      <strong>Atualização</strong>
      <p>${htmlMsg}</p>
    </div>`;

  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Indicador de status de conexão no cabeçalho
function _setStatus(estado) {
  const el = document.getElementById('realtimeStatus');
  if (!el) return;

  const cfg = {
    conectando: { cor: '#9ca3af', icone: 'fa-circle-notch fa-spin', label: 'Conectando...' },
    online:     { cor: '#22c55e', icone: 'fa-circle',               label: 'Ao vivo'       },
    offline:    { cor: '#f59e0b', icone: 'fa-circle-exclamation',   label: 'Reconectando...' },
  };
  const s = cfg[estado] || cfg.conectando;

  el.innerHTML = `
    <i class="fa-solid ${s.icone}" style="font-size:8px;color:${s.cor}"></i>
    <span>${s.label}</span>`;

  el.title = estado === 'online'
    ? 'Atualizações automáticas ativas'
    : estado === 'offline'
      ? 'Conexão perdida — tentando reconectar'
      : 'Estabelecendo conexão...';
}
