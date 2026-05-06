const express = require('express');
const { getConnection } = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const conn = await getConnection();

    // Contagem por status
    const countsRes = await conn.request().query(`
      SELECT status, COUNT(*) AS total
      FROM pull_requests
      GROUP BY status
    `);

    // PRs pendentes há mais de 7 dias
    const alertsRes = await conn.request().query(`
      SELECT
        pr.id, pr.url, pr.title, pr.created_at,
        u.name AS creator_name,
        DATEDIFF(day, pr.created_at, GETDATE()) AS dias_pendente
      FROM pull_requests pr
      JOIN users u ON u.id = pr.created_by
      WHERE pr.status = N'Pendente de Conferência'
        AND pr.created_at < DATEADD(day, -7, GETDATE())
      ORDER BY pr.created_at ASC
    `);

    // Atividade recente (últimas 10 alterações)
    const activityRes = await conn.request().query(`
      SELECT TOP 10
        h.new_status, h.old_status, h.changed_at, h.comment,
        pr.id   AS pr_id,
        pr.url  AS pr_url,
        pr.title AS pr_title,
        u.name  AS changed_by_name
      FROM pr_status_history h
      JOIN pull_requests pr ON pr.id = h.pr_id
      JOIN users u          ON u.id  = h.changed_by
      WHERE h.old_status IS NOT NULL
      ORDER BY h.changed_at DESC
    `);

    const counts = {};
    countsRes.recordset.forEach(r => { counts[r.status] = r.total; });

    res.json({
      counts,
      alerts:         alertsRes.recordset,
      recentActivity: activityRes.recordset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
