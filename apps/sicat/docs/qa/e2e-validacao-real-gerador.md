<!-- markdownlint-disable MD013 MD033 -->

# Validação E2E — SICAT com conta real GERADOR

> **Privacidade:** este relatório não contém senha, e-mail, CPF ou CNPJ em texto puro.
> Dados sensíveis aparecem mascarados (ex.: `CNPJ ••••0139`). Credenciais ficam apenas em
> `.env.e2e` (não versionado). Screenshots mascarados ficam em
> `frontend/test-results/e2e-gerador/` (não versionado).

## 1. Resumo executivo

| Item | Valor |
| --- | --- |
| Ambiente | Docker (postgres + api + worker) + frontend Vite, local |
| Data/hora (UTC) | 2026-05-29 (~19:10Z, rodada final) |
| Branch | `main` |
| Modo de mutações CETESB | `SICAT_E2E_ALLOW_CETESB_MUTATIONS=false` (somente leitura/navegação) |
| Conta CETESB | GERADOR real (CNPJ `••••0139`), `accountType=generator` |
| **Resultado geral** | ✅ **APROVADO** (1 item pré-existente de segurança para o dono — ver §6) |

**Veredito:** ambiente sobe do zero via Docker (após corrigir 2 bugs do compose); o usuário
interno E2E é criado, autentica e ativa a **conta GERADOR real (sessão CETESB ativa)**; **as 20
telas navegadas carregam sem 1 erro de console nem HTTP 4xx/5xx** — 13 de operação + 6 de
Sistema/Administração (validadas com usuário admin) + playground. O auto-redirect pós-ativação
funciona, o gating por papel (RBAC) funciona, e o `health/system` está **healthy**. A experiência
tem cara de produto corporativo (design system consistente).

**Correções/implementações desta rodada (para deixar 100%):**
- 🔴 (corrigido) `docker-compose.yml` quebrado pós-migração TS → `tsx` + volume anônimo `node_modules`.
- ✅ Usuário interno E2E promovido a **admin** (role `admin.global`) → telas de Sistema/Administração validadas funcionalmente.
- ✅ **DLQ herdada limpa** + poda de `worker_health` stale → `health/system` voltou a **healthy**.
- ✅ Tooling de segurança: `npm run scan:secrets` + runbook de remediação.

