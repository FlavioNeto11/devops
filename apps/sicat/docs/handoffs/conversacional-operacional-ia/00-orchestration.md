# Orquestracao - conversacional-operacional-ia

## Demanda resumida
Planejar a execucao da camada conversacional operacional do SICAT com base no estado atual de backend/frontend, separacao por canal, governanca e seguranca por canal, documentacao canonica e incorporacao futura na homepage.

## Classificacao

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "meta"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "persistence-worker"
    - "domain-rules"
    - "frontend-ux"
    - "observability-admin"
    - "access-control"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "introduzir dominio conversacional no backend sem quebrar contrato atual"
    - phase: "04-persistence-worker"
      agent: "postgres-queue-mtr"
      required: true
      reason: "criar schema/repositorios e trilha auditavel da conversa"
    - phase: "08-access-control"
      agent: "perfis-acessos-admin-mtr"
      required: true
      reason: "aplicar policy por canal e risco para evitar bypass"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "entregar popup interno, app simplificado e capitulo da homepage"
    - phase: "07-observability-admin"
      agent: "dashboard-observability-mtr"
      required: true
      reason: "instrumentar metricas, action logs e correlacao operacional"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar riscos por canal, fallback e regressao"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar documentacao canonica e criterio de rollout"
```

## Criterios de pronto da orquestracao
- Escopo da camada conversacional delimitado por canal (WhatsApp, app simplificado, assistente interno).
- Plano faseado com dependencias tecnicas e de governanca.
- Mapeamento de arquivos candidatos por fase para execucao guiada.
- Riscos e gates de seguranca definidos por risco/canal.
- Ordem de implementacao recomendada para reduzir risco de regressao.

## Checkpoints esperados
- docs/handoffs/conversacional-operacional-ia/01-source-validation.md (somente se houver nova evidencia externa)
- docs/handoffs/conversacional-operacional-ia/03-backend-contracts.md
- docs/handoffs/conversacional-operacional-ia/04-persistence-worker.md
- docs/handoffs/conversacional-operacional-ia/06-frontend-ux.md
- docs/handoffs/conversacional-operacional-ia/07-observability-admin.md
- docs/handoffs/conversacional-operacional-ia/08-access-control.md
- docs/handoffs/conversacional-operacional-ia/09-qa-validation.md
- docs/handoffs/conversacional-operacional-ia/10-documentation-final.md

## Execucao desta rodada - Fase 6 (primeira onda)

- Data: 2026-04-23
- Escopo solicitado: hardening, telemetria, testes, fallback e readiness, sem WhatsApp.

### Cadeia executada

1. `programador-backend-mtr`: hardening do backend conversacional com telemetria essencial, fallback seguro em falha de provider e readiness operacional da camada conversacional nativa.
1. `frontend-vue-ux-mtr`: fechamento dos gaps de cobertura automatizada da Fase 5 no app simplificado.
1. `tester-qa-mtr`: validacao independente da Fase 6 com resultado aprovado.
1. `documentador-mtr`: consolidacao documental final com status atualizado da primeira onda.

### Resultado consolidado

- Fase 6 concluida/aprovada.
- Validacoes desta rodada:
  - typecheck: PASSOU;
  - unitarios focais: 6 passed / 0 failed;
  - Playwright focal app simplificado: 6 passed / 0 failed.
- Fase 7 (WhatsApp) mantida como pendente de segunda onda.

## Execucao desta rodada - Arquitetura multiagente operacional (2026-04-23)

## Demanda resumida desta rodada
Elevar a IA conversacional do SICAT para um modelo multiagente com decisao mais forte e resposta aderente a pedidos compostos do usuario (ex.: cancelar os 3 manifestos mais recentes ignorando o primeiro; replicar manifesto com alteracao de motorista e placa), com fluxo de informacao mais fluido entre contexto, ferramentas e resposta final.

## Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "implement"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "access-control"
    - "persistence-worker"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "definir agente principal, roteamento para especialistas e protocolo de tools/decisao"
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "traduzir pedidos compostos em plano operacional seguro e executavel"
    - phase: "08-access-control"
      agent: "perfis-acessos-admin-mtr"
      required: true
      reason: "garantir guardrails para acoes destrutivas/parciais e confirmacao explicita"
    - phase: "04-persistence-worker"
      agent: "postgres-queue-mtr"
      required: true
      reason: "persistir plano/decisoes, trilha de execucao e estado multi-step"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar cenarios compostos, regressao e coerencia da resposta final"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar arquitetura agente-principal/especialistas e runbook"
```

