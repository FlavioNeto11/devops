# Frontend SICAT — Vue 3 + Vuetify

Portal operacional do SICAT (automação MTR/CETESB). Produto corporativo para o
operador parceiro emitir/acompanhar MTR, gerar CDF, declarar DMR, e para o
operador SICAT/SRE monitorar jobs, auditoria e saúde de integrações.

Stack: **Vue 3 + Vuetify 3 + Vue Router + Pinia + ApexCharts + Vite**.

> **Design system:** [docs/design-system.md](docs/design-system.md) — catálogo
> dos componentes `Sicat*` (props, slots, exemplos) + playground em `/dev/components`.
> **Arquitetura de componentes:** [../docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](../docs/FRONTEND-COMPONENTS-ARCHITECTURE.md).
> **Refatoração UX/UI:** DL-100 ([../docs/CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md](../docs/CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md)).

## Navegação por audiência

A navegação ([src/config/navigation.js](src/config/navigation.js)) é uma fonte
declarativa única, organizada em módulos e filtrada por papel (`canAccessAdmin`):

- **Operação** (sempre visível): Início, MTR (Manifestos · Emitir · Relatórios),
  MTR Provisório, Resíduos · DMR, Certificados · CDF, Assistente.
- **Sistema** (apenas admin/SRE): Visão geral, Jobs, Auditoria, Saúde CETESB,
  Relatórios MTR (SRE), Command Center.
- **Administração** (apenas admin): Acessos.

Jobs é consolidado em `/sistema/jobs` (`/jobs` e `/operacao/jobs` redirecionam).
"Minha sessão" fica no menu do usuário (avatar), não no drawer.

## Jornadas principais

1. **Chegar ao sistema** — login → seleção obrigatória de conta CETESB → Início.
2. **Emitir MTR** — wizard → submit (202 + jobId) → acompanhamento por timeline.
3. **Acompanhar pendências** — Início destaca falhas/rascunhos com CTA direto.
4. **Receber resíduo + gerar/baixar CDF**.
5. **Gerar e submeter DMR**.
6. **MTR Provisório** (emergencial).
7. **SRE**: auditar incidente, requeue DLQ, validar saúde de conta CETESB.

## Estrutura

```text
src/
  components/sicat/   # design system (SicatPageLayout, DataTable, FiltersPanel, StatusBadge, ...)
  components/shell/   # App Shell (topbar, drawer, page header, user menu)
  components/shared/  # inputs compartilhados (SicatDateInput)
  features/           # decomposição feature-based (dashboard, mtr/list, ...)
  views/              # páginas roteadas
  composables/        # useNotification, useJobAwait, useJobStream, useConfirmDialog, ...
  stores/             # Pinia (auth, manifests, dmr, mtr-provisorio, ...)
  services/           # clientes HTTP da API interna (api.js)
  lib/status-map.js   # fonte única de tones + labels de status
  config/navigation.js
  router.js           # guards (auth SICAT, conta CETESB, RBAC admin) + meta.audience
  styles/{tokens,base}.css
```

Padrões obrigatórios de UI: toda página usa `SicatPageLayout` + `SicatPageHeader`;
listas usam `SicatDataTable`; status usa `SicatStatusBadge`; feedback usa
`useNotification`; confirmação destrutiva usa `useConfirmDialog`. Detalhes em
[docs/design-system.md](docs/design-system.md).

## Como rodar

Requer o backend ativo na porta configurada.

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # build de produção
npm run preview    # preview do build
npm run test:ui    # testes Playwright (UI)
```

### Primeiro acesso

1. Acesse `http://localhost:5173` (a landing pública aponta para o login).
2. Faça login (modo real valida com a CETESB).
3. Selecione a conta CETESB ativa (obrigatório antes de operar).
4. Você cai no painel **Início** com as pendências do dia.

## Variáveis de ambiente

Crie `.env` com base em `.env.example`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8080
VITE_REQUIRE_REAL_AUTH=true
```

## Fronteiras (não quebrar)

- O frontend **nunca** fala direto com a CETESB — apenas com a API interna SICAT.
- Autenticação SICAT, seleção obrigatória de conta CETESB e guards de rota são
  contratos críticos.
- Operações assíncronas seguem o padrão `202 Accepted` + `jobId` (polling/SSE via
  `useJobAwait`/`useJobStream`).
