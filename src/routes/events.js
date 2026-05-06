const express = require('express');
const jwt     = require('jsonwebtoken');

const router  = express.Router();
const clients = new Map();
let   nextId  = 1;

// ── Envia evento para todos os clientes conectados ──
function broadcast(eventName, data) {
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(id);
    }
  }
}

// GET /api/events — SSE (auth via query param pois EventSource não suporta headers)
router.get('/', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'controla-pr-secret');
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type',       'text/event-stream');
  res.setHeader('Cache-Control',      'no-cache');
  res.setHeader('Connection',         'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // desativa buffer do nginx

  res.flushHeaders();

  const id = nextId++;
  clients.set(id, res);

  // Confirma conexão ao cliente
  res.write('event: conectado\ndata: {}\n\n');

  // Heartbeat a cada 25s para manter a conexão viva em proxies/firewalls
  const hb = setInterval(() => {
    try   { res.write(':ping\n\n'); }
    catch { clearInterval(hb); clients.delete(id); }
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    clients.delete(id);
  });
});

module.exports = { router, broadcast };