## Criterios de pronto desta rodada
- Agente principal com roteamento deterministico/LLM para especialistas por intencao.
- Especialistas com tools explicitas por dominio e contrato de entrada/saida.
- Camada de planejamento multi-etapas para pedidos compostos com filtros (ex.: ignorar primeiro mais recente).
- Execucao segura para acoes sensiveis com confirmacao e trilha auditavel por passo.
- Resposta final consolidada e compreensivel para o usuario (o que foi entendido, decidido e executado).

## Execucao desta rodada - Refinamento de fluidez e decisao (2026-04-23)

### Demanda resumida desta rodada
Evidencia real de conversa mostra que a IA ainda responde de forma limitada para pedidos operacionais compostos e nao retorna a resposta no formato esperado pelo usuario. Objetivo: elevar fluidez da informacao e poder de decisao com arquitetura de agente principal + especialistas com tools, incluindo execucao composta confiavel.

### Escopo obrigatorio desta rodada
1. Melhorar entendimento de pedidos compostos em linguagem natural no canal operacional.
2. Fortalecer orquestracao do agente principal para acionar especialistas e consolidar resposta final orientada ao que o usuario pediu.
3. Garantir resposta aderente para casos prioritarios:
  - cancelar os 3 manifestos mais recentes ignorando o mais recente;
  - replicar manifesto especifico alterando caminhoneiro e placa.
4. Tornar saida mais fluida para o usuario, com explicacao clara de entendimento, criterio de selecao e resultado.

### Encaminhamento da cadeia
- Fase imediata: `03-backend-contracts` com `programador-backend-mtr` para implementar refinamento de planner/orquestrador/especialistas e contrato de resposta.
- Sequencia apos implementacao: `05-domain-rules` -> `08-access-control` -> `04-persistence-worker` -> `09-qa-validation` -> `10-documentation-final`.

### Status atualizado da cadeia (2026-04-23)
- `03-backend-contracts`: concluida por `programador-backend-mtr` nesta rodada, com typecheck OK e testes focais conversacionais passando.
- Handoff imediato: `09-qa-validation` com `tester-qa-mtr` para validacao integrada dos cenarios compostos mandatórios.

### Status atualizado da cadeia (2026-04-23 - pos QA)
- `09-qa-validation`: concluida por `tester-qa-mtr` sem findings de severidade alta/media/baixa para os fluxos compostos mandatórios.
- Evidencias registradas no checkpoint de QA com testes integrados e regressao focal passando.
- Handoff imediato: `10-documentation-final` com `documentador-mtr` para consolidacao final da rodada.

## Execucao desta rodada - Resposta natural e push inicial (2026-04-23)

### Demanda resumida
Evidencia real: para "qual o meu terceiro manifesto mais recente?" a IA retornou dados crus de tool (`manifest.list_recent_top, Criterio aplicado:...`) em vez de resposta generativa em linguagem natural. Alem disso, usuario solicitou commit e push do estado atual do repositorio antes da correcao.

### Sequência definida
1. `ci-cd-github-mtr`: commit + push do estado atual do repositorio (pre-correcao).
2. `programador-backend-mtr`: corrigir sintese final para resposta sempre em linguagem natural; nunca expor labels internos de tool ao usuario.
3. `tester-qa-mtr`: validar correcao com cenario `qual o meu terceiro manifesto mais recente?`.
4. `documentador-mtr`: atualizar checkpoints.

