---
name: resolver-bug-critico
description: 'Corrigir bug crítico em produção/staging com rastreabilidade total e validação rigorosa.'
agent: orquestrador-mtr
argument-hint: 'Descreva o sintoma observado (erro, stack trace, comportamento incorreto)'
---

# Resolver Bug Crítico em Produção

**Contexto:** bug que exige correção urgente e validação rigorosa.

**Agente:** `orquestrador-mtr` (diagnóstico + escalonamento automático)

## Problema reportado

**Sintoma:** ${input:bug_symptom:Descreva o erro, stack trace ou comportamento incorreto}

**Ambiente:** ${input:environment:produção, staging ou local}

**Rastreabilidade (se disponível):** ${input:correlation_id:CorrelationId, JobId ou deixe em branco}

## Objetivo

Corrigir bug rapidamente com rastreabilidade total e sem efeitos colaterais.

## Fluxo automático

### 1. Diagnóstico rápido
O orquestrador investiga:
- Logs de erro (correlationId, jobId)
- Estado atual no banco (manifestos, jobs, session_contexts, auditoria)
- Payload enviado para CETESB (se aplicável)
- Contrato violado (se erro 400/422)

### 2. Classificação e escalonamento

**Bug de integração CETESB (401, 403, timeout, payload inválido):**
1. Delegar para `integrador-cetesb-mtr`
2. Aplicar skill `cetesb-gateway-real`
3. Validar com HAR/rede se necessário
4. Criar smoke específico para cenário de falha

**Bug de persistência/fila (deadlock, DLQ, job travado):**
1. Delegar para `postgres-queue-mtr`
2. Aplicar skill `postgres-job-queue`
3. Validar migration se schema mudou
4. Testar retry e DLQ

**Bug de contrato (response fora do schema, enum inválido):**
1. Delegar para `programador-backend-mtr`
2. Aplicar skill `contract-first-openapi`
3. Validar OpenAPI + examples + testes de contrato

**Bug de lógica de negócio (validação incorreta, estado inconsistente):**
1. Delegar para `programador-backend-mtr`
2. Criar teste reproduzindo o bug
3. Corrigir + validar com smoke

### 3. Validação rigorosa
O orquestrador exige antes de fechar:
- ✅ Teste reproduzindo o bug (antes da correção: falha)
- ✅ Correção aplicada
- ✅ Teste agora passa
- ✅ Smoke do fluxo completo passa
- ✅ Sem regressão (testes existentes continuam passando)
- ✅ Decision-log atualizado com root cause

### 4. Entregáveis obrigatórios
- Código corrigido
- Teste de regressão (evita bug voltar)
- Smoke validando fluxo end-to-end
- Decision-log com:
  - Sintoma observado
  - Root cause identificado
  - Solução aplicada
  - Validação executada
  - Impacto em outros fluxos (se houver)

## Critério de pronto
- [ ] Bug reproduzível via teste
- [ ] Correção validada (teste passa)
- [ ] Smoke do fluxo completo OK
- [ ] Nenhum teste existente quebrou (sem regressão)
- [ ] Decision-log atualizado com root cause
- [ ] Checklist de validação manual executado (se integração real)

## Exemplo de uso
```
No VS Code Copilot Chat, execute o prompt `resolver-bug-critico`.

Bug em produção: POST /v1/manifestos/:id/submit retorna 500 quando payload tem residuo.resNome vazio.
Erro no log: "TypeError: Cannot read property 'trim' of null"
CorrelationId: abc-123-def
```

O orquestrador irá:
1. Reproduzir cenário com teste (payload com resNome vazio → 500)
2. Identificar root cause (falta null check em validator)
3. Corrigir validator (adicionar guard ou normalizar para string vazia)
4. Validar teste agora passa (retorna 400 com mensagem clara)
5. Executar smoke completo (create → submit)
6. Registrar em decision-log
