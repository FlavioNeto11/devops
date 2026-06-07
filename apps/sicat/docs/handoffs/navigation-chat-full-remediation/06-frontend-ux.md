# 06 - Frontend UX

## Objetivo da fase

Corrigir achados de navegacao e filtros de periodo reportados na auditoria anterior, com foco em:

- validacao explicita para periodo invertido;
- reduzir chamadas desnecessarias quando entrada e invalida;
- alinhar mensagens UX entre Manifestos, Relatorio MTR e CDF emitidos;
- eliminar redirecionamento silencioso em acesso negado a Admin.

## Diagnostico

Achados confirmados em codigo:

1. Manifestos e Relatorio MTR tinham autocorrecao silenciosa do range de datas (ao inverter datas, a UI ajustava sem feedback), o que mascarava erro de entrada e permitia consultas inconsistentes.
2. CDF emitidos nao validava periodo invertido e tentava consulta mesmo em cenarios invalidos, incluindo janela ampla alem do limite conhecido (31 dias), gerando ruido tecnico na chamada.
3. Guarda de rota para Admin fazia redirecionamento direto para dashboard sem mensagem explicita de permissao.
4. Nao havia utilitario comum de validacao de periodo; comportamento variava por tela.

## Decisoes tecnicas

1. Criar utilitario compartilhado de validacao de intervalo de datas para padronizar regra e mensagens:
   - periodo invertido invalido;
   - datas malformadas invalidas;
   - limite maximo opcional por tela (ex.: CDF 31 dias).
2. Em Manifestos e Relatorio MTR:
   - bloquear execucao da busca quando periodo for invalido;
   - manter mensagem informativa para janela ampla (orientacao operacional), sem quebrar contrato e sem impor limite nao confirmado pelo backend.
3. Em CDF emitidos:
   - bloquear chamada quando periodo invertido;
   - bloquear chamada quando janela excede 31 dias, exibindo mensagem clara ao usuario.
4. Em acesso Admin:
   - manter redirecionamento para dashboard (sem alterar fluxo geral), mas anexar aviso de permissao negada;
   - exibir alerta dismissivel no dashboard para remover comportamento silencioso.

## Arquivos alterados

- frontend/src/utils/date-range-validation.js
- frontend/src/views/ManifestsView.vue
- frontend/src/views/ManifestReportView.vue
- frontend/src/views/CdfListView.vue
- frontend/src/router.js
- frontend/src/views/DashboardView.vue

## Validacoes executadas

1. Lint/compile checks nos arquivos alterados via analise de erros do workspace: sem erros pendentes.
2. Build frontend:
   - comando: npm run build (em frontend/)
   - resultado: sucesso.
3. UI validation focada:
   - comando: npx playwright test tests/ui/validation-e2e.spec.ts --reporter=list
   - resultado: 5 passed.
4. Auditoria UI complementar:
   - task: shell: frontend: test:ui:validation (audit + validacao)
   - resultado observado: testes de auditoria executados com sucesso na rodada registrada.

## Riscos residuais

1. Incoerencia entre recorte curto e recorte amplo em Manifestos/Relatorio MTR pode ter causa de backend/integracao; frontend agora orienta melhor, mas nao altera semantica de resposta da API.
2. Mensagem de janela ampla em Manifestos/Relatorio e orientativa (nao bloqueante), porque limite hard de backend nao foi confirmado para esses endpoints nesta fase.
3. Build reportou aviso de chunk grande (bundle), sem impacto funcional imediato para esta remediation.

## Handoff para fase 03 (chat consistency / backend)

- proximo agente esperado: programador-backend-mtr
- status: next_agent_required

Prompt sugerido para fase 03:

Investigar e corrigir a consistencia de retorno entre recortes de periodo curto vs amplo nos endpoints usados por Manifestos e Relatorio MTR, preservando contratos atuais. Contexto frontend ja corrigido: periodo invertido agora e bloqueado na UI e janela ampla recebe orientacao, mas a divergencia de dados permanece quando o backend retorna vazio no recorte amplo contendo um recorte curto com dados. Validar especialmente a cadeia de filtros dateFrom/dateTo, paginação e quaisquer limites de integracao CETESB/cache no backend. Entregar diagnostico de causa raiz, ajuste de codigo e evidencias de teste (incluindo contrato e regressao).