### Status
- Fase git: concluida por `ci-cd-github-mtr` com commit inicial `7cab978` e push realizado.
- Fase de correcao de resposta natural: concluida por `programador-backend-mtr`.
- Fase de validacao da correcao: concluida por `tester-qa-mtr` com aprovacao (236/236 testes passando).
- Status consolidado da rodada: concluida e aprovada para fechamento documental.

## Execucao desta rodada - Correcao de memoria conversacional LangGraph (2026-04-23)

### Demanda resumida

Memoria conversacional nao persistia entre turnos: o grafo LangGraph era criado sem checkpointer e sem `thread_id` por sessao, fazendo cada turno comecar com contexto vazio.

### Cadeia executada

1. `programador-backend-mtr`: implementacao de `MemorySaver` + `buildConversationThreadId` em `src/services/conversation/llm-provider.ts`.
2. `tester-qa-mtr`: criacao de suite de integracao multi-turno (`tests/integration/conversation-multiturn-memory.test.js`) e validacao 11/11 testes aprovados.
3. `documentador-mtr`: consolidacao documental desta rodada.

### Status atualizado da cadeia (2026-04-23 - pos QA memoria)

- `programador-backend-mtr`: concluido — `MemorySaver` + `thread_id` implementados, typecheck OK.
- `tester-qa-mtr`: concluido — 11/11 testes passando (3 unit LangGraph + 6 unit policy + 2 integracao multi-turno).
- `documentador-mtr`: concluido — checkpoints 09 e 10 atualizados.
- **Status consolidado da rodada: CONCLUIDA E APROVADA.**

### Risco residual registrado

- `MemorySaver` in-process: requer substituicao por checkpointer externo em deploy multi-instancia.

## Execucao desta rodada - Paridade conversacional com dashboard de manifestos (2026-04-23)

### Demanda resumida

Resposta conversacional ainda limitada para dados operacionais de manifestos. Usuario reporta que o chat deve ter acesso aos mesmos dados do dashboard (incluindo datas e campos consolidados) e capacidade operacional equivalente, com sintese util ao inves de respostas truncadas ou fallback consultivo indevido.

### Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "fix"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "access-control"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "expandir ferramentas de manifesto no chat para dados ricos e consolidacao por lote"
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "garantir equivalencia operacional com dashboard mantendo regras de negocio"
    - phase: "08-access-control"
      agent: "perfis-acessos-admin-mtr"
      required: true
      reason: "preservar guardrails para operacoes sensiveis e escopo por conta/sessao"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar cenarios de dados enriquecidos, consolidacao e regressao"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar comportamento esperado e evidencias"
```

### Cadeia imediata iniciada

1. `programador-backend-mtr`: em execucao para ampliar acesso conversacional aos dados de manifestos com datas e detalhamento equivalente ao dashboard, incluir consolidacao em uma resposta util e robustecer fallback de provider.

### Status atualizado da cadeia (2026-04-23 - pos QA/documentacao)

- `programador-backend-mtr`: concluido com ampliacao de dados ricos de manifestos, memoria de sessao para follow-up e fallback deterministico util.
- `tester-qa-mtr`: concluido com aprovacao independente (14/14 testes passando).
- `documentador-mtr`: concluido com consolidacao final dos checkpoints 10 e 00.
- **Status consolidado da rodada: CONCLUIDA E APROVADA.**

### Status atualizado da cadeia (2026-04-23 - pos QA e documentacao)

- `03-backend-contracts`: concluida com implementacao de dados ricos de manifesto, memoria para follow-up e fallback deterministico no fluxo conversacional.
- `09-qa-validation`: concluida e aprovada com evidencia oficial da rodada de paridade conversacional:
  - comando: `npx tsx --test tests/integration/conversation-composed-operations.test.js tests/unit/conversation-service-fallback.test.js tests/unit/conversation-policy-service.test.js`;
  - resultado: **14/14 testes passando**.
- `10-documentation-final`: concluida com consolidacao do problema reportado, solucao aplicada, evidencias de QA e estado final da rodada.

### Fechamento desta rodada

- **Cadeia desta rodada: CONCLUIDA E APROVADA.**
- Sem pendencias abertas para o escopo de paridade conversacional com dashboard de manifestos.

## Execucao desta rodada - Estabilidade pos-primeira mensagem e renderizacao bonita no chat (2026-04-23)

### Demanda resumida

Usuario reporta regressao operacional: apos a primeira resposta, o chat passa a retornar fallback de indisponibilidade do provider para mensagens subsequentes no mesmo contexto. Tambem reporta formatacao ruim da primeira resposta (saida longa e "estranha"), pedindo renderizacao mais bonita e legivel no chat.

### Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "fix"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "remover dependencia fragil do provider apos primeiro turno e garantir fallback util em continuidade"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "melhorar apresentacao de respostas com dados tabulares/listas de manifesto"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar nao-regressao no fluxo multi-turno e qualidade visual da resposta"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar correcoes e evidencias finais"
```

