# 05 - Domain Rules

## Objetivo da fase

Garantir que o botão Ressinc. CETESB execute o fluxo operacional completo sem intervenção manual:
- limpeza local aplicável do espelho de manifestos;
- recarga/sincronização forçada com a CETESB;
- feedback de estado claro no frontend.

## Causa raiz

1. O fluxo de forceSync no backend não limpava o espelho local de manifestos CETESB quando havia retorno remoto com itens.
2. Na prática, registros locais antigos de origem `cetesb.search` podiam permanecer e “contaminar” a visão sincronizada, levando à percepção de que a ressincronização do botão não executava o reset esperado.
3. O frontend apresentava sucesso genérico sem detalhar quantos registros foram recarregados/limpos, dificultando confirmação operacional.

## Decisões de regra operacional

1. No `forceSync`, limpar primeiro o espelho local CETESB no intervalo da sincronização e depois recarregar do remoto.
2. No `forceSync` sem intervalo explícito (`dateFrom`/`dateTo`), considerar janela aberta (`null/null`) para reset de espelho completo da conta de integração.
3. Expor resumo de sincronização no retorno (`syncSummary`) para permitir feedback operacional no frontend.

## Arquivos analisados

- `frontend/src/views/ManifestsView.vue`
- `frontend/src/services/api.js`
- `src/routes/api-routes.ts`
- `src/services/manifest-service.ts`
- `src/repositories/manifest-repo.ts`
- `scripts/reset-manifest-domain.js`
- `tests/integration/manifest-list-search.test.js`
- `frontend/tests/ui/manifests-resync.spec.js`

## Arquivos alterados

- `src/services/manifest-service.ts`
  - ajuste da janela de sincronização forçada;
  - limpeza de espelho local no `forceSync` antes do upsert remoto;
  - inclusão de `syncSummary` no payload de resposta em sincronização forçada.

- `frontend/src/views/ManifestsView.vue`
  - botão de ressync passa a acionar `forceSync` sem restringir por filtro de data local;
  - feedback de sucesso agora usa `syncSummary` (itens remotos processados + itens locais limpos).

- `tests/integration/manifest-list-search.test.js`
  - novo teste cobrindo limpeza de espelho local no `forceSync` com manutenção apenas dos itens retornados pela CETESB.

## Validação executada

1. Backend integração (focado):
- comando: `npm run test:integration -- tests/integration/manifest-list-search.test.js`
- resultado: passou (incluindo novo caso "deve limpar espelho local cetesb.search no forceSync...").

2. Frontend UI (focado):
- comando: `npm --prefix frontend exec playwright test tests/ui/manifests-resync.spec.js --reporter=list`
- resultado: falhou por ambiente/baseURL inválida no `page.goto('/manifestos')` (não relacionado à lógica alterada).

3. Checagem de erros por arquivo alterado:
- `frontend/src/views/ManifestsView.vue`: sem erros.
- `tests/integration/manifest-list-search.test.js`: sem erros.
- `src/services/manifest-service.ts`: aviso de complexidade cognitiva pré-existente na função `listManifests`.

## Impacto backend/frontend

- Backend: comportamento de `forceSync` alinhado com regra operacional de reset+recarga do espelho local.
- Frontend: feedback mais rastreável para o operador sobre resultado da ressincronização.

## Handoff para próxima fase

Próximo agente recomendado: `tester-qa-mtr`.

Escopo sugerido para QA:
- validar E2E real do botão Ressinc. CETESB com conta ativa;
- confirmar remoção de registros antigos do espelho local após forceSync;
- confirmar recarga remota e feedback visual (`resyncFeedback`) com contagens.
