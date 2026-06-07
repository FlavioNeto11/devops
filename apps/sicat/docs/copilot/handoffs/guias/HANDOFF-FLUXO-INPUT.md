---
title: Fluxo de Input - Como /handoff Solicita a Descrição
date: 2026-03-08
status: ✅ ESCLARECIMENTO
---

# 📝 Fluxo de Input - Descrição da Feature

## Sua Pergunta

> Quando acesso o handoff no orquestrador, ele vai me pedir a descrição da feature?

---

## Resposta

**SIM.** Ele vai pedir a descrição porque é um **argumento obrigatório**.

```
Usuário clica em "Executar Handoff Unificado"
        ↓
Sistema solicita: "Qual é a descrição da feature?"
        ↓
Usuário digita: "Implemente JWT com refresh tokens"
        ↓
/handoff [sua descrição aqui] é executado automaticamente
```

---

## Fluxo Completo

### No Orquestrador

```
handoffs:
  - label: Executar Handoff Unificado Multi-Camada ⭐
    agent: executor-handoffs
    prompt: /handoff          ← SEM placeholder
    send: true
```

**O que acontece:**

1. **Você clica em "Executar Handoff Unificado"**
   ```
   Orquestrador inicia
   ```

2. **Sistema detecta que /handoff precisa de argumento**
   ```
   Copilot: "Qual é a descrição da feature?"
   ```

3. **Você digita a descrição**
   ```
   Você: "Implemente autenticação JWT com refresh tokens"
   ```

4. **Sistema monta a chamada**
   ```
   /handoff Implemente autenticação JWT com refresh tokens
   ```

5. **Executor-handoffs recebe e processa**
   ```
   Agent inicia orquestração (8 fases)
   ```

---

## Onde a Descrição Vem

### Frontmatter do Prompt

```yaml
---
name: handoff
description: Orquestrador unificado...
agent: executor-handoffs
argument: "descrição_feature"    ← Marca como obrigatório
---
```

A chave `argument` indica que este prompt **REQUER** um argumento de entrada.

---

## Exemplos de Input Esperado

```
❌ Vazio
/handoff
→ Erro: argumento obrigatório

✅ Simples
/handoff Adicione campo internalNotes

✅ Média
/handoff Implemente autenticação JWT com refresh tokens

✅ Complexa
/handoff Redesenhe fluxo de cadastro para suportar CNAE múltiplos

✅ Com contexto
/handoff Implemente cancelamento de manifesto com auditoria de logs
  Contexto: 
  - Feature é crítica
  - Equipe: 3 pessoas
  - Prazo: amanhã
```

---

## Onde Aparece o Input

### 1️⃣ Em VS Code Chat (Direto)

```
Você: @workspace #executor-handoffs
Você: /handoff Implemente JWT

Sistema processa automaticamente
```

### 2️⃣ Via Orquestrador (Com Prompt)

```
Você: Clica "Executar Handoff Unificado"
      ↓
Sistema: "Qual é a descrição da feature?"
      ↓
Você: "Implemente JWT com refresh tokens"
      ↓
Sistema: Monta /handoff [sua descrição]
      ↓
Executor processa
```

### 3️⃣ Via Prompt File (Se abrir .prompt.md)

```
Você: Abre .github/prompts/handoff.prompt.md
      Clica "Execute in New Chat"
      ↓
Sistema: Pede argumento
      ↓
Você: Digita descrição
      ↓
Executor processa
```

---

## Tratamento do Input

### O que o Agent Faz com a Descrição

```
Input: "Implemente autenticação JWT com refresh tokens"

Agent:
├─ 1. ANALISAR
│  └─ Identifica: autenticação, JWT, tokens
│
├─ 2. DECOMPOR
│  └─ 5 camadas: Contrato, CETESB, Gateway, Banco, Testes, Docs
│
├─ 3. PLANEJAR
│  └─ Task list + dependências
│
├─ 4. EXECUTAR
│  └─ 6 handoffs sequenciais
│
└─ 5. CONSOLIDAR
   └─ Validar + marcar pronto
```

---

## Interface de Input

### VS Code Chat (Copilot)

```
┌─────────────────────────────────────┐
│ Qual é a descrição da feature?      │
│                                     │
│ [________________________________]  │ ← Digite aqui
│                                     │
│  [SUBMIT]  [CANCEL]                │
└─────────────────────────────────────┘
```

### Campos Suportados

```
Texto simples:
  "Adicione campo internalNotes"

Multi-linha:
  "Implemente autenticação JWT
   com refresh tokens
   e rotação automática"

Com contexto:
  "Implemente JWT
   
   Contexto:
   - Feature crítica
   - Equipe: 3 pessoas
   - Prazo: amanhã"
```

---

## Casos de Uso

### Caso 1: Input Simples

```
Sistema: "Qual é a descrição da feature?"
Você: "Adicione campo internalNotes"
      ↓
/handoff Adicione campo internalNotes
```

### Caso 2: Input com Contexto

```
Sistema: "Qual é a descrição da feature?"
Você: "Implemente JWT com refresh tokens
       
       Contexto:
       - Usar RS256
       - Token de 1h
       - Refresh de 7 dias"
      ↓
/handoff Implemente JWT com refresh tokens
         
         Contexto:
         - Usar RS256
         - Token de 1h
         - Refresh de 7 dias
```

### Caso 3: Input Muito Detalhado

```
Sistema: "Qual é a descrição da feature?"
Você: "Redesenhe fluxo de cadastro para CNAE múltiplos
       
       Impacto: 5 camadas
       - API: novo endpoint POST /v1/cadastros/multi
       - CETESB: validação de múltiplos CNAE
       - Banco: migration para campo array
       - Testes: 20+ casos novos
       - Docs: atualizar modelo de dados"
      ↓
/handoff [toda descrição acima]
```

---

## Validação de Input

### O Agent Valida?

```
✅ SIM - Agent valida:

├─ Descrição não vazia?
├─ Descrição tem sentido técnico?
├─ Pode decompor em camadas?
└─ Consegue planejar?

❌ Se falhar validação:

└─ Agent escalona para orquestrador
   ou pede reformulação
```

---

## Resumo

```
┌─────────────────────────────────────┐
│ FLUXO DE INPUT PADRÃO               │
│                                     │
│ 1. Usuário clica no handoff         │
│ 2. Sistema pede descrição           │
│ 3. Usuário digita                   │
│ 4. Sistema monta /handoff [desc]    │
│ 5. Executor processa                │
│                                     │
│ ✅ Tudo automático após input       │
└─────────────────────────────────────┘
```

---

## Próximos Passos

1. **Acesse o orquestrador**
   ```
   @workspace #orquestrador-mtr
   ```

2. **Clique em "Executar Handoff Unificado"**
   ```
   Sistema vai pedir descrição
   ```

3. **Digite sua feature**
   ```
   "Implemente cancelamento com auditoria"
   ```

4. **Deixe a orquestração executar**
   ```
   8 fases automáticas
   2-6 horas para feature pronta
   ```

---

**Data:** 2026-03-08  
**Status:** ✅ ESCLARECIDO  
**Próximo:** Usar no projeto real