### Cadeia imediata iniciada

1. `programador-backend-mtr`: em execucao para corrigir erro recorrente apos primeira mensagem no mesmo contexto e garantir continuidade util sem travar em fallback consultivo.

## Execucao desta rodada - Cartoes de manifesto na resposta conversacional (2026-04-23)

### Demanda resumida

Apos estabilizacao backend e renderizacao estruturada basica, usuario aprovou continuidade para evoluir a resposta visual no chat em formato de cartoes por manifesto, com secoes claras e leitura mais proxima do dashboard.

### Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "implement"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "apresentar manifestos em cartoes com secoes de resumo, gerador, transporte e destino"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar legibilidade, responsividade e ausencia de regressao"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "registrar padrao visual final e evidencias"
```

### Cadeia imediata iniciada

1. `frontend-vue-ux-mtr`: em execucao para implementar cartoes por manifesto na camada de renderizacao estruturada do chat operacional.

### Status atualizado da cadeia (2026-04-23 - pos QA/documentacao da rodada de cartoes)

- `06-frontend-ux`: concluida com implementacao de cartoes por manifesto no chat operacional, incluindo agrupamento por item e secoes `Resumo`, `Gerador`, `Transporte` e `Destino`.

## Execucao desta rodada - Orquestracao por camadas de agentes sem heuristica (2026-04-23)

### Demanda resumida

Usuario reporta dois gaps centrais: (1) memoria aparentemente guarda perguntas, mas nao consolida corretamente respostas/estado assistente em turnos seguintes; (2) consulta objetiva de dominio (`quem e o gerador do manifesto 260011455990`) falha. Solicitacao explicita: remover dependencia de heuristica para inferencia de intencao e adotar estrutura em camadas de agentes com cadenciamento e orquestracao para definir intencao e executar ferramentas.

### Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "refactor"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "access-control"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "introduzir pipeline por camadas de agentes (intencao, planejamento, execucao, sintese) sem fallback heuristico de intencao"
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "garantir que perguntas operacionais de manifesto retornem dados corretos de origem/gerador e contexto de conjunto"
    - phase: "08-access-control"
      agent: "perfis-acessos-admin-mtr"
      required: true
      reason: "preservar guardrails de operacoes sensiveis na nova arquitetura por agentes"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar memoria de respostas, continuidade de contexto e consultas diretas por manifesto"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar arquitetura final e evidencias da rodada"
```

### Cadeia imediata iniciada

1. `programador-backend-mtr`: em execucao para remover inferencia heuristica de intencao e substituir por orquestracao em camadas de agentes com memoria consolidada de turno completo.
- `09-qa-validation`: concluida e aprovada com evidencia oficial da rodada:
  - `conversation-structured-rendering.spec.js`: **2/2**;
  - `validation-e2e.spec.ts`: **5/5**;
  - total: **7/7 passando**.
- `10-documentation-final`: concluida com consolidacao do objetivo da rodada, mudancas de UX, evidencias de QA e status final.

### Fechamento desta rodada (cartoes por manifesto)