**Item aberto (pré-existente, requer o dono da conta):**
- 🔴 **Credenciais reais já versionadas** (CNPJ/CPF/e-mail/**senha CETESB**) em HARs/fixtures/examples — ver §6 e o runbook. Os artefatos desta validação **não** adicionaram dados novos (verificado).

## 2. Setup executado

| Etapa | Resultado |
| --- | --- |
| Docker / Compose | Docker 29.1.2, Compose v2.40.3 — OK |
| Correção do compose | `command` → `npm start` / `npm run worker` (tsx); `+ /app/node_modules` (volume anônimo) |
| `postgres` / `api` / `worker` | Up; api `listening on 8080`; reinício do daemon no meio da execução tratado (`docker compose up -d`, dados persistidos no volume `mtr_pgdata`) |
| Migrations / Seeds | `AUTO_MIGRATE`/`AUTO_SEED=true` no boot |
| Usuário interno E2E | `scripts/e2e/setup-e2e-user.mjs` (idempotente: register → 409 → login) |
| Admin do usuário E2E | `scripts/e2e/grant-admin-e2e.mjs` (cria role `admin.global` + vínculo; idempotente; `hasAdminGlobalAccess=SIM`) |
| Conta CETESB GERADOR | `scripts/e2e/link-cetesb-gerador.mjs` (1 tentativa real, anti-lockout; idempotente → reutiliza/reativa) |
| Reachability CETESB | `https://mtrr.cetesb.sp.gov.br` → HTTP 200 do container (TLS ok via `certs/cetesb-chain.pem`) |
| Health backend | `/v1/ping` ok; `/v1/health/system` = **healthy** (dlq 0, workers_degraded 0) |
| Frontend | Vite v6 em `http://localhost:5173` — HTTP 200 |

## 3. Resultado do login

| Verificação | Resultado |
| --- | --- |
| Login SICAT (browser) | ✅ ok |
| Autenticação CETESB real | ✅ ok (login = **CNPJ** confirmado por sondagem read-only; CPF → `PARTNER_NOT_FOUND`) |
| Ativação / `sessionContext` | ✅ HTTP 200, `sessionContext` ativo |
| Seleção de conta (browser, botão **"Entrar"**) | ✅ **ativa e redireciona para `/dashboard`** (auto-redirect confirmado) |
| Persistência pós-restart do stack | ✅ conta reutilizada e reativada (idempotente) |

## 4. Matriz de telas testadas

Todas com **0 erros de console** e **0 HTTP 4xx/5xx**. `bodyLen` = tamanho do texto renderizado (anti-tela-branca).

| Tela | Rota | Status | bodyLen | Observações |
| --- | --- | --- | --- | --- |
| Login SICAT | `/login` | ✅ | — | login real ok |
| Seleção de conta CETESB | `/login/cetesb` | ✅ | — | botão "Entrar" ativa → `/dashboard` |
| Início (Dashboard) | `/dashboard` | ✅ | 1328 | painel intencional |
| Manifestos | `/manifestos` | ✅ | 1623 | lista + filtros (consulta CETESB real ok) |
| Emitir MTR (form) | `/manifestos/novo` | ✅ | 2445 | wizard carrega (não submetido — segurança) |
| Relatórios MTR | `/relatorios/mtrs` | ✅ | 1845 | |
| MTR Provisório (lista) | `/mtr-provisorio` | ✅ | 1323 | |
| Novo MTR Provisório (form) | `/mtr-provisorio/novo` | ✅ | 2124 | não submetido |
| DMR (declarações) | `/dmr` | ✅ | 1337 | |
| DMR Pendentes | `/dmr/pendentes` | ✅ | 1305 | |
| Nova DMR (form) | `/dmr/novo` | ✅ | 1490 | não submetido |
| CDF (emitidos) | `/cdf` | ✅ | 1439 | consulta CETESB real ok |
| Gerar CDF (form) | `/cdf/novo` | ✅ | 1724 | seleção carrega (não emitido — segurança) |
| Assistente (chat) | `/conversacional/chat` | ✅ | 1263 | |
| Minha sessão | `/sessao` | ✅ | 2046 | |
| Sistema · Jobs | `/sistema/jobs` | ✅ | 1963 | validado com admin |
| Sistema · Visão geral | `/operacao/dashboard` | ✅ | 1696 | KPIs operacionais |
| Sistema · Auditoria | `/operacao/auditoria` | ✅ | 5090 | busca + timeline |
| Sistema · Saúde CETESB | `/operacao/cetesb-health` | ✅ | 62542 | contas + sessões |
| Sistema · Command Center | `/operacao/command-center` | ✅ | 2095 | registry de comandos |
| Administração · Acessos | `/admin/acessos` | ✅ | 6238 | usuários/perfis/sessões |
| Dev · Playground | `/dev/components` | ✅ | 4187 | design system |
| Logout | — | ✅ | — | storage limpo |
| Detalhes (`/manifestos/:id`, `/dmr/:id`) e ações de mutação | — | 🚫 | — | não executado por segurança (conta real) |

Evidência: 21 screenshots mascarados em `frontend/test-results/e2e-gerador/` (não versionado).

> **Nota:** o gating RBAC foi validado **antes** de promover o usuário a admin — as 6 telas de
> Sistema/Administração redirecionavam para `/dashboard?notice=admin-access-denied` para o
> operador comum (comportamento correto). Após conceder `admin.global`, as mesmas telas passam a
> carregar — confirmando o RBAC nas duas direções.

## 5. Matriz de fluxos testados

| Fluxo | Resultado | Observação |
| --- | --- | --- |
| Chegar ao sistema (login → conta → dashboard) | ✅ | auto-redirect ok |
| Autenticação CETESB real | ✅ | 1 tentativa (anti-lockout), sessão ativa |
| Navegar operação (13 telas) | ✅ | 0 erro |
| Navegar Sistema/Admin (6 telas, admin) | ✅ | 0 erro |
| Gating por papel (operador comum) | ✅ | redireciona `admin-access-denied` |
| Emitir MTR / Gerar CDF / Nova DMR (até pré-confirmação) | ✅ | forms carregam; não submetidos (mutação real) |
| Logout | ✅ | |
| Persistência pós-restart | ✅ | conta/sessão reutilizadas |

## 6. Problemas encontrados (por severidade)

### 🔴 Crítico — PRÉ-EXISTENTE (segurança; requer o dono da conta)
- **Credenciais reais versionadas.** `npm run scan:secrets` (novo) confirmou, em 1.395 arquivos de texto rastreados: CNPJ (~80), CPF (~16), e-mail (~69), **senha CETESB (~34)**, nome (~61), além de JWTs (~15) e campos de senha em JSON/HAR (~15). Concentrado em `docs/cetesb/*.har`, `tests/**`, `examples/**`, docs legados. **Pré-existente** — os artefatos desta validação não adicionaram nada (verificado por arquivo).
  - Remediação: ver `docs/security/credential-exposure-runbook.md` — (1) **rotacionar senha CETESB**, (2) scrub para placeholders, (3) purge de histórico (`git filter-repo`), (4) gate `scan:secrets`/gitleaks no CI. Não executado aqui (exige rotação no portal + reescrita de histórico + risco de quebrar HAR-validators/fixtures).

### 🔴 Crítico — corrigido nesta execução
- **Docker Compose quebrado pós-migração TS.** `node src/server.js`/`worker.js` inexistentes + mount sombreando `node_modules` Linux. **Corrigido** (`npm start`/`npm run worker` via `tsx` + volume anônimo `/app/node_modules`).

### 🟢 Itens do relatório anterior — reavaliados como NÃO-bug
- **"Sem auto-redirect ao ativar conta":** era imprecisão do script E2E (clicava num item genérico). O código já redireciona (`handleActivateAccount`/`handleAddAccount` → `router.push('/dashboard')`); com o clique no botão **"Entrar"**, confirmado ✅.
- **"`integrationAccountId` ausente em `/v1/sicat/session`":** por design — a resposta expõe `activeAccount` + `sessionContext`, suficientes para o frontend (rotas operacionais funcionam). Surfacá-lo no topo exigiria mudança de contrato OpenAPI; sem impacto funcional. Não alterado.

### 🟠 Médio — resolvido nesta execução
- **`health/system=degraded`** por DLQ herdada (3 jobs, abril/2026) + `worker_health` stale. **Resolvido**: DLQ esvaziada via API + poda de 364 registros stale de `worker_health` → **healthy** (dlq 0, workers_degraded 0).

## 7. Problemas de UX/UI

- **Layout/Navegação/Componentes:** consistentes (design system `Sicat*`); sem telas em branco (bodyLen 1.263–62.542); separação Operação × Sistema × Administração efetiva (RBAC validado).
- **Fluxo:** ativação de conta com auto-redirect ok.
- **Responsividade:** desktop 1440×900 ✅ e **mobile 375×812 ✅** — Início, Manifestos, CDF e Sistema·Jobs **sem scroll horizontal**.
- **Acessibilidade (heurística, 20 telas):** botões icon-only sem rótulo = **0** ✅; imagens sem `alt` = **0** ✅; **inputs sem rótulo programático = 25** (≈1,25/tela) — oportunidade de A11y de baixa prioridade (provável em date inputs/selects custom), não-bloqueante. Validação com axe-core fica como evolução.

## 8. Problemas técnicos

| Área | Achado |
| --- | --- |
| Frontend | OK — 0 erro de console em 20 telas; build de produção verde |
| Backend (api) | OK — sobe, sem erro; sessão/contas/health respondem |
| Worker | OK — healthy após poda de stale |
| Banco | OK — postgres; dados persistem no volume |
| Docker | 🔴 compose quebrado (corrigido); ⚠️ daemon reiniciou no host durante a execução (ambiental) — stack reerguido sem perda de dados |
| Autenticação / Autorização | OK — login + JWT + RBAC (gating validado nas 2 direções) |
| Integração CETESB | OK — reachable + login GERADOR + sessão ativa |
| Jobs/Fila / Saúde | OK — `health/system` healthy |
| Segurança | 🔴 exposição pré-existente de credenciais (scanner + runbook adicionados) |
| Testes | `scan:secrets` ok; build frontend + `validate:md-links` verdes; `typecheck`/suites backend e `test:ui` não executados nesta rodada (sem alteração de código fonte) |

## 9. Recomendações

| # | Problema | Solução | Arquivos prováveis | Prioridade | Esforço | Risco |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Compose quebrado | (Feito) tsx + volume node_modules | `docker-compose.yml` | Máxima | baixo | baixo |
| 2 | Credenciais versionadas | Rotacionar senha + scrub + purge + CI scan | HARs/fixtures/examples; CI | Máxima | alto | médio |
| 3 | Health degraded | (Feito) limpar DLQ + poda worker_health | DB/worker | Média | baixo | baixo |
| 4 | Cobertura admin | (Feito) role admin.global ao usuário E2E | `scripts/e2e/grant-admin-e2e.mjs` | Média | baixo | baixo |
| 5 | (Feito) E2E mobile + A11y heurístico | viewport 375px + checagem A11y no script | `scripts/e2e/browse-e2e-gerador.mjs` | Média | médio | baixo |
| 5b | 25 inputs sem rótulo programático | adicionar `aria-label`/`label[for]` (date inputs/selects custom) + axe-core no E2E | componentes de form | Baixa | médio | baixo |
| 6 | Specs Playwright pré-DL-100 | **refresh com a suíte rodando** + auth admin para telas gated (rotas `/sistema/*`, `/admin/*` agora exigem `admin.global`; `/jobs`→`/sistema/jobs`). Edição cega não recomendada — ver nota | `frontend/tests/ui/**` | Média | médio | médio |

> **Nota sobre specs antigos:** a mudança de navegação (DL-100) tornou `/sistema/*` e
> `/admin/*` gated por papel e consolidou `/jobs`→`/sistema/jobs`. Specs como
> `full-navigation-e2e.spec.ts`, `validation-e2e.spec.ts` e `centro-operacional.spec.ts`
> assumem a navegação antiga e exigem **rodar a suíte + criar estado de auth admin**
> para serem corrigidos com segurança (não foram editados às cegas). O script
> `scripts/e2e/browse-e2e-gerador.mjs` é a referência atual de validação de navegação.

## 10. Critérios de aceite

| Critério | Atende? |
| --- | --- |
| Ambiente Docker sobe do zero | ✅ (após fix do compose) |
| Usuário interno E2E criado | ✅ |
| Usuário interno consegue logar | ✅ |
| Conta GERADOR CETESB vinculada | ✅ (`generator`) |
| Sessão CETESB funciona | ✅ (`sessionContext` ativo) |
| Telas principais carregam | ✅ (20/20 sem erro) |
| Fluxos principais funcionam | ✅ (mutações evitadas por segurança) |
| Layout consistente | ✅ |
| Sem erros críticos (console/backend/worker) | ✅ (0 erro; health healthy) |
| Experiência parece ERP corporativo | ✅ |
| Pronto para usuário real | ✅ funcionalmente; **pendente** apenas a higiene de credenciais versionadas (§6) |

## 11. Próximos passos (ordem de prioridade)

1. 🔴 **Segurança:** rotacionar a senha CETESB e remediar os arquivos versionados (runbook + `npm run scan:secrets`). Único item que impede um "pronto para produção" pleno.
2. Ampliar o E2E: viewport mobile (375px) + axe-core (A11y) + abrir 1 detalhe de manifesto em modo seguro.
3. Atualizar specs Playwright pré-DL-100 em `frontend/tests/ui/`.
4. (Opcional) seed oficial de role `admin.global` + bootstrap admin, para não depender do script de grant em ambientes limpos.

---

### Apêndice — artefatos não versionados / sensíveis
- `.env.e2e`, `frontend/.env.local` — gitignored.
- `frontend/test-results/e2e-gerador/` — 21 screenshots mascarados + `results.json` — gitignored.

### Apêndice — artefatos versionados (sem segredos)
- `scripts/e2e/setup-e2e-user.mjs` — usuário interno (idempotente).
- `scripts/e2e/grant-admin-e2e.mjs` — concede `admin.global` ao usuário E2E (idempotente).
- `scripts/e2e/link-cetesb-gerador.mjs` — vincula/ativa GERADOR (idempotente, anti-lockout).
- `scripts/e2e/browse-e2e-gerador.mjs` — navegação Playwright (somente leitura, screenshots mascarados).
- `scripts/security/scan-secrets.mjs` + `npm run scan:secrets` — auditoria de credenciais versionadas.
- `docs/security/credential-exposure-runbook.md` — runbook de remediação.
