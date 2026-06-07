---
name: hardening-producao
description: 'Preparar sistema para produção com reforço em estabilidade, observabilidade e resiliência.'
agent: orquestrador-mtr
argument-hint: "Timeline de deploy e áreas de foco (ex: 'em 1 semana, foco em DLQ e retry')"
---

# Hardening para Produção

**Contexto:** preparar sistema para produção com reforço em estabilidade, observabilidade e resiliência.

**Agente:** `orquestrador-mtr` (auditoria + escalonamento por categoria)

## Timeline de produção

${input:deployment_timeline:Ex: 'em 1 semana', 'urgente', 'planejado para 2026-03-15'}

## Áreas de foco

${input:focus_areas:Liste as áreas prioritárias (Integração CETESB, Fila/Worker, Observabilidade, Validação, Configuração)}

**Preocupações específicas (opcional):**
${input:specific_concerns:Descreva preocupações adicionais ou deixe em branco}

## Objetivo

Endurecer sistema para operar de forma autônoma e recuperável sob carga e falhas reais.

## Fluxo automático

### 1. Auditoria de riscos
O orquestrador consulta:
- `docs/copilot/08-riscos-e-lacunas.md`
- `docs/copilot/11-checklist-qa.md`
- Testes existentes (cobertura de falha?)
- Configurações sensíveis (.env, timeouts, retry)

### 2. Escalonamento por categoria

**Resiliência de integração CETESB:**
1. Delegar para `integrador-cetesb-mtr`
2. Validar: timeout configurável, retry exponencial, fallback em caso de indisponibilidade
3. Testar: cenários de timeout, 500, 503, token expirado
4. Documentar: comportamento esperado sob falha

**Resiliência de fila/worker:**
1. Delegar para `postgres-queue-mtr`
2. Aplicar skill `postgres-job-queue`
3. Validar: DLQ configurado, max_attempts adequado, logs de retry
4. Testar: job travado, deadlock, worker crash

**Observabilidade e rastreabilidade:**
1. Delegar para `programador-backend-mtr`
2. Validar: correlationId em todos os logs, auditoria persistida, erro com context
3. Testar: conseguir rastrear fluxo completo por correlationId

**Validação de contrato e payload:**
1. Delegar para `tester-qa-mtr`
2. Aplicar skill `qa-smoke-flows`
3. Validar: fail-fast em payload inválido, mensagens de erro claras
4. Testar: edge cases (campos vazios, null, tipos incorretos)

**Configuração e segurança:**
1. Delegar para `programador-backend-mtr`
2. Validar: secrets em env (nunca hardcoded), timeout adequado, rate limit se necessário
3. Documentar: variáveis obrigatórias + valores padrão seguros

### 3. Entregáveis obrigatórios
- ✅ Testes de falha (timeout, 500, DLQ, payload inválido)
- ✅ Smoke de fluxo completo sob condições adversas
- ✅ Configurações externalizadas e documentadas
- ✅ Logs rastreáveis por correlationId
- ✅ Decision-log com estratégia de retry, DLQ, fallback
- ✅ Checklist de deployment atualizado

## Critério de pronto
- [ ] Testes de timeout e retry passando
- [ ] DLQ validado com jobs problemáticos
- [ ] Smoke de fluxo completo OK (sucesso + falhas controladas)
- [ ] Secrets externalizados (.env)
- [ ] Logs rastreáveis (correlationId em toda operação)
- [ ] Documentação de deployment atualizada
- [ ] Riscos residuais documentados em `08-riscos-e-lacunas.md`

## Áreas prioritárias para hardening

### 1. Integração CETESB
- [ ] Timeout configurável (default 30s)
- [ ] Retry exponencial (3 tentativas)
- [ ] Fallback documentado se portal fora
- [ ] Token refresh automático
- [ ] Validação de payload antes de enviar (fail fast)

### 2. Fila e Worker
- [ ] DLQ configurado e testado
- [ ] max_attempts = 3 (padrão)
- [ ] Backoff exponencial (1s, 2s, 4s)
- [ ] Logs de retry com contexto
- [ ] Worker graceful shutdown

### 3. Observabilidade
- [ ] CorrelationId em todos os logs
- [ ] Auditoria persistida (sucesso + falha)
- [ ] Error stack preservado
- [ ] Métricas de fila (pending, retry, dlq)

### 4. Validação de entrada
- [ ] Fail fast em payload inválido
- [ ] Mensagens de erro claras (campo + motivo)
- [ ] Normalização de dados (null vs vazio)
- [ ] Validação baseada em evidências reais (HAR)

### 5. Configuração
- [ ] Secrets em .env
- [ ] Valores padrão seguros
- [ ] Documentação de variáveis obrigatórias
- [ ] Rate limit se necessário

## Exemplo de uso
```
No VS Code Copilot Chat, execute o prompt `hardening-producao`.

Sistema vai para produção em 1 semana. Preciso garantir:
1. Resiliência de integração CETESB (timeout, retry, token)
2. DLQ funcionando para jobs problemáticos
3. Rastreabilidade completa por correlationId
4. Validação fail-fast de payload
```

O orquestrador irá:
1. Auditar riscos em `08-riscos-e-lacunas.md`
2. Delegar validação de integração para `integrador-cetesb-mtr`
3. Delegar validação de fila para `postgres-queue-mtr`
4. Delegar testes de falha para `tester-qa-mtr`
5. Consolidar checklist de deployment
6. Registrar pendências residuais
