# Synapta

Plataforma educacional focada em **Matemática** com dois perfis de acesso (**Professor** e **Aluno**), turmas com auto-matrícula, simulados de múltipla escolha (`A`–`D`), correção determinística com resoluções comentadas (sem IA/LLM), controle transacional de tentativas e reautorizações (*retakes*), comentários manuais do professor e analytics por assunto e por aluno.

---

## Arquitetura

- **Backend (`backend/`)**: Python, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16+, Pydantic Settings, PyJWT e Argon2id (`pwdlib[argon2]`).
  - **Camadas**: `api/v1/` (contratos HTTP e validação) → `services/` (regras de negócio, RBAC/ownership, correção determinística e agregações SQL) → `models/` (ORM SQLAlchemy) → `PostgreSQL`.
  - **Concorrência**: Submissões usam transação atômica com `SELECT ... FOR UPDATE` na matrícula do aluno e na autorização de nova tentativa (`retake_authorizations`), impedindo tentativas duplicadas simultâneas.
  - **Integridade de Gabarito**: `GET /api/v1/student/lists/{list_id}` nunca expõe `correct_option` nem `explanation` antes da submissão; após submissões existirem em uma lista, alterações em gabarito, alternativas ou assunto retornam `409 Conflict`.
- **Frontend (`frontend/`)**: React, TypeScript, Vite, Tailwind CSS, Recharts e Vitest.

### Estrutura do Repositório

```text
synapta/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/0001_initial_schema.py
│   ├── app/
│   │   ├── main.py
│   │   ├── core/          # config, security, exceptions, deps
│   │   ├── db/            # base, session, seed
│   │   ├── models/        # user, topic, classroom, question_list, submission
│   │   ├── schemas/       # contratos Pydantic
│   │   ├── services/      # regras de negócio e analytics SQL
│   │   └── api/v1/        # endpoints REST (/api/v1)
│   └── tests/             # testes de integração contra PostgreSQL real
└── frontend/              # aplicação React + TypeScript
```

---

## Como Executar com Docker Compose

1. Copie o arquivo de ambiente de exemplo (opcional; o `docker-compose.yml` também possui defaults locais de desenvolvimento):

```bash
cp .env.example .env
```

2. Suba PostgreSQL 16, Backend (`:8000`) e Frontend (`:5173`):

```bash
docker compose up --build
```

> **Nota sobre a porta 5432**: Se você já tiver um PostgreSQL local rodando na porta `5432` da sua máquina, defina `POSTGRES_HOST_PORT=5433` no `.env` (ou rode `POSTGRES_HOST_PORT=5433 docker compose up --build`) ou pare o serviço local antes de subir o container.

- **Frontend**: http://localhost:5173
- **API / Swagger Docs**: http://localhost:8000/docs
- **Healthcheck**: http://localhost:8000/api/v1/health
- **PostgreSQL**: `localhost:5432` (bancos `synapta` e `synapta_test` criados automaticamente via `backend/docker/init-databases.sql`).

---

## Como Executar Localmente (Desenvolvimento)

### Pré-requisitos
- Python 3.12+
- PostgreSQL 16+ em execução com bancos `synapta` e `synapta_test`
- Node.js 20+ (para o frontend)

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Ajuste DATABASE_URL, TEST_DATABASE_URL e SECRET_KEY conforme seu ambiente local
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Aplicar migrations
alembic upgrade head

# Popular dados iniciais de Matemática (idempotente)
python -m app.db.seed

# Subir servidor FastAPI
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Executando os Testes do Backend

Os testes de integração executam contra um banco PostgreSQL real (`synapta_test` configurado em `TEST_DATABASE_URL`):

```bash
cd backend
./.venv/bin/pytest -v
```

---

## Credenciais de Seed (Ambiente Demo)

Quando `SEED_ON_START=true` ou ao executar `python -m app.db.seed`, os seguintes usuários são criados de forma idempotente:

### Professores (senha: `Professor123!`)
| Nome | E-mail | Turmas |
| --- | --- | --- |
| Ana Paula | `ana.paula@synapta.edu` | Matemática 8º Ano - Turma A; Reforço de Álgebra e Geometria |
| Carlos Mendes | `carlos.mendes@synapta.edu` | Matemática 1º Ano EM |

