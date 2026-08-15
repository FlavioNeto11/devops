---
name: forge-build-ui
description: Motor multiagente "ultracode" que projeta o inventário COMPLETO de telas de um app da Forja e constrói frontends Vue ricos (nível SICAT/GymOps) sobre o kit ui-vue, com backend de domínio, crítico de design e verificação. Use para gerar/elevar o frontend de um produto.
---

# forge-build-ui — gerar o frontend robusto de um app da Forja

Roda o Workflow `specs/forge/workflows/generate-ui.workflow.mjs` (modelo da sessão = Opus 4.8 +
reasoning). Pipeline: **Arquiteto-UX** (inventário completo de telas + entidades + marca + lacunas,
ancorado a requisitos reais) → **Base/Backend** (marca, REFs, sync do kit/tokens, endpoints de domínio
que faltam) → **Telas** (um builder por tela + crítico adversarial + correção) → **Integração**
(router/nav/api, vite build, testes, contrato OpenAPI). Autônomo; reporta lacunas no fim.

## Como rodar

1. Descubra o produto (`<app>`) e leia seus requisitos (`specs/requirements/<app>/*.yaml` → id+title) e
   o contrato de UI (`specs/forge/ui-kit-contract.md`).
2. Chame a tool **Workflow** com:
   - `scriptPath: "specs/forge/workflows/generate-ui.workflow.mjs"`
   - `args: { product, title, basePath, appDir: "apps/<app>", requirements: [{id,title,statement?}], contract: <texto do ui-kit-contract.md> }`
3. O Workflow roda em background; ao terminar, leia o relatório (telas construídas, lacunas, verify).
4. **Depois (regime branch+PR, Forja 4.1 F4 — decisão do operador)**: o motor NÃO commita na main
   nem deploya. Na esteira (`.github/workflows/greenfield-ui.yml`), quem faz o git é o workflow: valida
   o diff com `specs/tools/guard-worktree.mjs` (allowed_paths do produto + denylist), commita em branch
   `forge-ui/<app>/r<run_id>` e abre PR rastreável (labels `claude-generated`+`forge-ui`); merge pelo
   gate híbrido (`gpt-approved` + CI verde, clique final do operador) e deploy DEPOIS do merge via
   `forge-deploy.yml -f product=<app>`. Rodando interativo, replique o regime: branch `forge-ui/<app>/rN`
   + PR pelo mesmo gate (para validar visualmente antes do PR, use build/apply `:local` sabendo que o
   Argo selfHeal reverte apply não-commitado).
5. **PR gigante?** O motor projeta o inventário completo (precedente: 47 views no neuroevolui). Para
   rodar POR PARTES, use o input `scope` do workflow (lista de REQ-IDs): só telas ancoradas neles entram
   na rodada — o recorte é o próprio filtro anti-fabricação do motor (âncora fora da lista → descartada).

## Regras

- O motor respeita: testes `tests/locked/**` (não edita), CSP (sem style inline/v-html), tokens `--ui-*`,
  drift-gate (kit + design-tokens). Telas ancoram a requisitos REAIS (âncora inexistente é descartada).
- Backend de domínio (tabelas + CRUD) é adicionado quando uma tela exige uma entidade nova; o backend
  de plataforma continua na esteira por requisito.
- Pré-requisito: o app já deve ter a base scaffoldada (`scaffold-product.ps1` / `scaffold-frontend.mjs`)
  e `product.json` com `interfaces` incluindo `"web"`.
