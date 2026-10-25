# greencode API (Atividade 2)

Evolução do **greencode** (Atividade 1, CLI com arquivos cifrados) para um **monólito servidor HTTP**: API RESTful em **Node.js + TypeScript + Fastify**, persistência em **PostgreSQL via Prisma ORM**, autenticação **JWT** e controle de acesso por papel (RBAC).

> Compatível com **Windows 10 ou superior**, **Ubuntu 24.04.03 ou superior** e derivadas do Ubuntu. Não há dependências nativas (por isso `bcryptjs`, e não `bcrypt`).

> Easter egg : dentro da pasta src, no arquivo app.ts  nas linhas finais.
## Índice

1. [O que mudou em relação à Atividade 1](#1-o-que-mudou-em-relação-à-atividade-1)
2. [Arquitetura](#2-arquitetura)
3. [Instalação e execução](#3-instalação-e-execução)
4. [Variáveis de ambiente](#4-variáveis-de-ambiente)
5. [Usuários do seed e papéis](#5-usuários-do-seed-e-papéis)
6. [Endpoints](#6-endpoints)
7. [Testando com Thunder Client](#7-testando-com-thunder-client)
8. [Regras de negócio](#8-regras-de-negócio)
9. [Transações, concorrência e versionamento otimista](#9-transações-concorrência-e-versionamento-otimista)
10. [Segurança](#10-segurança)
11. [Decisões arquiteturais e trade-offs](#11-decisões-arquiteturais-e-trade-offs)
12. [Testes automatizados](#12-testes-automatizados)
13. [Estrutura de pastas](#13-estrutura-de-pastas)
14. [Limitações conhecidas](#14-limitações-conhecidas)

---

## 1. O que mudou em relação à Atividade 1

| Aspecto | Atividade 1 (CLI) | Atividade 2 (API) |
|---|---|---|
| Interface | `readline` / linha de comando | API REST (Fastify) + documentação Swagger em `/docs` |
| Persistência | Arquivos cifrados AES‑256‑GCM | PostgreSQL + Prisma (migrações versionadas) |
| Autenticação | Sessão em arquivo, expira em 30 min de inatividade | **JWT** stateless (30 min), com renovação em `POST /auth/renovar` |
| Hash de senha | SHA‑256 + salt | **bcrypt** (custo configurável) |
| Atomicidade | `tmp` + `rename` | `prisma.$transaction` (ACID) |
| Concorrência | Processo único, *last‑write‑wins* | Bloqueio otimista (`versao`) + `SELECT … FOR UPDATE` |
| Journal | Arquivo `.log` com rotação | Tabela `journal_transacoes`, gravada **na mesma transação** e imutável (trigger) |
| Unicidade | Verificada em código | Verificada em código **e** no banco (`UNIQUE`: CNPJ, código de barras, `lote+posição`, `org+NF`) |
| Papéis | 4 papéis | Os mesmos 4 papéis, agora aplicados por rota |

**Reaproveitado da Atividade 1** (copiado para `src/domain`, sem dependência de banco/HTTP): enums, `Validador` (abstrata) → `ValidadorCNPJ` / `ValidadorDataEntrada`, regra de queda de estado físico, geração de código de barras, depreciação.

**Aprimorado ao migrar** (o PDF pede para revisar as validações):
- O ciclo de vida do equipamento virou uma **máquina de estados explícita** (antes só `EM_DESMONTE` era protegido).
- Unicidade e `CHECK`s no banco (peso > 0, ano 1970–2100, vencimento > assinatura, CNPJ com 14 dígitos…).
- Triagem do lote concluída **automaticamente** quando o último equipamento sai de triagem.
- Journal imutável por *trigger* no PostgreSQL.
- Política de senha (≥ 8 caracteres, letras e números) e proteção contra força bruta no login (rate limit).

---

## 2. Arquitetura

Monólito em camadas **Controller → Service → Repository** (conforme sugerido no enunciado):

```
Requisição HTTP
   │
   ▼
rotas/        declaram caminho, JSON Schema (validação) e papéis permitidos (hooks authenticate/authorize)
   │
   ▼
controllers/  traduzem HTTP → chamada de serviço (sem regra de negócio)
   │
   ▼
services/     TODA a regra de negócio, validações, transações e journal
   │            └─ usam domain/ (regras puras, testáveis sem banco)
   ▼
repositories/ únicos que falam com o Prisma Client (aceitam client normal ou transação via .com(tx))
   │
   ▼
PostgreSQL
```

Uma camada nunca conhece a de cima: os serviços não sabem que existe HTTP (poderiam ser reutilizados por CLI ou mensageria). A composição é feita à mão em `src/container.ts`.

Relacionamentos (conforme o PDF): `Organizacao 1—0..1 Contrato`, `Organizacao 1—N Lote`, `Lote 1—N Equipamento`, `Equipamento 1—N Movimentacao`, mais `Usuario`, `JournalTransacao` e `Parametro`.

---

## 3. Instalação e execução

### Pré-requisitos
- **Node.js 20 LTS ou superior** (`node --version`)
- **PostgreSQL 14+**. Duas opções:
  - **Docker** (mais simples; funciona igual no Windows e no Ubuntu) — usa o `docker-compose.yml` deste projeto; ou
  - PostgreSQL instalado nativamente (ajuste `DATABASE_URL` no `.env`).

### Ubuntu 24.04+ (e derivadas)

```bash
# Node.js 20 (NodeSource) e Docker
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs docker.io docker-compose-v2
sudo usermod -aG docker $USER   # faça logout/login depois

cd greencode-api
cp .env.example .env            # edite JWT_SECRET (veja seção 4)
docker compose up -d            # sobe o PostgreSQL
npm install
npm run db:init                 # 1ª vez: cria a migração "init" e aplica no banco
npm run db:constraints          # CHECKs + trigger de imutabilidade do journal
npm run db:seed                 # usuários + dados de demonstração
npm run dev                     # API em http://localhost:3000
```

### Windows 10/11 (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop     # reinicie e abra o Docker Desktop

cd greencode-api
Copy-Item .env.example .env             # edite JWT_SECRET (veja seção 4)
docker compose up -d
npm install
npm run db:init
npm run db:constraints
npm run db:seed
npm run dev
```

Abra **http://localhost:3000/docs** (Swagger UI) para ver e testar todos os endpoints.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor com *hot reload* (`tsx watch`) |
| `npm run build` / `npm start` | Compila para `dist/` e executa em produção |
| `npm run db:init` | **Primeira vez**: gera e aplica a migração inicial (`prisma migrate dev --name init`). Faça *commit* da pasta `prisma/migrations/` |
| `npm run db:migrate` | Novas migrações após alterar o `schema.prisma` |
| `npm run db:deploy` | Aplica migrações existentes (produção/CI) |
| `npm run db:constraints` | Aplica `prisma/sql/constraints.sql` (idempotente) |
| `npm run db:seed` | Popula usuários e dados de demonstração (idempotente) |
| `npm run db:setup` | Em ambiente novo com migrações já commitadas: `deploy` + `constraints` + `seed` |
| `npm run db:reset` | **Apaga tudo** e recria (migrações + constraints + seed) |
| `npm run db:studio` | Interface visual do banco (Prisma Studio) |
| `npm test` | Testes de domínio (não precisam de banco) |
| `npm run typecheck` | Checagem de tipos |

> **Por que `db:constraints` é separado?** O Prisma não declara `CHECK` nem *triggers* no `schema.prisma`. O arquivo SQL é idempotente (`DROP … IF EXISTS` + `ADD`), então pode rodar quantas vezes quiser.

### Graceful shutdown
Em `SIGINT` (Ctrl+C) e `SIGTERM` (Docker/systemd) o servidor para de aceitar conexões, espera as requisições em andamento, fecha o pool do Prisma e sai com código 0 (com *watchdog* de 15 s).

---

## 4. Variáveis de ambiente

Copie `.env.example` para `.env` (o `.env` está no `.gitignore`).

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP (configurável, como pede o enunciado) |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `DATABASE_URL` | — (obrigatória) | String de conexão PostgreSQL |
| `JWT_SECRET` | — (obrigatória, ≥ 32 chars) | Segredo de assinatura. Gere: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `30m` | Validade do token |
| `BCRYPT_ROUNDS` | `10` | Custo do bcrypt |
| `LOGIN_RATE_LIMIT_MAX` | `20` | Tentativas de login por minuto por IP |
| `CORS_ORIGIN` | `*` | Origens permitidas (separadas por vírgula). Em produção, informe o domínio do front-end |
| `LOG_LEVEL` | `info` | Nível de log |
| `ADMIN_USUARIO` / `ADMIN_SENHA` | `admin` / `Admin@12345` | Credenciais do administrador criado pelo seed |

---

## 5. Usuários do seed e papéis

> ⚠️ Senhas de **desenvolvimento**. Troque-as (`POST /auth/senha`) em qualquer ambiente real.

| Usuário | Senha | Papel |
|---|---|---|
| `admin` | `Admin@12345` | `ADMINISTRADOR` |
| `operador` | `Operador@123` | `OPERADOR_CADASTRO` |
| `almoxarife` | `Almox@12345` | `GESTOR_ALMOXARIFADO` |
| `auditor` | `Auditor@123` | `AUDITOR` |

| Papel | Pode |
|---|---|
| `ADMINISTRADOR` | Tudo (usuários, parâmetros globais e as demais operações) |
| `OPERADOR_CADASTRO` | Criar/alterar organizações e contratos |
| `GESTOR_ALMOXARIFADO` | Criar lotes, equipamentos, triagem, estado/status, movimentações |
| `AUDITOR` | Somente leitura: rastreabilidade, relatórios, journal e parâmetros |

Qualquer usuário autenticado pode **consultar** organizações, lotes e equipamentos.

---

## 6. Endpoints

Autenticação: `Authorization: Bearer <token>`. Erros seguem o formato `{ statusCode, erro, mensagem, detalhes? }`.

| Método | Rota | Papéis | Descrição |
|---|---|---|---|
| GET | `/health` | público | Healthcheck (ping no banco) |
| POST | `/auth/login` | público (rate limit) | Retorna o JWT |
| POST | `/auth/renovar` | autenticado | Novo token (+30 min) |
| GET | `/auth/me` | autenticado | Perfil |
| POST | `/auth/senha` | autenticado | Altera a própria senha |
| POST/GET | `/usuarios` | ADMIN | Cria / lista usuários |
| PATCH | `/usuarios/:id` | ADMIN | Papel e/ou ativo |
| GET/PUT | `/parametros` | GET: ADMIN, AUDITOR · PUT: ADMIN | Alíquota e coeficiente de depreciação |
| POST | `/organizacoes` | ADMIN, OPERADOR | Cria organização (CNPJ validado; contrato opcional na mesma transação) |
| GET | `/organizacoes` | autenticado | Lista (filtros `ativo`, `cnpj`, `busca`; paginado) |
| GET | `/organizacoes/:id` | autenticado | Detalhe com contrato |
| PATCH | `/organizacoes/:id` | ADMIN, OPERADOR | Atualiza dados / `ativo` |
| GET/POST | `/organizacoes/:id/contrato` | GET: todos · POST: ADMIN, OPERADOR | Consulta / cria contrato |
| PATCH | `/organizacoes/:id/contrato/renovar` | ADMIN, OPERADOR | Renova contrato |
| POST | `/lotes` | ADMIN, GESTOR | Cria lote (opcionalmente com `equipamentos[]`) |
| GET | `/lotes`, `/lotes/:id` | autenticado | Lista (filtros org/status/período) / detalhe |
| POST | `/lotes/:id/equipamentos` | ADMIN, GESTOR | Adiciona equipamento (lote `RECEBIDO`) |
| POST | `/lotes/:id/triagem` | ADMIN, GESTOR | Inicia a triagem do lote |
| PATCH | `/lotes/:id/status` | ADMIN, GESTOR | `ENCAMINHADO` → `FINALIZADO` |
| GET | `/equipamentos`, `/equipamentos/:id` | autenticado | Lista (filtros) / detalhe |
| GET | `/equipamentos/:id/rastreio` | autenticado | Histórico de movimentações + trilha de auditoria |
| GET | `/equipamentos/:id/depreciacao?valorOriginal=` | autenticado | Valor residual |
| PATCH | `/equipamentos/:id/estado` | ADMIN, GESTOR | Estado físico (justificativa se cair ≥ 2) |
| PATCH | `/equipamentos/:id/status` | ADMIN, GESTOR | Status de rastreamento (máquina de estados) |
| POST | `/equipamentos/:id/movimentacoes` | ADMIN, GESTOR | Movimentação física |
| GET | `/relatorios/organizacao/:id`, `/relatorios/status[/:status]`, `/relatorios/financeiro` | ADMIN, AUDITOR | Relatórios (JSON) |
| GET | `/journal` | ADMIN, AUDITOR | Trilha de auditoria (filtros) |

Listagens aceitam `?pagina=1&limite=20` (máx. 100) e retornam `{ dados, pagina, limite, total, totalPaginas }`.

---

## 7. Testando com Thunder Client

[Thunder Client](https://www.thunderclient.com/) é uma extensão do VS Code (recomendada em `.vscode/extensions.json`). A pasta `thunder-client/` traz uma **coleção pronta com 56 requisições** que percorrem toda a jornada e verificam códigos HTTP e trechos das respostas (aba *Tests*).

### Importar
1. Instale a extensão **Thunder Client** (`rangav.vscode-thunder-client`).
2. Aba **Collections** → menu `⋯` → **Import** → `thunder-client/greencode-api.collection.json`.
3. Aba **Env** → menu `⋯` (ou ícone de importar) → **Import** → `thunder-client/greencode-api.env.json`, e **ative** o ambiente `greencode-local`.
   - *Alternativa manual (caso a importação do ambiente falhe)*: crie um ambiente com `baseUrl = http://localhost:3000`, `adminUsuario = admin`, `adminSenha = Admin@12345`. As demais variáveis (`token`, `tokenGestor`, `orgId`…) são preenchidas sozinhas.

### Executar
Suba a API (`npm run dev`) com o banco semeado e rode a coleção na ordem das pastas (clique direito na coleção → **Run All**).

| Pasta | O que demonstra |
|---|---|
| 00 Infra | `/health`; guarda `{{ts}}` para gerar dados únicos |
| 01 Auth | Login, senha errada (401), `/auth/me`, renovação, sem token (401) |
| 02 Usuários | Criação de gestor e auditor; **RBAC** (gestor não cria usuário → 403) |
| 03 Organizações | CNPJ inválido (422), corpo inválido (400), permissões (403) |
| 04 Contratos | Criação, consulta, renovação válida e inválida |
| 05 Lotes | Data futura / > 90 dias (422), criação, equipamentos, início da triagem |
| 06 Equipamentos | Justificativa obrigatória (422), **versão desatualizada (409)**, `EM_DESMONTE` sem triagem (422), movimentação, rastreio, conclusão automática da triagem |
| 07 Relatórios | Por organização, por status, financeiro; gestor bloqueado (403) |
| 08 Journal/Parâmetros | Auditoria, parâmetros, lote aberto impede desativar organização (409) |

As variáveis são encadeadas automaticamente (*set env var* a partir do JSON de resposta): `token`, `tokenGestor`, `tokenAuditor`, `orgId`, `loteId`, `equipId`, `equipId2`.

**Re-execução:** os dados de usuário e nota fiscal usam `{{ts}}` e se repetem sem conflito; o CNPJ da organização e o contrato são fixos, então em uma segunda rodada algumas requisições de criação retornarão `409` (esperado, e o `orgId` é recuperado por busca de CNPJ). Para começar do zero: `npm run db:reset`.

> Se alguma versão do Thunder Client não importar o arquivo, use o **Swagger UI** (`/docs`): é possível autenticar (botão *Authorize*) e testar cada endpoint.

---

## 8. Regras de negócio

Migradas da Atividade 1 para `src/domain/` (puras e testadas) e aplicadas nos serviços:

- **CNPJ**: 14 dígitos + dígitos verificadores (módulo 11) e unicidade (aplicacional **e** `UNIQUE` no banco).
- **Data de entrada do lote**: não pode ser futura nem anterior a 90 dias (comparação em UTC). Se omitida, assume “agora”.
- **Estado físico**: queda de **2 ou mais categorias** exige `justificativa` textual (`NOVO < BOM_ESTADO < USADO_LEVE < USADO_MODERADO < DANIFICADO_LEVE < DANIFICADO_GRAVE < INSERVIVEL`).
- **Máquina de estados do equipamento**:

```
AGUARDANDO_TRIAGEM → EM_TRIAGEM → AGUARDANDO_DESMONTE → EM_DESMONTE → PECAS_REAPROVEITADAS ┐
                          │                                      ├──→ MATERIAL_RECICLAVEL   ├→ BAIXA_DEFINITIVA
                          └────────→ DESCARTE_SEGURO ←───────────┘                          ┘
```
  `EM_DESMONTE` **só** é alcançável a partir de `AGUARDANDO_DESMONTE` (triagem completa). Equipamento em `BAIXA_DEFINITIVA` é imutável.
- **Lote**: `RECEBIDO` → (`POST /triagem`) `EM_TRIAGEM` → (automático) `TRIAGEM_CONCLUIDA` → `ENCAMINHADO` → `FINALIZADO` (só com todos os equipamentos em `BAIXA_DEFINITIVA`). Só se alteram status de equipamentos depois de iniciar a triagem do lote. Nota fiscal é única por organização.
- **Organização**: não pode ser desativada com lotes não finalizados; organização desativada não recebe contrato nem lotes. Contrato é 1:1 opcional; renovação exige vencimento posterior ao atual.
- **Código de barras**: `PREFIXO-ANO-SEQUÊNCIA` (ex.: `NTB-2026-000042`), derivado de uma coluna `autoincrement` do PostgreSQL → único mesmo com concorrência.

---

## 9. Transações, concorrência e versionamento otimista

**Operações que usam `prisma.$transaction`** (tudo ou nada):

| Operação | O que é gravado atomicamente |
|---|---|
| Criar lote com equipamentos | lote + N equipamentos + N movimentações de recebimento + journal |
| Cadastrar organização com contrato | organização + contrato + journal |
| Iniciar triagem | lote + equipamentos (em massa) + movimentações + journal |
| Alterar status de equipamento | equipamento + **movimentação** + (se aplicável) conclusão da triagem do lote + journal |
| Demais alterações | entidade + journal |

O **journal entra na mesma transação**: se a operação falha, não sobra registro de auditoria “fantasma”; se confirma, a trilha está garantida.

**Bloqueio otimista**: todo modelo tem `versao`. Os `UPDATE`s são `updateMany({ where: { id, versao } })` com `versao: { increment: 1 }`; se `count !== 1`, retorna **409 `CONFLITO_DE_VERSAO`**. O cliente *pode* enviar `versao` no corpo (a comparação ocorre antes); se omitir, o *compare‑and‑set* ainda protege contra alterações simultâneas entre a leitura e a escrita dentro da requisição.

**Bloqueio pessimista pontual**: operações que dependem do conjunto de equipamentos do lote (adicionar equipamento, iniciar triagem, mudar status) fazem `SELECT … FOR UPDATE` no lote. Sem isso, duas requisições simultâneas poderiam concluir a triagem “ao mesmo tempo” e deixar o lote preso em `EM_TRIAGEM`, ou disputar a mesma posição no lote.

---

## 10. Segurança

- **JWT HS256** (`@fastify/jwt`), 30 min, com `sub`, `usuario` e `papel`. Algoritmo fixado na verificação.
- **bcrypt (`bcryptjs`)** para senhas; a comparação sempre roda contra um hash (mesmo se o usuário não existir) e a mensagem é única (“usuário ou senha inválidos”), reduzindo enumeração de usuários.
- **Rate limit** no login (`LOGIN_RATE_LIMIT_MAX`/min por IP).
- **RBAC** por rota (`authenticate` + `authorize`), negando por padrão.
- **Validação de entrada** por JSON Schema em todas as rotas (campos extras removidos, tipos e limites checados).
- **Erros** não vazam detalhes internos (500 genérico; detalhe só no log).
- **Prisma** usa consultas parametrizadas (sem SQL concatenado → sem injeção).
- **Journal imutável** (trigger bloqueia `UPDATE`/`DELETE`).
- `senhaHash` nunca é retornado pela API; `.env` fora do Git.

---

## 11. Decisões arquiteturais e trade-offs

| Decisão | Por quê | Alternativas rejeitadas / custo |
|---|---|---|
| **Monólito em camadas** | Implantação e depuração simples, coesão do código e transações ACID locais em um estágio inicial do negócio | Microsserviços: complexidade operacional e consistência distribuída sem necessidade hoje. Como as camadas são independentes, é possível extrair módulos depois |
| **Fastify** (e não Express) | JSON Schema nativo (validação + documentação OpenAPI da mesma fonte), plugins/hooks para auth e logging, melhor desempenho | Express: mais minimalista, porém exigiria libs extras para validação |
| **Prisma ORM** | Tipos TypeScript gerados do schema, migrações versionadas, transações e *eager loading* | SQL manual/Knex: mais controle, mais código e erros. Custo: `CHECK`/*trigger* ficam em SQL à parte (`constraints.sql`) |
| **PostgreSQL** | ACID, `JSON`, `UUID`, `CHECK`, *triggers*, `FOR UPDATE` | MySQL também serve; Postgres foi o recomendado e simplifica `Json` (cláusulas) |
| **JWT stateless** | A API não guarda sessão → escala horizontalmente, simples para SPA | Sessão em banco: revogação imediata, mas estado compartilhado. **Custo do JWT**: um token roubado vale até expirar e desativar usuário só surte efeito na expiração/renovação. Mitigações: validade curta (30 min), `/auth/renovar` relê o usuário no banco. Evolução: *refresh token* revogável + *denylist* |
| **`bcryptjs`** (e não `bcrypt`) | Mesmo algoritmo, **JavaScript puro**: instala igual em Windows e Ubuntu sem compilador (requisito de portabilidade) | `bcrypt` nativo é um pouco mais rápido, mas exige *build tools* no Windows. Argon2id é mais moderno (evolução possível) |
| **Journal no banco, na mesma transação** | Auditoria atômica com o dado; consulta por SQL | Arquivo (Atividade 1) não participa da transação do banco |
| **Concorrência otimista + `FOR UPDATE` pontual** | Conflitos são raros: otimista não segura locks e dá erro claro (409); lock só onde há invariantes no conjunto (lote) | Locks pessimistas em tudo: menos throughput e risco de *deadlock* |
| **Códigos via `autoincrement`** | Único sob concorrência, sem contador aplicacional | `COUNT()+1` (Atividade 1) gera colisão com requisições simultâneas |

---

## 12. Testes automatizados

```bash
npm test
```

Executa `tests/dominio.test.ts` e `tests/validadores.test.ts` (runner nativo do Node via `tsx --test`): regra de queda de estado, máquina de estados (incluindo a regra do desmonte), conclusão de triagem, transições do lote, código de barras, depreciação, CNPJ e data de entrada. **Não exigem banco.**

Os testes ponta a ponta (HTTP + banco) são a **coleção do Thunder Client** (seção 7).

---

## 13. Estrutura de pastas

```
greencode-api/
├── prisma/
│   ├── schema.prisma          Modelos, enums e relacionamentos
│   ├── seed.ts                Massa de dados representativa
│   └── sql/constraints.sql    CHECKs + trigger de imutabilidade do journal
├── src/
│   ├── server.ts              Inicialização + graceful shutdown
│   ├── app.ts                 Montagem do Fastify (plugins, Swagger, rotas)
│   ├── container.ts           Injeção de dependências
│   ├── config/env.ts          Variáveis de ambiente
│   ├── domain/                Enums, regras puras e validadores (reuso da Atividade 1)
│   ├── http/{rotas,controllers}/   Camada Controller
│   ├── services/              Camada Service (regras de negócio, transações)
│   ├── repositories/          Camada Repository (Prisma)
│   ├── plugins/               JWT/RBAC e tratamento de erros
│   └── shared/                Erros, paginação, utilitários
├── tests/                     Testes de domínio
├── thunder-client/            Coleção e ambiente do Thunder Client
├── docker-compose.yml         PostgreSQL local
├── .env.example
└── .gitignore                 (node_modules, dist, .env…)
```

---

## 14. Limitações conhecidas

- Sem *refresh token* revogável nem logout server-side (o token vale até expirar; veja trade-offs).
- Relatórios são JSON (sem exportação PDF/CSV).
- `ValidadorDataEntrada` compara por dia em UTC: há tolerância de algumas horas conforme o fuso do cliente.
- Os testes automatizados cobrem o domínio; a jornada completa com banco é feita pela coleção do Thunder Client.
- O CLI da Atividade 1 não faz parte deste pacote; suas regras foram migradas para `src/domain` e os serviços.
