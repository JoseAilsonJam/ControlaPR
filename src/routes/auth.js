const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../config/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'controla-pr-secret';

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
  }

  try {
    const conn = await getConnection();

    const exists = await conn.request()
      .input('email', sql.NVarChar(255), email.toLowerCase())
      .query('SELECT id FROM users WHERE email = @email');

    if (exists.recordset.length > 0) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await conn.request()
      .input('name',  sql.NVarChar(100), name.trim())
      .input('email', sql.NVarChar(255), email.toLowerCase())
      .input('hash',  sql.NVarChar(255), hash)
      .query(`
        INSERT INTO users (name, email, password_hash)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.email
        VALUES (@name, @email, @hash)
      `);

    const user = result.recordset[0];
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  try {
    const conn = await getConnection();

    const result = await conn.request()
      .input('email', sql.NVarChar(255), email.toLowerCase())
      .query('SELECT id, name, email, password_hash FROM users WHERE email = @email');

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.recordset[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/me', require('../middleware/auth'), (req, res) => {
  res.json(req.user);
});

router.patch('/profile', require('../middleware/auth'), async (req, res) => {
  const { name, email, currentPassword, newPassword } = req.body;

  if (!name?.trim() && !email?.trim() && !newPassword) {
    return res.status(400).json({ error: 'Nenhum dado para atualizar' });
  }

  try {
    const conn = await getConnection();

    const userRes = await conn.request()
      .input('id', sql.Int, req.user.id)
      .query('SELECT id, name, email, password_hash FROM users WHERE id = @id');

    if (userRes.recordset.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userRes.recordset[0];

    const newName  = name?.trim()           || user.name;
    const newEmail = email?.trim().toLowerCase() || user.email;

    if (newEmail !== user.email) {
      const taken = await conn.request()
        .input('email', sql.NVarChar(255), newEmail)
        .input('id',    sql.Int,           req.user.id)
        .query('SELECT id FROM users WHERE email = @email AND id <> @id');
      if (taken.recordset.length > 0) {
        return res.status(400).json({ error: 'E-mail já está em uso por outro usuário' });
      }
    }

    let hash = user.password_hash;
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres' });
      }
      if (!currentPassword) {
        return res.status(400).json({ error: 'Informe a senha atual para alterar a senha' });
      }
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }
      hash = await bcrypt.hash(newPassword, 10);
    }

    await conn.request()
      .input('id',    sql.Int,           req.user.id)
      .input('name',  sql.NVarChar(100), newName)
      .input('email', sql.NVarChar(255), newEmail)
      .input('hash',  sql.NVarChar(255), hash)
      .query('UPDATE users SET name = @name, email = @email, password_hash = @hash WHERE id = @id');

    const token = jwt.sign(
      { id: req.user.id, name: newName, email: newEmail },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ message: 'Perfil atualizado com sucesso', token, user: { id: req.user.id, name: newName, email: newEmail } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
