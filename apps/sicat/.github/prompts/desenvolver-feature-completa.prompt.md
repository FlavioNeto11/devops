---
name: desenvolver-feature-completa
description: 'Orquestrar uma nova funcionalidade end-to-end com cadeia obrigatória de especialistas para contrato, código, testes e docs.'
agent: orquestrador-mtr
argument-hint: 'Descreva a feature (endpoint, regra de negócio, comportamento esperado)'
---

# Desenvolver Feature Completa

**Contexto:** orquestrar uma nova funcionalidade no backend MTR CETESB do início ao fim sem execução direta pelo orquestrador.

**Agente:** `orquestrador-mtr` (escalonamento automático)

## Feature solicitada

${input:feature_description:Descreva a feature (endpoint, regra de negócio, comportamento esperado)}

**Critérios de aceite (opcional):**
${input:acceptance_criteria:Critérios de aceite ou deixe em branco}

## Objetivo

Entregar uma cadeia de especialistas capaz de produzir funcionalidade pronta para produção com todas as camadas validadas.

## Fluxo automático

### 1. Análise de impacto

O orquestrador avalia a demanda e identifica camadas impactadas:

- Contrato HTTP (OpenAPI)?
- Integração CETESB?
- Persistência (Postgres/migrations)?
- Fila/worker assíncrono?
- Validação de payload?

### 2. Escalonamento por necessidade

**Se tocar contrato HTTP:**

1. Delegar para `programador-backend-mtr`
2. Aplicar skill `contract-first-openapi`
3. Validar: OpenAPI → examples → routes → services

**Se tocar integração CETESB:**

1. Delegar para `integrador-cetesb-mtr`
2. Aplicar skill `cetesb-gateway-real`
3. Validar: session-context, token, payload real

**Se tocar banco/fila/worker:**

1. Delegar para `postgres-queue-mtr`
2. Aplicar skill `postgres-job-queue`
3. Validar: migration, repository, job handler

**Se precisar validação:**

1. Delegar para `tester-qa-mtr`
2. Aplicar skill `qa-smoke-flows`
3. Validar: testes unitários + smoke + contrato

### 3. Consolidação final

O orquestrador apenas consolida a cadeia e garante owner explícito por fase:

- ✅ Código implementado pelo especialista de domínio
- ✅ Contrato OpenAPI atualizado e validado pelo owner apropriado
- ✅ Testes (unitários + integração + smoke) sob ownership de `tester-qa-mtr`
- ✅ Migration e persistência sob ownership de `postgres-queue-mtr` quando aplicável
- ✅ Documentação final sob ownership de `documentador-mtr`
- ✅ Próximo handoff ou `next_agent_required` quando o runtime não continuar

## Critério de pronto

- [ ] Feature implementada end-to-end
- [ ] OpenAPI sincronizado com código (se aplicável)
- [ ] Pelo menos 1 teste de sucesso + 1 de falha
- [ ] Smoke test passa localmente
- [ ] Documentação atualizada em `docs/copilot/`
- [ ] Sem erros de linting/compilação
- [ ] Próximos passos registrados no backlog (se houver pendências)

## Exemplo de uso

```text
No VS Code Copilot Chat, execute o prompt `desenvolver-feature-completa`.

Preciso implementar endpoint POST /v1/manifestos/:id/reopen para reabrir MTR cancelado.
Regra de negócio: só pode reabrir se status=cancelled e elapsed < 48h.
```

O orquestrador irá delegar para a cadeia apropriada:

1. Verificar OpenAPI (adicionar operação)
2. Implementar rota + service + validação
3. Criar job assíncrono (se precisar chamar CETESB)
4. Escrever testes (sucesso: 200, falha: 400 se >48h, 404 se não existe)
5. Atualizar examples/
6. Documentar em decision-log
