const fs = require('fs');
const path = require('path');
const { getConnection, sql } = require('./config/database');
require('dotenv').config();

async function runMigrations() {
  console.log('Conectando ao banco de dados...');
  const conn = await getConnection();

  await conn.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'migrations')
    BEGIN
      CREATE TABLE migrations (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        name        VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME2   NOT NULL DEFAULT GETDATE()
      );
    END
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const check = await conn.request()
      .input('name', sql.VarChar(255), file)
      .query('SELECT id FROM migrations WHERE name = @name');

    if (check.recordset.length > 0) {
      console.log(`  [pular] ${file}`);
      continue;
    }

    console.log(`  [executar] ${file}`);
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    const statements = content
      .split(/\bGO\b/i)
      .map(s => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await conn.request().query(stmt);
    }

    await conn.request()
      .input('name', sql.VarChar(255), file)
      .query('INSERT INTO migrations (name) VALUES (@name)');

    console.log(`  [ok] ${file}`);
  }

  console.log('\nMigrações concluídas.');
  process.exit(0);
}

runMigrations().catch(err => {
  console.error('Erro na migração:', err.message);
  process.exit(1);
});