- **Cadeia desta rodada: CONCLUIDA E APROVADA.**
- Fases desta rodada marcadas como concluidas: `06`, `09` e `10`.

### Status atualizado da cadeia (2026-04-23 - pos QA/documentacao)

- `03-backend-contracts`: concluida com correcao de continuidade pos-primeiro-turno, expansao do parser deterministico para follow-up por atributo e resposta local para saudacoes sem loop de fallback.
- `06-frontend-ux`: concluida com renderer estruturado para respostas de manifesto (listas, bullets e chave-valor), com destaque de campos-chave e melhoria de legibilidade no app conversacional e no assistente interno.
- `09-qa-validation`: concluida e aprovada com evidencia oficial da rodada:
  - planner unitario: 7/7;
  - fallback unitario: 2/2;
  - integracao composta backend: 6/6;
  - frontend renderizacao estruturada: 2/2;
  - total: **17/17 passando**.
- `10-documentation-final`: concluida com consolidacao de problema observado, causa raiz, solucoes backend/frontend, evidencias e riscos residuais.

### Fechamento desta rodada

- **Cadeia desta rodada: CONCLUIDA E APROVADA.**
- Sem pendencias abertas para o escopo desta correcao (erro apos primeira mensagem, fallback repetitivo e renderizacao de respostas de manifesto).

## Execucao desta rodada - Consolidacao final (2026-04-23)

### Demanda resumida

Consolidacao final da rodada `conversacional-operacional-ia` com fechamento tecnico-documental dos checkpoints oficiais de backend, regras de dominio, controle de acesso e QA independente.

### Status final das fases solicitadas

- `03-backend-contracts`: **CONCLUIDA/APROVADA**
- `05-domain-rules`: **CONCLUIDA/APROVADA**
- `08-access-control`: **CONCLUIDA/APROVADA**
- `09-qa-validation`: **CONCLUIDA/APROVADA**
- `10-documentation-final`: **CONCLUIDA/APROVADA**

### Evidencia consolidada desta rodada

- QA independente oficial registrado em `09-qa-validation` com **31/31 testes passando**.
- Requisitos validados na cadeia:
  - arquitetura em camadas de agentes como caminho principal;
  - memoria de turno completo (usuario + assistente);
  - lookup correto de gerador por manifesto;
  - isolamento cross-account com mesma `conversationSessionId`.

### Fechamento

- **Rodada final: CONCLUIDA E APROVADA.**
- Sem pendencias abertas para os requisitos desta consolidacao.

## Execucao desta rodada - Fechamento regex semantico removido (2026-04-23)

### Demanda resumida

Fechar documentalmente a rodada de remocao da inferencia semantica por regex no fluxo conversacional, consolidando decisao arquitetural e aprovacao de QA.

### Status final das fases desta rodada

- `03-backend-contracts`: **CONCLUIDA/APROVADA** (remocao da inferencia semantica por regex no caminho deterministico).
- `09-qa-validation`: **CONCLUIDA/APROVADA** (evidencia consolidada de **34/34 testes passando**).
- `10-documentation-final`: **CONCLUIDA/APROVADA** (fechamento documental da rodada).

### Fechamento

- **Cadeia desta rodada: CONCLUIDA E APROVADA.**
- Sem pendencias abertas para o escopo desta rodada.

## Execucao desta rodada - Busca ampla de manifestos com filtros flexiveis (2026-04-23)

### Demanda resumida

Usuario solicita ampliar capacidade de consulta de manifestos para suportar mais formas de pergunta, incluindo filtros por intervalo de datas (ex.: "entre o dia 17 e o dia 20 de abril de 2026") e variacoes de linguagem natural.

### Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "implement"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "introduzir parser/contrato de filtros temporais e normalizacao de consultas de manifesto na camada de agentes"
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "garantir semantica operacional correta para intervalos, ordenacoes e combinacoes de filtros"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar consultas por intervalo de datas e variacoes de linguagem sem regressao"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar padrao de busca e evidencias"
```

### Cadeia imediata iniciada

1. `programador-backend-mtr`: em execucao para ampliar entendimento de consultas de manifesto com filtros de data e variacoes de linguagem natural.

### Status atualizado da cadeia (2026-04-23 - pos QA/documentacao)

- `03-backend-contracts`: concluida com suporte de consulta por intervalo temporal em linguagem natural e combinacoes com ordenacao temporal.
- `09-qa-validation`: concluida e aprovada com evidencia oficial da rodada:
  - `conversation-recency-direction.test.js`: **7/7**;
  - `conversation-planner-output.test.js`: **7/7**;
  - `conversation-composed-operations.test.js`: **13/13**;
  - total: **27/27 passando**.
- `10-documentation-final`: concluida com consolidacao de capacidade, regressao sem filtro temporal e evidencias de QA.

### Fechamento desta rodada

- **Cadeia desta rodada: CONCLUIDA E APROVADA.**
- Sem pendencias abertas para o escopo de busca ampla com intervalo temporal e variacoes de linguagem natural.

## Execucao desta rodada - Copiloto operacional component-first e pedidos compostos (2026-04-25)

### Demanda resumida

Evoluir a camada conversacional operacional para operar o SICAT de ponta a ponta com arquitetura robusta orientada a intencoes/entidades/tools/memoria/planner, cobrindo pedidos compostos, lotes, CDF/CDR, artifacts (PDF/ZIP), normalizacao central de resultados e renderizacao component-first consistente no frontend.

### Classificacao desta rodada

```yaml
orchestration:
  work_id: "conversacional-operacional-ia"
  intent: "implement"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "domain-rules"
    - "persistence-worker"
    - "access-control"
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "diagnosticar lacunas atuais, expandir tool registry, planner, entity resolver, memoria operacional e normalizador component-first no backend"
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "assegurar semantica operacional de manifestos, agrupamentos, lotes, replicacao segmentada e criacao guiada"
    - phase: "04-persistence-worker"
      agent: "postgres-queue-mtr"
      required: true
      reason: "consolidar lifecycle de artifacts, vinculos com sessao/correlation/job e resiliencia de jobs/documentos/ZIP"
    - phase: "08-access-control"
      agent: "perfis-acessos-admin-mtr"
      required: true
      reason: "atualizar policy por tool/risco/canal, confirmacao explicita e limites de lote"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "garantir renderer component-first por artifacts/result.type/result.data e componentes faltantes"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar fluxos funcionais (nao por frase), regressao e consistencia visual component-first"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar arquitetura final, contratos, testes, riscos e evidencias de validacao"
```

### Diagnostico inicial esperado na fase 03

O especialista de backend deve iniciar com diagnostico curto antes de alterar codigo, cobrindo obrigatoriamente:

1. tools atuais e cobertura real;
2. lacunas de cobertura de capacidades operacionais;
3. gargalos de memoria contextual;
4. gargalos de normalizacao de resultados;
5. gargalos de renderizacao/contrato com frontend;
6. riscos de compatibilidade;
7. plano de implementacao em fases com entregas verificaveis.

### Criterios de pronto desta rodada

- Respostas estruturaveis nao retornam somente texto quando houver dado operacional estruturado.
- Pedidos equivalentes geram o mesmo `result.type` e o mesmo padrao visual.
- Planner composto produz plano multi-etapas com dependencias e confirmacao.
- Entity resolver e memoria operacional permitem continuidade contextual entre turnos.
- Policy cobre novas tools/intents com risco, permissao, lote e confirmacao.
- Artifacts PDF/ZIP com lifecycle consistente (processing/available/partial/failed/expired).
- CDF/CDR coberto como capacidade operacional propria.
- Testes backend/frontend cobrindo funcionalidade (nao frases) e validacoes alvo executadas.

### Cadeia imediata iniciada

1. `programador-backend-mtr`: iniciar fase 03 com diagnostico tecnico obrigatorio e implementacao da base arquitetural backend para a evolucao component-first.
