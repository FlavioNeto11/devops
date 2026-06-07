---
title: Clarificação - Prompts Unificado vs Especializados
description: Quando usar /handoff vs quando usar os 3 prompts especializados
date: 2026-03-08
status: ✅ ESCLARECIMENTO
---

# 📋 Prompts de Handoff: Unificado vs Especializados

## TL;DR

```
❓ Qual usar?

├─ 95% das vezes → /handoff (novo, automático) ✅ RECOMENDADO
└─ 5% das vezes → /handoff-{execute|plan|track} (avançado, controle manual)
```

---

## Matriz de Decisão

| Cenário | Use | Por quê? |
|---------|-----|---------|
| **Sua primeira feature** | `/handoff` | Simples, automático |
| **Feature comum** | `/handoff` | 95% dos casos |
| **Quer planejar primeiro** | `/handoff-plan` | Validar decomposição |
| **Quer executar gradualmente** | `/handoff-execute` | Controle por handoff |
| **Acompanhando em tempo real** | `/handoff-track` | Ver status sem rodar |
| **Debugging/troubleshooting** | Todos os 3 | Granularidade máxima |
| **Modo production** | `/handoff` | Orquestração automática |

---

## Comparativo Detalhado

### `/handoff` - Uso Unificado (RECOMENDADO)

```yaml
Quando usar:
  - Feature comum (95% dos casos)
  - Primeira vez (iniciante)
  - Quer orquestração automática
  - Tempo é crítico
  
Como funciona:
  /handoff [descrição]
  └─ Automático: Plan → Execute → Track → Consolidate
  
Tempo total: 2-6 horas (tudo)

Controle: ZERO (agent decide tudo)
```

**Vantagens:**
- ✅ 1 chamada única
- ✅ Impossível chamar fora de ordem
- ✅ Orquestração 100% automática
- ✅ Melhor para produção

**Desvantagens:**
- ❌ Sem controle granular
- ❌ Não pode pausar entre fases
- ❌ Não pode revisar plan antes de executar

---

### `/handoff-plan` - Apenas Planejamento

```yaml
Quando usar:
  - Quer validar decomposição ANTES de executar
  - Feature é complexa (6+ camadas)
  - Quer evitar surpresas
  - Trabalho em equipe (precisa de aprovação)

Como funciona:
  /handoff-plan [descrição]
  └─ Resultado: task list + pré-condições + riscos
  
Tempo: 5 minutos
Próximo passo: /handoff-execute

Controle: VOCÊ revisa o plano
```

**Vantagens:**
- ✅ Valida decomposição antes
- ✅ Identifica riscos antecipadamente
- ✅ Aprova antes de executar
- ✅ Evita surpresas

**Desvantagens:**
- ❌ 2 passos em vez de 1
- ❌ Ainda precisa rodar execute depois
- ❌ Mais lento

---

### `/handoff-execute` - Apenas Execução

```yaml
Quando usar:
  - Plano já foi validado (/handoff-plan)
  - Quer executar handoff por handoff
  - Quer revisar entre cada especialista
  - Debugging: chamar de novo se falhar um

Como funciona:
  /handoff-plan [descrição]      # Passo 1: planejar
  # ... revisar plano ...
  /handoff-execute [descrição]   # Passo 2: executar com plano pronto
  
Tempo: 2-4 horas (6 handoffs)
Controle: VOCÊ pausar entre especialistas

Equivalente a: Fase 2-8 do agent
```

**Vantagens:**
- ✅ Executa com plano já validado
- ✅ Pode pausar entre handoffs
- ✅ Revisar resultado de cada especialista
- ✅ Ideal para debugging

**Desvantagens:**
- ❌ Requer /handoff-plan antes
- ❌ Mais passos (plan + execute)
- ❌ Manual

---

### `/handoff-track` - Apenas Acompanhamento

```yaml
Quando usar:
  - Feature já está em execução
  - Quer ver status/progresso
  - Não quer disparar novo handoff
  - Acompanhamento em tempo real

Como funciona:
  /handoff-track DL-XXX
  └─ Resultado: status atual + próximos passos + blocadores
  
Tempo: 1-2 minutos
Controle: READ-ONLY (não executa nada)

Equivalente a: Visualizar decision-log
```

**Vantagens:**
- ✅ Ver status sem rodar nada
- ✅ Identifica blocadores
- ✅ Rápido (1-2 min)
- ✅ Safe (read-only)

**Desvantagens:**
- ❌ Não executa nada
- ❌ Apenas visualização
- ❌ Menos automático

---

## Exemplos de Uso

### Caso 1: Feature Simples (Primeira Vez)

```
❌ NÃO FAÇA:
/handoff-plan "Adicione campo"
# (aguarde revisão)
/handoff-execute "Adicione campo"
# (aguarde 2 horas)
/handoff-track DL-001

✅ FAÇA:
/handoff Adicione campo "internalNotes" opcional em manifestos
# (tudo automático em 45 min)
```

---

### Caso 2: Feature Complexa (Equipe)

