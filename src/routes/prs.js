const express = require('express');
const { getConnection, sql } = require('../config/database');
const auth = require('../middleware/auth');
const { broadcast } = require('./events');

const router = express.Router();

const STATUS = {
  PENDENTE:            'Pendente de Conferência',
  CONFERINDO:          'Conferindo',
  COMENTADO:           'Comentado',
  APROVADO:            'Aprovado',
  CORRIGIDO:           'Corrigido',
  COMENTADO_NOVAMENTE: 'Comentado Novamente',
};

// ──────────────────────────────────────────────
// Regras de transição de status
// pr = objeto completo com created_by, conferindo_por, status_antes_conferindo
// ──────────────────────────────────────────────
function podeAlterarStatus(pr, currentUserId, novoStatus) {
  const isCreator         = pr.created_by === currentUserId;
  const isOtherUser       = !isCreator;
  const isCurrentReviewer = pr.conferindo_por === currentUserId;

  switch (pr.status) {
    case STATUS.PENDENTE:
      // Somente outro usuário pode iniciar a conferência
      return isOtherUser && novoStatus === STATUS.CONFERINDO;

    case STATUS.CONFERINDO:
      // Somente quem está conferindo pode agir
      if (!isCurrentReviewer) return false;
      if (pr.status_antes_conferindo === STATUS.CORRIGIDO) {
        return [STATUS.PENDENTE, STATUS.COMENTADO_NOVAMENTE, STATUS.APROVADO].includes(novoStatus);
      }
      // Veio de PENDENTE ou COMENTADO_NOVAMENTE
      return [STATUS.PENDENTE, STATUS.COMENTADO, STATUS.APROVADO].includes(novoStatus);

    case STATUS.COMENTADO:
      // Criador corrige; outro usuário não age (precisa de Conferindo)
      return isCreator && novoStatus === STATUS.CORRIGIDO;

    case STATUS.CORRIGIDO:
      // Se há conferente bloqueado, somente ele pode retomar a conferência
      if (pr.conferindo_por) {
        return pr.conferindo_por === currentUserId && novoStatus === STATUS.CONFERINDO;
      }
      // Sem conferente definido: qualquer outro usuário pode iniciar
      return isOtherUser && novoStatus === STATUS.CONFERINDO;

    case STATUS.COMENTADO_NOVAMENTE:
      // Criador corrige novamente
      return isCreator && novoStatus === STATUS.CORRIGIDO;

    case STATUS.APROVADO:
      return false;

    default:
      return false;
  }
}

// ── Auxiliar: inserir log de atividade ──────
async function insertLog(conn, { prId, userId, userName, actionType, oldValue, newValue, comment, prIdLabel }) {
  let message = '';

  if (actionType === 'CRIACAO') {
    message = `Usuário ${userName} cadastrou o registro ${prIdLabel} com status '${newValue}'`;
  } else if (actionType === 'STATUS') {
    message = `Usuário ${userName} alterou o status do registro ${prIdLabel} de '${oldValue}' para '${newValue}'`;
  } else if (actionType === 'URL') {
    message = `Usuário ${userName} alterou a URL do registro ${prIdLabel} de '${oldValue}' para '${newValue}'`;
  }

  await conn.request()
    .input('prId',    sql.Int,              prId)
    .input('userId',  sql.Int,              userId)
    .input('type',    sql.NVarChar(20),     actionType)
    .input('oldVal',  sql.NVarChar(2048),   oldValue  || null)
    .input('newVal',  sql.NVarChar(2048),   newValue  || null)
    .input('comment', sql.NVarChar(sql.MAX),comment   || null)
    .input('msg',     sql.NVarChar(sql.MAX),message)
    .query(`
      INSERT INTO activity_logs (pr_id, user_id, action_type, old_value, new_value, comment, message)
      VALUES (@prId, @userId, @type, @oldVal, @newVal, @comment, @msg)
    `);
}

