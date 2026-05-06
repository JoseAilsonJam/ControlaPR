const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sass = require('sass');
require('dotenv').config();

const authRoutes         = require('./routes/auth');
const prsRoutes          = require('./routes/prs');
const dashboardRoutes    = require('./routes/dashboard');
const { router: eventsRouter } = require('./routes/events');

const app  = express();
const PORT = process.env.PORT || 3000;

// Compila SCSS → CSS ao iniciar o servidor
function compilarSCSS() {
  try {
    const entrada = path.join(__dirname, '../public/scss/main.scss');
    const saida   = path.join(__dirname, '../public/css/main.css');
    const cssDir  = path.dirname(saida);

    if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });

    const resultado = sass.compile(entrada, { style: 'compressed' });
    fs.writeFileSync(saida, resultado.css);
    console.log('SCSS compilado com sucesso.');
  } catch (err) {
    console.error('Erro ao compilar SCSS:', err.message);
  }
}

compilarSCSS();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rotas da API
app.use('/api/auth',      authRoutes);
app.use('/api/prs',       prsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/events',    eventsRouter);

// Páginas HTML
app.get('/',          (_, res) => res.sendFile(path.join(__dirname, '../public/html/login.html')));
app.get('/dashboard', (_, res) => res.sendFile(path.join(__dirname, '../public/html/dashboard.html')));
app.get('/prs',       (_, res) => res.sendFile(path.join(__dirname, '../public/html/prs.html')));

app.listen(PORT, () => {
  console.log(`\nControlaPR rodando em http://localhost:${PORT}\n`);
});