```
✅ FAÇA:
/handoff-plan "Redesenhe fluxo de cadastro"
# (5 min, valida plano)

# ... PM aprova plano ...

/handoff-execute "Redesenhe fluxo de cadastro"
# (2-3 horas, com handoffs granulares)

# ... acompanhar após...

/handoff-track DL-XXX
# (1 min, ver status)
```

---

### Caso 3: Debugging (Algo quebrou)

```
✅ FAÇA:
/handoff-track DL-001
# (ver o que quebrou + onde)

# ... investigar ...

/handoff-execute "Corriga manifesto"
# (re-executar só os handoffs impactados)
```

---

## Status dos Prompts Especializados

```
handoff-execute.prompt.md
├─ Status: ✅ ATIVO e FUNCIONAL
├─ Quando usar: Controle granular + debugging
├─ Deprecação: ❌ NÃO deprecado
└─ Recomendação: Use /handoff 95% das vezes

handoff-plan.prompt.md
├─ Status: ✅ ATIVO e FUNCIONAL
├─ Quando usar: Planejar + validar antes
├─ Deprecação: ❌ NÃO deprecado
└─ Recomendação: Use /handoff 95% das vezes

handoff-track.prompt.md
├─ Status: ✅ ATIVO e FUNCIONAL
├─ Quando usar: Acompanhamento read-only
├─ Deprecação: ❌ NÃO deprecado
└─ Recomendação: Use /handoff 95% das vezes
```

---

## Arquitetura: Como Tudo Se Conecta

```
                    USUÁRIO
                      │
        ┌─────────────┼──────────────┐
        ↓             ↓              ↓
    /handoff     /handoff-plan  /handoff-track
      (novo)      (avançado)     (avançado)
        │             │              │
        └─────────────┼──────────────┘
                      ↓
              executor-handoffs (agent)
                      │
        ┌─────────────┼──────────────┐
        ↓             ↓              ↓
    PLANNING     HANDOFF 1-6    CONSOLIDATION
    (5 min)      (2-4 horas)     (5 min)
```

### Fluxo Unificado (`/handoff`)
```
User: /handoff [desc]
  ↓
Agent executa automaticamente:
  ├─ PLANNING (/handoff-plan internamente)
  ├─ HANDOFF 1-6 (/handoff-execute internamente)
  ├─ TRACK contínuo (/handoff-track internamente)
  └─ CONSOLIDATION
```

### Fluxo Manual (3 prompts separados)
```
User: /handoff-plan [desc]
  ↓
User: /handoff-execute [desc]
  ↓
User: /handoff-track DL-XXX
```

---

## Recomendação Final

### Para 95% dos Casos
```bash
USE: /handoff [descrição]

# Simples
/handoff Adicione campo em manifesto

# Média
/handoff Implemente JWT com refresh tokens

# Complexa
/handoff Redesenhe fluxo de cadastro
```

### Para 5% dos Casos (Avançado)
```bash
USE: /handoff-plan + /handoff-execute + /handoff-track

# Quer validar antes de executar
/handoff-plan Algo muito complexo
# (revisar)
/handoff-execute Algo muito complexo

# Quer acompanhar em tempo real
/handoff-track DL-001
```

---

## Documentação por Prompt

| Prompt | Quick Ref | Documentação | Quando |
|--------|-----------|--------------|--------|
| `/handoff` | `.github/HANDOFF-QUICK-START.md` | `docs/copilot/handoffs/guias/PROMPT-UNIFICADO-HANDOFF.md` | 95% |
| `/handoff-plan` | `.github/prompts/handoff-plan.prompt.md` | Interno | 2% |
| `/handoff-execute` | `.github/prompts/handoff-execute.prompt.md` | Interno | 2% |
| `/handoff-track` | `.github/prompts/handoff-track.prompt.md` | Interno | 1% |

---

## Checklist: Qual Usar?

```
❓ Primeira feature?
   └─ SIM → /handoff ✅

❓ Complexa demais?
   └─ SIM → /handoff-plan (validar) + /handoff-execute
   └─ NÃO → /handoff ✅

❓ Quer revisar entre handoffs?
   └─ SIM → /handoff-execute (com plano)
   └─ NÃO → /handoff ✅

❓ Debugging/troubleshooting?
   └─ SIM → /handoff-track (diagnosticar) + /handoff-execute (corrigir)
   └─ NÃO → /handoff ✅

❓ Apenas ver status?
   └─ SIM → /handoff-track ✅
   └─ NÃO → /handoff ✅
```

---

## Conclusão

```
✅ /handoff (novo)          → 95% dos casos (DEFAULT)
✅ /handoff-plan (antigo)   → 2% (controle + validação)
✅ /handoff-execute (antigo) → 2% (debugging + granular)
✅ /handoff-track (antigo)  → 1% (leitura + status)

STATUS: Nenhum é obsoleto, mas /handoff é preferido
RECOMENDAÇÃO: Use /handoff a menos que preciso de controle granular
```

---

**Data:** 2026-03-08  
**Status:** ✅ CLARIFICADO  
**Próximo:** Usar no projeto real e validar