// ─────────────────────────────────────────────
// GET /api/prs — listar todos
// ─────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const conn = await getConnection();
    const result = await conn.request().query(`
      SELECT
        pr.id, pr.url, pr.title, pr.description, pr.status,
        pr.created_by, pr.created_at, pr.updated_at,
        pr.conferindo_por, pr.status_antes_conferindo,
        u.name  AS creator_name,
        u.email AS creator_email,
        u2.name AS conferindo_por_name
      FROM pull_requests pr
      JOIN users u  ON u.id  = pr.created_by
      LEFT JOIN users u2 ON u2.id = pr.conferindo_por
      ORDER BY pr.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─────────────────────────────────────────────
// GET /api/prs/:id — detalhe com logs
// ─────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const conn = await getConnection();

    const prRes = await conn.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT
          pr.id, pr.url, pr.title, pr.description, pr.status,
          pr.created_by, pr.created_at, pr.updated_at,
          pr.conferindo_por, pr.status_antes_conferindo,
          u.name  AS creator_name,
          u.email AS creator_email,
          u2.name AS conferindo_por_name
        FROM pull_requests pr
        JOIN users u  ON u.id  = pr.created_by
        LEFT JOIN users u2 ON u2.id = pr.conferindo_por
        WHERE pr.id = @id
      `);

    if (prRes.recordset.length === 0) {
      return res.status(404).json({ error: 'PR não encontrado' });
    }

    const logsRes = await conn.request()
      .input('prId', sql.Int, req.params.id)
      .query(`
        SELECT
          l.id, l.action_type, l.old_value, l.new_value,
          l.comment, l.message, l.created_at,
          u.name AS user_name
        FROM activity_logs l
        JOIN users u ON u.id = l.user_id
        WHERE l.pr_id = @prId
        ORDER BY l.created_at ASC
      `);

    const pr  = prRes.recordset[0];
    pr.logs   = logsRes.recordset;
    res.json(pr);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─────────────────────────────────────────────
