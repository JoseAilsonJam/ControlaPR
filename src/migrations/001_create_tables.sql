-- Migration 001: Criação das tabelas iniciais

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
  CREATE TABLE users (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(100)  NOT NULL,
    email       NVARCHAR(255)  NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    created_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at  DATETIME2      NOT NULL DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pull_requests')
BEGIN
  CREATE TABLE pull_requests (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    url         NVARCHAR(2048) NOT NULL,
    title       NVARCHAR(255)  NULL,
    description NVARCHAR(MAX)  NULL,
    status      NVARCHAR(50)   NOT NULL DEFAULT 'Pendente de Conferência',
    created_by  INT            NOT NULL,
    created_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_pr_creator FOREIGN KEY (created_by) REFERENCES users(id)
  );
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'pr_status_history')
BEGIN
  CREATE TABLE pr_status_history (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    pr_id       INT            NOT NULL,
    old_status  NVARCHAR(50)   NULL,
    new_status  NVARCHAR(50)   NOT NULL,
    changed_by  INT            NOT NULL,
    comment     NVARCHAR(MAX)  NULL,
    changed_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_history_pr   FOREIGN KEY (pr_id)      REFERENCES pull_requests(id),
    CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users(id)
  );
END;