### Alunos (senha: `Aluno123!`)
| Nome | E-mail | Situação Inicial |
| --- | --- | --- |
| Lucas Silva | `lucas@synapta.edu` | 2 tentativas na Lista 1 (retake consumido), 1 pendente na Lista 2, 1 entrega na Lista 3 |
| Mariana Costa | `mariana@synapta.edu` | Entregas nas Listas 1, 2 e 4 (retake aprovado disponível na Lista 4) |
| Gabriel Rocha | `gabriel@synapta.edu` | Entregas nas Listas 1 e 3 (retake pendente na Lista 3) |
| Sofia Almeida | `sofia@synapta.edu` | Entregas nas Listas 1, 2 e 4 |
| Pedro Henrique | `pedro@synapta.edu` | Sem turmas (pronto para explorar e se matricular) |

---

## Principais Endpoints (`/api/v1`)

### Públicos & Autenticação
- `GET /api/v1/health` — Status da API e conectividade com PostgreSQL
- `POST /api/v1/auth/register` — Cadastro de aluno ou professor
- `POST /api/v1/auth/login` — Login e emissão de JWT Bearer
- `GET /api/v1/auth/me` — Perfil do usuário autenticado
- `GET /api/v1/topics` — Lista assuntos de Matemática (autenticado)

### Professor (`role = teacher`)
- `POST /api/v1/teacher/topics` — Criar novo assunto de Matemática
- `GET / POST /api/v1/teacher/classrooms` — Listar e criar turmas
- `PATCH / DELETE /api/v1/teacher/classrooms/{classroom_id}` — Atualizar ou remover turma
- `GET / POST /api/v1/teacher/lists` — Listar (filtro opcional `?classroom_id=`) e criar listas em rascunho
- `GET / PATCH / DELETE /api/v1/teacher/lists/{list_id}` — Detalhar, publicar/editar ou remover lista
- `POST /api/v1/teacher/lists/{list_id}/questions` — Adicionar questão (`A`–`D`)
- `PATCH / DELETE /api/v1/teacher/questions/{question_id}` — Editar ou remover questão (com proteção pós-submissão)
- `GET /api/v1/teacher/analytics/topics?classroom_id=&list_id=&scope=latest|all` — KPIs, rendimento por assunto e destaques de menor/maior desempenho
- `GET /api/v1/teacher/students?classroom_id=` — Lista de alunos matriculados com métricas resumidas
- `GET /api/v1/teacher/students/{student_id}?classroom_id=` — Desempenho individual completo do aluno
- `GET /api/v1/teacher/submissions/{submission_id}` — Detalhe completo de uma submissão
- `PATCH /api/v1/teacher/submissions/{submission_id}/comment` — Adicionar/editar/remover comentário manual
- `GET /api/v1/teacher/retake-requests?status=pending` — Fila de solicitações de nova tentativa
- `POST /api/v1/teacher/retake-requests/{request_id}/decide` — Aprovar (`approved`) ou rejeitar (`rejected`) solicitação
- `POST /api/v1/teacher/lists/{list_id}/students/{student_id}/authorize-retake` — Liberar nova tentativa proativamente

### Aluno (`role = student`)
- `GET /api/v1/student/classrooms` — Turmas em que está matriculado
- `GET /api/v1/student/classrooms/available` — Turmas disponíveis para matrícula
- `POST /api/v1/student/classrooms/{classroom_id}/enroll` — Matricular-se em uma turma
- `GET /api/v1/student/lists?classroom_id=` — Listas publicadas das turmas matriculadas
- `GET /api/v1/student/lists/{list_id}` — Questões da lista (sem gabarito/explicação) e histórico de tentativas
- `POST /api/v1/student/lists/{list_id}/submit` — Entregar respostas completas e receber correção determinística
- `GET /api/v1/student/submissions` — Histórico de entregas do aluno
- `GET /api/v1/student/submissions/{submission_id}` — Feedback detalhado, quebra por assunto e comentário do professor
- `POST /api/v1/student/lists/{list_id}/retake-request` — Solicitar autorização para refazer lista já entregue
