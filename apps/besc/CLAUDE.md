---
title: "BESC — Plataforma de Pesquisa e Recuperação de Ativos Legados"
status: canonical
applies_to: [besc]
updated: 2026-09-26
language: pt-BR
---

# BESC — Plataforma de Pesquisa e Recuperação de Ativos Legados

## NON-NEGOTIABLE DOMAIN RULES

1. Legacy evidence is not an asset.
2. Private appraisal does not establish ownership.
3. Token does not create legal ownership.
4. Digital lock does not perfect collateral.
5. External legal system of record wins.
6. No external confirmation = no registered asset.
7. Tokenization is optional.
8. Blockchain is optional.
9. Multi-issuer scale is unproven.
10. BESC is an origin, not the product.

Estas regras vêm de [ADR-010](./docs/evolution/adr/ADR-010-asset-infrastructure-pivot.md) e da reconciliação
(repo `besc`, `docs/reconciliation/**`, base canônica). Estão impostas no serviço **e** no banco
(`api/sql/0007_asset_recovery.sql`). Não as enfraqueça por conveniência de teste, demo ou UI:
- não crie mock ou modo `SIMULATION` que satisfaça o gate de confirmação externa;
- não cadastre fato não pesquisado como verdade (use `RESEARCH_PENDING`); não invente números de mercado;
- não religue `TOKENIZATION_REAL`, `MARKETPLACE_REAL`, `REAL_MONEY` ou `REAL_INVESTMENT` (constantes de código, sem env);
- não trate cautela como ativo nem laudo privado como confirmação de titularidade ou valor.

> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md) · fronteiras: [`../../AGENTS.md`](../../AGENTS.md)
> · máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** — aponte.

## O que é

**Plataforma de pesquisa e recuperação de ativos legados.** Pergunta, antes de qualquer ativo: que
evidência é esta, que direito ela poderia representar, esse direito ainda existe, quem o reconhece
e onde está registrado. O BESC (incorporado ao Banco do Brasil; ações convertidas em BBAS3 em
11/02/2009) é a primeira origem estudada, não o produto. Frentes:

1. **Portal público** — home com os princípios, **Referência** (`/referencia`: fatos com fonte e,
   separadas, afirmações de terceiros com contraponto), **Jurisprudência** (`/jurisprudencia`, 99
   registros com a reavaliação editorial aplicada na leitura), **Biblioteca** (`/biblioteca`, natureza
   da fonte por item; material de terceiros só para `content:write`), **Glossário** e **Roadmap** (F0–F9).
2. **Reivindicações** (`/recuperacao`, `recovery:*`) — reclamante, reivindicação, evidência legada com
   hash e classificação, valores alegados, jornada POSSÍVEL DIREITO → DIREITO CONFIRMADO → ATIVO
   REGISTRADO. Só F1 e F2 existem; F3–F5 respondem `NOT_AVAILABLE_IN_PHASE`.
3. **Levantamento por caso** (`/casos`, histórico) — o módulo v1 de [`ESCOPO-FUNCIONAL.md`](./ESCOPO-FUNCIONAL.md).
   Cada caso é migrado no boot para uma reivindicação com o mesmo id (demo seed não migra).

**Não tokeniza, não oferece investimento, não recebe pagamento, sem blockchain.** Não presta
aconselhamento jurídico. O plano SUPERSEDED de marketplace em [`docs/evolution/`](./docs/evolution/00-visao-geral.md)
fica só como histórico (cabeçalhos de status em cada doc).

### Conteúdo (biblioteca + jurisprudência)
- **Coleções** no mesmo store JSON: `library`, `jurisprudence`, `glossary`, `catalogMeta` (migração
  aditiva — `besc.json` antigo só com `cases` carrega inalterado). Enums de conteúdo em
  `api/src/domain-content.js`; conteúdo de referência estático em `api/src/reference/*`.
- **Catálogo** (metadados) versionado em `api/seed/*.json`, carregado idempotente no boot por
  `store.seedCatalog()` (version-gated, não sobrescreve edições do operador). Gerado offline por
  `api/seed/gen-catalog.mjs` (facetas de pasta+nome; ementas curadas em `overrides.json`).
