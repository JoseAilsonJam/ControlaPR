# ControlaPR

Sistema web para controle de andamento de Pull Requests entre membros de uma equipe, sem integração direta com GitHub/GitLab/Bitbucket.

---

## Sumário

- [Visão geral](#visão-geral)
- [Regras de negócio](#regras-de-negócio)
- [Requisitos](#requisitos)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Banco de dados](#banco-de-dados)
- [Executando o projeto](#executando-o-projeto)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Rotas da API](#rotas-da-api)

---

## Visão geral

O ControlaPR permite que equipes de desenvolvimento acompanhem o ciclo de revisão dos seus Pull Requests de forma centralizada. Cada PR percorre um fluxo de status controlado por regras que garantem que revisões sejam feitas por pessoas diferentes de quem criou o PR.

---

## Regras de negócio

### Usuários

- Qualquer pessoa pode se cadastrar com nome, e-mail e senha.
- O e-mail é único no sistema.
- Após o login, o sistema emite um token JWT válido por **24 horas**.

### Cadastro de Pull Requests

- Somente usuários autenticados podem cadastrar um PR.
- Campos obrigatórios: **URL do PR**.
- Campos opcionais: título e descrição.
- Ao ser cadastrado, o PR recebe automaticamente o status **"Pendente de Conferência"**.

### Fluxo de status

O fluxo de status é restrito por regras de autoridade — **o criador do PR não pode aprovar o próprio PR** e toda revisão obrigatoriamente passa pelo status **"Conferindo"**, que reserva o PR para um único revisor por vez.

```
[Criador cadastra]
        │
        ▼
Pendente de Conferência
        │
        └── [Outro usuário] ──► Conferindo  (PR reservado para o revisor)
                                    │
                                    ├── [Revisor] ──► Pendente de Conferência  (libera para outro revisor)
                                    │
                                    ├── [Revisor] ──► Comentado  (veio de Pendente)
                                    │                     │
                                    │                     └── [Criador] ──► Corrigido
                                    │                                           │
                                    │                                           └── [Outro usuário] ──► Conferindo
                                    │                                                                       │
                                    │                                                                       ├── [Revisor] ──► Comentado Novamente
                                    │                                                                       │                     │
                                    │                                                                       │                     └── [Criador] ──► Corrigido
                                    │                                                                       │                                   (ciclo se repete)
                                    │                                                                       └── [Revisor] ──► Aprovado ✓
                                    │
                                    └── [Revisor] ──► Aprovado ✓
```

**Tabela resumida:**

| Status atual             | Quem pode agir           | Novo status possível                          |
|--------------------------|--------------------------|-----------------------------------------------|
| Pendente de Conferência  | Outro usuário            | **Conferindo**                                |
| Conferindo *(de Pendente)* | Revisor (quem iniciou) | Pendente de Conferência, Comentado, Aprovado  |
| Conferindo *(de Corrigido)* | Revisor (quem iniciou) | Pendente de Conferência, Comentado Novamente, Aprovado |
| Comentado                | Criador do PR            | Corrigido                                     |
| Corrigido                | Outro usuário            | **Conferindo**                                |
| Comentado Novamente      | Criador do PR            | Corrigido                                     |
| Aprovado                 | —                        | *(estado final, sem alterações)*              |

> **Regra de reserva:** ao mover um PR para "Conferindo", apenas o usuário que fez essa ação pode agir sobre ele. Os demais verão a mensagem "Em conferência por [nome]".

> **Regra central:** o mesmo usuário que criou o PR **nunca** pode aprová-lo nem iniciá-lo em conferência. Somente outro usuário pode fazer isso.

> **Liberação:** o revisor pode devolver o PR para "Pendente de Conferência" a qualquer momento, tornando-o disponível para qualquer outro usuário (exceto o criador).

### Edição de URL

- Somente o **criador** do PR pode editar a URL, caso tenha cadastrado incorretamente.
- A alteração é registrada no log de atividades.

### Comentários

- Ao marcar um PR como **"Comentado"** ou **"Comentado Novamente"**, o preenchimento do comentário é **obrigatório**.
- Para as demais transições o comentário é opcional.
- Todo comentário fica registrado no histórico do PR.

### Log de atividades

Toda ação no sistema gera um registro legível em `activity_logs`, exibido na timeline do PR, por exemplo:

- `Usuário José alterou o status do registro 10 de 'Conferindo' para 'Aprovado'`
- `Usuário César alterou a URL do registro 5 de 'https://antigo.com/pr/1' para 'https://correto.com/pr/2'`
- `Usuário Ana cadastrou o registro 3 com status 'Pendente de Conferência'`

### Dashboard e alertas

- O dashboard exibe a **contagem de PRs por status**.
- Ao acessar o sistema, se houver algum PR com status **"Pendente de Conferência" há mais de 7 dias**, um alerta é exibido na tela com a lista dos PRs afetados.
- A seção de **atividade recente** exibe as últimas 10 alterações de status feitas por qualquer usuário.

---

## Requisitos

| Requisito         | Versão mínima |
|-------------------|---------------|
| Node.js           | 18.x          |
| npm               | 9.x           |
| SQL Server        | 2017 ou superior |

---

## Configuração do ambiente

Copie o arquivo de exemplo e preencha com as suas credenciais:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
# Conexão com o banco SQL Server
DB_SERVER=localhost          # Endereço do servidor SQL Server
DB_NAME=ControlaPR           # Nome do banco de dados (será criado pelo migrate)
DB_USER=sa                   # Usuário do SQL Server
DB_PASSWORD=SuaSenhaAqui     # Senha do usuário
DB_PORT=1433                 # Porta padrão do SQL Server
DB_ENCRYPT=false             # true para conexões Azure / com SSL
DB_TRUST_CERT=true           # false em produção com certificado válido

# Segurança
JWT_SECRET=troque-por-uma-string-longa-e-aleatoria

# Servidor
PORT=3000
```

> **Atenção:** em ambiente de produção, troque o `JWT_SECRET` por uma string longa e aleatória e nunca commite o arquivo `.env`.

---

## Banco de dados

### Criar o banco manualmente

Antes de rodar as migrações, crie o banco de dados no SQL Server:

```sql
CREATE DATABASE ControlaPR;
```

Ou via SQL Server Management Studio (SSMS): clique com o botão direito em *Databases* → *New Database* → nome `ControlaPR`.

### Executar as migrações

```bash
npm run migrate
```

As migrações criam as seguintes tabelas:

| Tabela               | Descrição                                              |
|----------------------|--------------------------------------------------------|
| `migrations`         | Controle interno das migrações já executadas           |
| `users`              | Usuários cadastrados                                   |
| `pull_requests`      | PRs com URL, título, descrição e status atual          |
| `pr_status_history`  | Histórico completo de cada alteração de status         |

As migrações são **idempotentes** — podem ser executadas múltiplas vezes sem duplicar tabelas.

---

## Executando o projeto

### Desenvolvimento (com auto-reload)

```bash
npm run dev
```

### Produção

```bash
npm start
```

O servidor compila o SCSS automaticamente ao iniciar. Acesse em:

```
http://localhost:3000
```

---

## Estrutura de arquivos

```
ControlaPR/
├── .env                          # Variáveis de ambiente (não commitar)
├── .env.example                  # Exemplo de configuração
├── package.json
│
├── src/
│   ├── server.js                 # Ponto de entrada, configura Express e compila SCSS
│   ├── migrate.js                # Runner de migrações SQL
│   │
│   ├── config/
│   │   └── database.js           # Pool de conexão com SQL Server
│   │
│   ├── middleware/
│   │   └── auth.js               # Validação do token JWT
│   │
│   ├── migrations/
│   │   └── 001_create_tables.sql # Criação das tabelas iniciais
│   │
│   └── routes/
│       ├── auth.js               # POST /api/auth/login e /register
│       ├── prs.js                # CRUD de PRs e alteração de status
│       └── dashboard.js          # Estatísticas e alertas
│
└── public/
    ├── html/
    │   ├── login.html            # Página de login e cadastro
    │   ├── dashboard.html        # Dashboard com estatísticas
    │   └── prs.html              # Listagem e gestão de PRs
    │
    ├── scss/
    │   ├── main.scss             # Importa os parciais
    │   ├── _variables.scss       # Cores, espaçamentos, tipografia
    │   ├── _base.scss            # Reset e estilos globais
    │   └── _components.scss      # Todos os componentes de UI
    │
    ├── css/
    │   └── main.css              # Gerado automaticamente pelo servidor
    │
    └── js/
        ├── api.js                # Helpers de fetch, autenticação, toast, badges
        ├── auth.js               # Lógica da página de login/cadastro
        ├── dashboard.js          # Lógica do dashboard
        └── prs.js                # Lógica da listagem e modais de PRs
```

---

## Rotas da API

Todas as rotas abaixo (exceto `/api/auth/*`) exigem o header:

```
Authorization: Bearer <token>
```

### Autenticação

| Método | Rota                  | Descrição                  |
|--------|-----------------------|----------------------------|
| POST   | `/api/auth/register`  | Cadastrar novo usuário     |
| POST   | `/api/auth/login`     | Autenticar e obter token   |
| GET    | `/api/auth/me`        | Retorna dados do usuário   |

### Pull Requests

| Método | Rota                      | Descrição                                         |
|--------|---------------------------|---------------------------------------------------|
| GET    | `/api/prs`                | Listar todos os PRs                               |
| GET    | `/api/prs/:id`            | Detalhe do PR com logs de atividade               |
| POST   | `/api/prs`                | Cadastrar novo PR                                 |
| PATCH  | `/api/prs/:id/status`     | Alterar status (valida todas as regras)           |
| PATCH  | `/api/prs/:id/url`        | Editar URL (somente o criador do PR)              |

**Body para criar PR:**
```json
{
  "url": "https://github.com/org/repo/pull/42",
  "title": "feat: adiciona login OAuth",
  "description": "Implementa autenticação via Google"
}
```

**Body para alterar status:**
```json
{
  "status": "Comentado",
  "comment": "Ajustar o tratamento de erros na linha 47"
}
```

### Dashboard

| Método | Rota             | Descrição                                         |
|--------|------------------|---------------------------------------------------|
| GET    | `/api/dashboard` | Contagens por status, alertas e atividade recente |