// POST /api/prs — criar novo PR
// ─────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { url, title, description } = req.body;

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL do PR é obrigatória' });
  }

  try {
    const conn = await getConnection();

    const result = await conn.request()
      .input('url',         sql.NVarChar(2048),    url.trim())
      .input('title',       sql.NVarChar(255),      title?.trim()       || null)
      .input('description', sql.NVarChar(sql.MAX),  description?.trim() || null)
      .input('createdBy',   sql.Int,                req.user.id)
      .query(`
        INSERT INTO pull_requests (url, title, description, status, created_by)
        OUTPUT INSERTED.*
        VALUES (@url, @title, @description, N'Pendente de Conferência', @createdBy)
      `);

    const pr = result.recordset[0];

    // Mantém pr_status_history para compatibilidade
    await conn.request()
      .input('prId',      sql.Int,          pr.id)
      .input('newStatus', sql.NVarChar(50), STATUS.PENDENTE)
      .input('changedBy', sql.Int,          req.user.id)
      .query(`
        INSERT INTO pr_status_history (pr_id, old_status, new_status, changed_by)
        VALUES (@prId, NULL, @newStatus, @changedBy)
      `);

    await insertLog(conn, {
      prId:      pr.id,
      userId:    req.user.id,
      userName:  req.user.name,
      actionType:'CRIACAO',
      newValue:  STATUS.PENDENTE,
      prIdLabel: pr.id,
    });

    broadcast('pr_criado', {
      id:          pr.id,
      status:      STATUS.PENDENTE,
      changedBy:   req.user.name,
      changedById: req.user.id,
    });

    res.status(201).json(pr);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/prs/:id/status — alterar status
// ─────────────────────────────────────────────
router.patch('/:id/status', auth, async (req, res) => {
  const { status, comment } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Novo status é obrigatório' });
  }
  if (!Object.values(STATUS).includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  try {
    const conn = await getConnection();

    const prRes = await conn.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT id, created_by, status, conferindo_por, status_antes_conferindo
        FROM pull_requests WHERE id = @id
      `);

    if (prRes.recordset.length === 0) {
      return res.status(404).json({ error: 'PR não encontrado' });
    }

    const pr = prRes.recordset[0];

    if (!podeAlterarStatus(pr, req.user.id, status)) {
      return res.status(403).json({ error: 'Você não tem permissão para realizar esta alteração de status' });
    }

    const oldStatus = pr.status;

    // Atualiza pull_requests com lógica de Conferindo
    if (status === STATUS.CONFERINDO) {
      // Toma posse da conferência
      await conn.request()
        .input('id',          sql.Int,          pr.id)
        .input('status',      sql.NVarChar(50), STATUS.CONFERINDO)
        .input('confPor',     sql.Int,          req.user.id)
        .input('statusAntes', sql.NVarChar(50), pr.status)
        .query(`
          UPDATE pull_requests
          SET status = @status,
              conferindo_por = @confPor,
              status_antes_conferindo = @statusAntes,
              updated_at = GETDATE()
          WHERE id = @id
        `);
    } else if (status === STATUS.PENDENTE) {
      // Liberar PR: limpa o conferente — qualquer usuário pode assumir
      await conn.request()
        .input('id',     sql.Int,          pr.id)
        .input('status', sql.NVarChar(50), STATUS.PENDENTE)
        .query(`
          UPDATE pull_requests
          SET status = @status,
              conferindo_por = NULL,
              status_antes_conferindo = NULL,
              updated_at = GETDATE()
          WHERE id = @id
        `);
    } else {
      // Comentado, Comentado Novamente, Aprovado, Corrigido:
      // mantém conferindo_por — o conferente fica bloqueado ao PR
      await conn.request()
        .input('id',     sql.Int,          pr.id)
        .input('status', sql.NVarChar(50), status)
        .query(`
          UPDATE pull_requests
          SET status = @status,
              status_antes_conferindo = NULL,
              updated_at = GETDATE()
          WHERE id = @id
        `);
    }

    // pr_status_history
    await conn.request()
      .input('prId',      sql.Int,             pr.id)
      .input('oldStatus', sql.NVarChar(50),    oldStatus)
      .input('newStatus', sql.NVarChar(50),    status)
      .input('changedBy', sql.Int,             req.user.id)
      .input('comment',   sql.NVarChar(sql.MAX), comment?.trim() || null)
      .query(`
        INSERT INTO pr_status_history (pr_id, old_status, new_status, changed_by, comment)
        VALUES (@prId, @oldStatus, @newStatus, @changedBy, @comment)
      `);

    // activity_logs
    await insertLog(conn, {
      prId:      pr.id,
      userId:    req.user.id,
      userName:  req.user.name,
      actionType:'STATUS',
      oldValue:  oldStatus,
      newValue:  status,
      comment:   comment?.trim() || null,
      prIdLabel: pr.id,
    });

    broadcast('pr_atualizado', {
      id:          pr.id,
      status,
      oldStatus,
      changedBy:   req.user.name,
      changedById: req.user.id,
    });

    res.json({ message: 'Status atualizado com sucesso', status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/prs/:id/url — editar URL (só criador)
// ─────────────────────────────────────────────
router.patch('/:id/url', auth, async (req, res) => {
  const { url } = req.body;

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL é obrigatória' });
  }

  try {
    const conn = await getConnection();

    const prRes = await conn.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT id, created_by, url FROM pull_requests WHERE id = @id');

    if (prRes.recordset.length === 0) {
      return res.status(404).json({ error: 'PR não encontrado' });
    }

    const pr = prRes.recordset[0];

    if (pr.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Somente o criador do PR pode editar a URL' });
    }

    const oldUrl = pr.url;
    const newUrl = url.trim();

    if (oldUrl === newUrl) {
      return res.status(400).json({ error: 'A nova URL é igual à atual' });
    }

    await conn.request()
      .input('id',  sql.Int,            pr.id)
      .input('url', sql.NVarChar(2048), newUrl)
      .query('UPDATE pull_requests SET url = @url, updated_at = GETDATE() WHERE id = @id');

    await insertLog(conn, {
      prId:      pr.id,
      userId:    req.user.id,
      userName:  req.user.name,
      actionType:'URL',
      oldValue:  oldUrl,
      newValue:  newUrl,
      prIdLabel: pr.id,
    });

    broadcast('pr_atualizado', {
      id:          pr.id,
      urlAlterada: true,
      changedBy:   req.user.name,
      changedById: req.user.id,
    });

    res.json({ message: 'URL atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
