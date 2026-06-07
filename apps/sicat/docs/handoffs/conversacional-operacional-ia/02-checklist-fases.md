# Checklist de fases

## Status de consolidacao (2026-04-23)

- Fase 1: concluida (documentacao canonica e governanca)
- Fase 2: concluida (backend conversacional: contrato + persistencia)
- Fase 3: concluida (popup interno com copiloto contextual)
- Fase 4: concluida (homepage conversacional)
- Fase 5: concluida (app simplificado)
- Fase 6: concluida (hardening da primeira onda, sem WhatsApp)
- Fase 7: pendente (segunda onda WhatsApp)

## Fase 1 - Dominio canonico

- [x] Trilha documental criada
- [x] Intents e actions definidos
- [x] Politica por canal definida
- [x] Catalogo inicial de telas criado
- [x] Catalogo inicial de campos criado
- [x] Tool contracts definidos

Nota de escopo:

- O status "concluida" da Fase 1 significa consolidacao documental.
- Nao implica implementacao da camada conversacional no backend/frontend de produto.

## Fase 2 - Backend conversacional

- [x] SQL inicial da camada criado
- [x] Repositories implementados
- [x] Routes de conversa implementadas
- [x] Conversation service implementado
- [x] Policy service implementado
- [x] Context service implementado
- [x] Dispatcher de tools implementado
- [x] Auditoria e correlacao registradas

## Fase 3 - Assistente interno

- [x] Launcher implementado
- [x] Painel implementado
- [x] Integracao com tela atual implementada
- [x] Consultas basicas funcionando
- [x] Explicacao de tela e campos funcionando
- [x] Politicas respeitadas
- [x] ✅ **BLOCKER RESOLVIDO: Arquitetura provide/inject corrigida com Pinia Store** (2026-04-23)
- [x] Contexto operacional enriquecido enviado ao backend conversacional
- [x] Modo consultivo ativo (allowActions: false)
- [x] Build frontend sem erros
- [x] Smoke test PASSOU

**Status:** ✅ **CONCLUIDA COM SUCESSO** - Validação de reenvio de contexto operacional PASSOU. Smoke test `tests/manual/smoke-phase-3-operational-context.js` confirma: launcher, painel, contexto mínimo, contexto operacional (5 campos), quick actions, modo consultivo todos funcionando. Blocker de arquitetura resolvido via Pinia Store centralizado.

## Fase 4 - Homepage

- [x] Capitulo visual conversacional criado
- [x] Copy alinhada ao produto
- [x] Hero / CTA atualizados
- [x] Integracao visual com canvases atuais

Nota QA (2026-04-23):

- Validacao da Fase 4 registrada em `09-qa-validation.md`.
- Sem blockers funcionais de composicao visual.
- Encerramento apos ajustes finais de copy/teste: **APROVADA SEM RESSALVAS**.
- Evidencias de fechamento: copy em evolucao faseada + suite focal homepage com **10 passed / 0 failed**.

## Fase 5 - App simplificado

- [x] Rota do app simplificado criada
- [x] Thread conversacional criada
- [x] Cards de acao criados
- [x] Integracao com auth e conta ativa
- [x] Consulta operacional funcionando

Nota QA (2026-04-23):

- Validacao da Fase 5 registrada em `09-qa-validation.md`.
- Evidencias executadas: Playwright focal do app simplificado (**2 passed / 0 failed**), build frontend com sucesso e teste unitario de policy conversacional (**3 passed / 0 failed**).
- Encerramento de QA desta rodada: **APROVADA COM RESSALVAS** (gap de cobertura automatizada para tentativa de acao sensivel no app simplificado).

## Fase 6 - Hardening (primeira onda)

- [x] Cobertura automatizada da Fase 5 expandida para quick actions com contexto obrigatorio (`manifestId` e `jobId`)
- [x] Cobertura automatizada da Fase 5 expandida para tentativa de texto sensivel com assert de bloqueio consultivo
- [x] Assert explicito de bloqueio quando `operationalScopeReady` for falso no composer
- [x] Telemetria essencial criada
- [x] Testes minimos implementados
- [x] Fallback e handoff cobertos
- [x] Revisao documental final da primeira onda

Nota QA (2026-04-23):

- Validacao da Fase 6 registrada em `09-qa-validation.md`.
- Evidencias executadas: `npm run typecheck` (ok), `npx tsx --test tests/unit/conversation-policy-service.test.js tests/unit/conversation-observability.test.js tests/unit/conversation-service-fallback.test.js` (**6 passed / 0 failed**) e `npx playwright test tests/ui/conversational-chat-app.spec.js --reporter=list` (**6 passed / 0 failed**).
- Encerramento de QA desta rodada: **APROVADA** (sem blockers) para a primeira onda nativa.
- Escopo WhatsApp mantido fora desta rodada; Fase 7 permanece pendente.

## Fase 7 - WhatsApp (segunda onda)

- [ ] Adaptador de canal criado
- [ ] Vinculacao de identidade criada
- [ ] Politicas por WhatsApp definidas
- [ ] Fluxos consultivos funcionando
- [ ] Fluxos sensiveis com confirmacao