- **Binários** (~275 MB: PDFs + 4 vídeos) vivem **só no PVC** (`/data/{library,jurisprudence}/<id><ext>`),
  ingeridos UMA VEZ por `seed/ingest-files.ps1` (`kubectl cp` — usa caminhos **relativos**, pois `C:\`
  confunde o kubectl cp no Windows). Rotas de arquivo usam `res.sendFile` (Range p/ vídeo); binário
  ausente → 404 gracioso. Endpoints: `/library*`, `/jurisprudence*`, `/glossary`, `/stats`.

## Stack & arquitetura

| Aspecto | Decisão |
|---|---|
| Frontend | React 18 + Vite 5 + react-router-dom, nginx (`besc-frontend`), base path `/besc/`, sem strip, priority 10 |
| API | Node 20.20.2 fixado (Dockerfile, `.nvmrc`, `engines`) + Express (`besc-api`), rotas na raiz (Traefik faz strip de `/besc/api`), priority 40 |
| Persistência | **store em arquivo JSON** (`/data/besc.json`) num **PVC** p/ portal + levantamento (cases, library, jurisprudence, glossary) — **+ Postgres `besc-postgres`** (pgvector/pg16, `k8s/postgres.yaml`) p/ identidade/RBAC/auditoria, credenciais no secret **`besc-db` selado**. **Anexos** de documentos (upload via `multer`) gravados em `/data/uploads/<caseId>/` no mesmo PVC (limite 15 MB/arquivo). |
| Auth | login local (bootstrap/fallback) + **SSO Keycloak realm dedicado `besc`** (client público `besc-spa`, PKCE S256); sessão própria do app via `@flavioneto11/oidc-kit`; **RBAC 100% em dados** (nunca derivado de claims do token) — ver `docs/evolution/01-rbac-permissoes.md` |
| Deploy | `apps/besc/k8s` (Argo CD auto-sync) · imagens `:local` no laboratório |

Domínio (enums canônicos §2.11, motor de pendências §8.1, máquina de status §8.2, matriz de risco §8.3,
relatórios §9) vive em `api/src/domain.js` + `api/src/reports.js`. Frontend em `frontend/src/`.

### Recuperação de ativos legados (F1/F2 — ADR-010)

- **`governance/`** — `capabilities.js` (capacidades congeladas, 403 `CAPABILITY_DISABLED`) e
  `legacy-freeze.js` (rotas da tese antiga → 410 `LEGACY_THESIS_FROZEN` **antes** da autenticação).
- **`recovery/`** — `domain/` (modelo de estados, invariantes, confirmação externa, quatro olhos,
  Valuation 2.0, origens, gates, source claims), `repo/pg.js` + `repo/memory.js`, `service.js`,
  `index.js` (rotas `/recovery/*`, boot com migração `LegacyCase → Claim`).
- **SQL**: `0006_audit_v2.sql` (fonte obrigatória, correção por evento `*.corrected`, verificador
  `audit_chain_verify`, TRUNCATE bloqueado) e `0007_asset_recovery.sql` (tabelas append-only,
  `entity_transition` validada contra `allowed_transition`, gatilhos de invariantes, quatro olhos).
  Estado muda **só** por INSERT em `entity_transition`.
- **Conteúdo**: `reference/portal-content.js` (`PLATFORM_FACTS` × `THIRD_PARTY_CLAIMS`),
  `reference/content-overlay.js` + `seed/jurisprudence-reassessment.json` (gerado por
  `tools/gen-jurisprudence-assessment.mjs`) + `seed/content-classification.json`.
- **Testes**: `npm --prefix apps/besc/api test`. Os testes com Postgres usam contêiner Docker
  descartável (`test-support/pg-docker.mjs`, ou `TEST_PG_ADMIN_URL` = um banco novo por arquivo) e
  pulam sem Docker — **exceto** a suíte anti-Excalibur (`npm --prefix apps/besc/api run test:regression`),
  que FALHA sem banco. **Nunca** rode migrations nem testes contra `besc-postgres` do cluster.
- **Paridade de runtime**: `sh apps/besc/tools/test-in-production-runtime.sh` roda a suíte DENTRO da
  imagem de produção da API (Node 20.20.2) contra `pgvector/pgvector:pg16`.
- **Papéis do banco**: migrations/seed de RBAC com o usuário do `DATABASE_URL` (MIGRATION_ROLE); a API
  atende como `besc_app` (`sql/0008`, privilégio mínimo). Variáveis: `BESC_DB_APP_PASSWORD` (senha
  própria do `besc_app`, no SealedSecret `besc-db`), `BESC_DB_REQUIRE_APP_ROLE=true` (produção: sem a
  senha a fundação não liga), `BESC_MIGRATE_SEEDED_CASES=migrate` (decisão do operador de migrar os
  casos do carregador seed-cases; padrão é pular). Não conceda escrita nova ao `besc_app` sem
  atualizar `RUNTIME_WRITES` em `test/db-privileges.pg.test.mjs`.
- **Conteúdo**: UNKNOWN ≠ PUBLIC. Só `PUBLIC_SAFE` (via `PUT /…/:id/curation`) aparece sem login.
- **Auditoria de congelamento**: `node apps/besc/tools/product-freeze-audit.mjs --label <x>` (`docs/pivot/`).
- **Deploy**: `docs/pivot/02-deployment-runbook.md` (backup, migração, validação, rollback).

### Marketplace (fases 0–4) — CONGELADO (ADR-010)

Código e tabelas preservados para leitura histórica e rastreabilidade: `marketplace/` (títulos,
emissão, receita, gate, portais), `ledger/` (LedgerPort, simulado, Besu), `sql/0003`–`0005`, telas
`/gestao/{titulos,financeiro,alugueis,gate}`, `/investidor/*`, `/auditoria/*`, `/marketplace`
(arquivos com cabeçalho DEPRECATED, **não roteados**; caminhos antigos → `/desativado`). Escritas
respondem 410; o boot nunca importa o adaptador Besu e ignora `LEDGER_*`/`BESU_*`. O nó Besu saiu do
deployment ativo (`k8s/deprecated/besu.yaml.archived`, fora do kustomization). Eventos `title.*`,
`token.*`, `market.*`, `rental.*` não podem mais ser emitidos. Não reative nada disso sem um ADR novo.

## Rodar / publicar

```powershell
# API local (smoke): $env:DATA_DIR='...'; node apps/besc/api/src/server.js  (porta 8080)
# Frontend local:    npm --prefix apps/besc/frontend run dev   (proxy /besc/api -> :8099)
docker build -t besc-api:local apps/besc/api
docker build -t besc-frontend:local apps/besc/frontend
kubectl apply -f apps/besc/k8s
scripts\setup-besc-realm.ps1   # (uma vez, idempotente) provisiona o realm 'besc' + client besc-spa no Keycloak
```

Validar: `http://nvit.localhost/besc` (SPA) e `http://nvit.localhost/besc/api/health` (API pós-strip).
Público: `https://dev.nvit.com.br/besc`.

## Armadilhas

- **Base path**: o build embute `/besc/` (`vite.config.js`) e o nginx serve por **prefixo+alias** (MIME-safe);
  Traefik **não** faz strip do frontend.
- **PVC + `USER node`**: o Deployment usa `securityContext.fsGroup: 1000` para o usuário `node` escrever em `/data`.
- **`.html` no dev**: o proxy do Vite intercepta `*.html` → `report.html` dá 404 **só no dev**; em produção o Traefik encaminha direto para a API (200).
- **Segredos via SealedSecret** (`besc-db`, `besc-config` — `k8s/sealed-*.yaml`): o exemplo com
  placeholders fica em `k8s/secret.example.yaml.tmpl` — a extensão `.tmpl` impede o Argo de
  aplicá-lo (um example "vivo" no path do Argo clobberaria o secret real a cada sync).

