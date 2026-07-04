---
title: "BESC — Plataforma de Levantamento BESC Tokenização"
status: canonical
applies_to: [besc]
updated: 2026-07-02
language: pt-BR
---

# BESC — Plataforma de Levantamento BESC Tokenização

> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md) · fronteiras: [`../../AGENTS.md`](../../AGENTS.md)
> · máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** — aponte.

## O que é

**Portal + base de conhecimento SEM login** sobre as ações do antigo **BESC** (incorporado pelo Banco
do Brasil), que serve de fundamento para uma **futura** tokenização. Duas frentes:

1. **Portal de conhecimento** — a home (`/`) explica o que são as BESCs; **Biblioteca institucional**
   (`/biblioteca`, 18 docs: fundamentos, histórico da incorporação, comunicados Bacen, custos de
   cartório, petições-modelo, vídeos); **Jurisprudência** (`/jurisprudencia`, 100 decisões navegáveis
   por facetas — tribunal/credor/mecanismo/resultado/instância, com ementas fiéis + PDF do inteiro
   teor); **Glossário** (`/glossario`) e **Referência** (`/referencia`, mecanismos/base legal/tabela de
   cartório 2024/padrão jurisprudencial) e **Roadmap** (`/roadmap`).
2. **Levantamento por caso** (`/casos`) — cadastrar casos/processos, organizar documentos, **perícia /
   atualização monetária**, **mecanismo + credor-alvo**, pendências, risco, checklist de tokenização e
   relatórios (incl. `strategy_report`). Vincula precedentes da jurisprudência (link soft por id).

**Não tokeniza de verdade, não consulta tribunais, sem blockchain, sem pagamento.** Ferramenta
organizacional — **não** presta aconselhamento jurídico (ementas marcadas "requer validação jurídica").

O escopo funcional do levantamento (10 seções) está em [`ESCOPO-FUNCIONAL.md`](./ESCOPO-FUNCIONAL.md).

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
| API | Node 20 + Express (`besc-api`), rotas na raiz (Traefik faz strip de `/besc/api`), priority 40 |
| Persistência | **store em arquivo JSON** (`/data/besc.json`) num **PVC** — sem Postgres/Redis (baixo volume, operador único). **Anexos** de documentos (upload via `multer`) gravados em `/data/uploads/<caseId>/` no mesmo PVC (limite 15 MB/arquivo). |
| Auth | nenhuma (sem login por definição) |
| Deploy | `apps/besc/k8s` (Argo CD auto-sync) · imagens `:local` no laboratório |

Domínio (enums canônicos §2.11, motor de pendências §8.1, máquina de status §8.2, matriz de risco §8.3,
relatórios §9) vive em `api/src/domain.js` + `api/src/reports.js`. Frontend em `frontend/src/`.

## Rodar / publicar

```powershell
# API local (smoke): $env:DATA_DIR='...'; node apps/besc/api/src/server.js  (porta 8080)
# Frontend local:    npm --prefix apps/besc/frontend run dev   (proxy /besc/api -> :8099)
docker build -t besc-api:local apps/besc/api
docker build -t besc-frontend:local apps/besc/frontend
kubectl apply -f apps/besc/k8s
```

Validar: `http://nvit.localhost/besc` (SPA) e `http://nvit.localhost/besc/api/health` (API pós-strip).
Público: `https://dev.nvit.com.br/besc`.

## Armadilhas

- **Base path**: o build embute `/besc/` (`vite.config.js`) e o nginx serve por **prefixo+alias** (MIME-safe);
  Traefik **não** faz strip do frontend.
- **PVC + `USER node`**: o Deployment usa `securityContext.fsGroup: 1000` para o usuário `node` escrever em `/data`.
- **`.html` no dev**: o proxy do Vite intercepta `*.html` → `report.html` dá 404 **só no dev**; em produção o Traefik encaminha direto para a API (200).
- Sem segredos: não há `secret.example.yaml` no path do Argo.

