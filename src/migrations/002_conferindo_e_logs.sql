-- Migration 002: Status "Conferindo" e tabela de logs de atividade

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('pull_requests') AND name = 'conferindo_por')
BEGIN
  ALTER TABLE pull_requests ADD conferindo_por INT NULL;
  ALTER TABLE pull_requests ADD CONSTRAINT fk_pr_conferindo
    FOREIGN KEY (conferindo_por) REFERENCES users(id);
END;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('pull_requests') AND name = 'status_antes_conferindo')
BEGIN
  ALTER TABLE pull_requests ADD status_antes_conferindo NVARCHAR(50) NULL;
END;

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'activity_logs')
BEGIN
  CREATE TABLE activity_logs (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    pr_id       INT            NOT NULL,
    user_id     INT            NOT NULL,
    action_type NVARCHAR(20)   NOT NULL, -- 'CRIACAO' | 'STATUS' | 'URL'
    old_value   NVARCHAR(2048) NULL,     -- status ou URL anterior
    new_value   NVARCHAR(2048) NULL,     -- status ou URL novo
    comment     NVARCHAR(MAX)  NULL,     -- comentário opcional nas mudanças de status
    message     NVARCHAR(MAX)  NOT NULL, -- mensagem legível do log
    created_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_log_pr   FOREIGN KEY (pr_id)   REFERENCES pull_requests(id),
    CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id)
  );
END;
