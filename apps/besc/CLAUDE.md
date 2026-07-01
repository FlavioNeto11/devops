# BESC — Plataforma de Levantamento BESC Tokenização

> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md) · fronteiras: [`../../AGENTS.md`](../../AGENTS.md)
> · máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** — aponte.

## O que é

Sistema **simples, SEM login**, focado **exclusivamente em levantamento**: cadastrar casos/processos
ligados a ações do antigo **BESC** (incorporado pelo Banco do Brasil), organizar documentos, levantar
pendências, classificar risco e gerar checklists + relatórios para **futura** tokenização e avaliação de
uso como **caução/garantia processual**. **Não tokeniza de verdade, não consulta tribunais, sem
blockchain, sem pagamento.** Ferramenta organizacional — **não** presta aconselhamento jurídico.

O escopo funcional completo (10 seções: telas, campos, checklists, status, relatórios, MVP) está em
[`ESCOPO-FUNCIONAL.md`](./ESCOPO-FUNCIONAL.md).

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
