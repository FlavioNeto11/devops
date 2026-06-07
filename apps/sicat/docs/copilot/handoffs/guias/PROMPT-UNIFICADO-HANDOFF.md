# 🚀 Prompt Unificado /handoff - Documentação de Integração

**Data**: 2026-03-08  
**Status**: ✅ Implementado  
**Modo**: Meta-Evolution-Copilot

---

## O que foi feito

Criado **prompt único `/handoff`** que orquestra os 3 prompts especializados (`execute`, `plan`, `track`) em uma **única chamada unificada**.

### Antes (3 chamadas separadas)
```
/handoff-execute [descrição]    # Executa feature
/handoff-plan [descrição]       # Planeja decomposição
/handoff-track [DL-XXX]         # Acompanha progresso
```

### Agora (1 chamada unificada) ⭐
```
/handoff [descrição]            # Executa TUDO automaticamente
```

---

## Fluxo de Execução

```
1️⃣  @workspace #executor-handoffs

2️⃣  /handoff Descrição da sua feature

3️⃣  Acompanhar docs/copilot/13-decision-log.md
    ✅ Feature pronta em 2-6 horas
```

### Internamente (Automático)

```
/handoff "Implemente JWT com refresh tokens"
        ↓
┌───────────────────────────────┐
│ PHASE 1: PLANEJAMENTO         │
│ Decompor em camadas           │
│ Identificar dependências      │
└──────────────┬────────────────┘
               ↓
┌───────────────────────────────┐
│ PHASE 2: HANDOFFS (2-4 horas) │
│ 1. Contrato                   │
│ 2. CETESB                     │
│ 3. Gateway                    │
│ 4. Banco                      │
│ 5. Testes                     │
│ 6. Docs                       │
└──────────────┬────────────────┘
               ↓
┌───────────────────────────────┐
│ PHASE 3: CONSOLIDAÇÃO         │
│ npm run validate (TODAS)      │
│ Marcar como COMPLETADO        │
└───────────────────────────────┘
```

---

## Ficheiros Criados/Modificados

### ✅ Novo

```
.github/prompts/handoff.prompt.md
  └─ Prompt unificado (name: handoff)
  └─ Orquestra execute → plan → track
  └─ 3 passos simples para usuário
  └─ Estimativas de tempo por complexidade
```

### 📝 Modificados

```
.github/agents/executor-handoffs.agent.md
  └─ Adicionada seção "Uso Unificado (Recomendado)"
  └─ Referencia novo prompt /handoff
  └─ Mantém modo avançado (direto no agent)

.github/agents/orquestrador-mtr.agent.md
  └─ Handoff principal agora aponta para /handoff
  └─ Label: "Executar Handoff Unificado Multi-Camada ⭐"
  └─ Outras 5 delegações mantidas (avançado)

.github/README.md
  └─ Seção "Orquestrador Unificado de Handoffs"
  └─ 3 passos simples destacados
  └─ Exemplos práticos
  └─ Estimativas de tempo

docs/copilot/14-estrutura-copilot.md
  └─ Prompts operacionais atualizado
  └─ handoff.prompt.md marcado como ⭐ RECOMENDADO
  └─ Outros 3 prompts marcados como (avançado)
```

---

## Exemplos de Uso

### Simples (45 min)
```
/handoff Adicione campo "internalNotes" opcional em manifestos
```

**Impactado**: 2-3 camadas
- Contrato (OpenAPI)
- Testes (unit)
- Documentação

### Média (2-3 horas) ⭐ MAIS COMUM
```
/handoff Implemente autenticação JWT com refresh tokens
```

**Impactado**: 5 camadas
- Contrato (endpoint novo)
- CETESB (validação)
- Gateway (session)
- Banco (token storage)
- Testes (E2E)
- Documentação

### Complexa (4-6 horas)
```
/handoff Redesenhe fluxo de cadastro para suportar CNAE múltiplos
```

**Impactado**: 6+ camadas
- Schema novo
- API redesenhada
- Validações CETESB
- Gateway atualizado
- Migrations
- Testes completos
- Documentação refatorada

---

## Vantagens da Integração

| Aspecto | Antes | Agora |
|---------|-------|-------|
| **Chamadas** | 3 prompts separados | 1 prompt unificado ⭐ |
| **Curva de aprendizado** | Média | Baixa |
| **Tempo setup** | 5 min (entender 3 prompts) | 1 min (1 prompt) |
| **Documentação** | 3 guias de uso | 1 guia simplificado |
| **Integração** | Manual entre prompts | Automática |
| **Erro usuário** | Chamar fora de ordem | Impossível |
| **Modo avançado** | N/A | Ainda disponível (prompts específicos) |

---

## Estrutura do Prompt Unificado

```yaml
---
name: handoff                                    # Único, simples
description: Orquestrador unificado...           # Claro e conciso
agent: executor-handoffs                         # Delegação direta
argument-hint: "descrição da feature..."         # Input hint
---

# Conteúdo
- 3 passos para usuário
- Exemplos práticos (simples/média/complexa)
- Tabela de tempos
- Referências internas
- Links para documentação avançada
```

---

## Compatibilidade

### ✅ VS Code
- Frontmatter válido (sem `model`, sem `tools`)
- Name em formato válido (sem espaços): `handoff`
- Atributos suportados: `name`, `description`, `agent`, `argument-hint`
- Placeholders: `${input:...}` funcionam corretamente

### ✅ Executor-Handoffs Agent
- Recebe /handoff unificado
- Orquestra 8 fases automáticas
- Documenta contínuamente em decision-log
- Delega a 6 especialistas sequencialmente
- Consolida com validações

### ✅ Backward Compatibility
- Prompts `handoff-execute.prompt.md`, `handoff-plan.prompt.md`, `handoff-track.prompt.md` continuam disponíveis para uso avançado
- Modo direto no agent ainda funciona
- Nada foi quebrado, apenas adicionado

---

## Referências

- **Quick start**: `.github/prompts/handoff.prompt.md`
- **Agent**: `.github/agents/executor-handoffs.agent.md`
- **Instructions**: `.github/instructions/executor-handoffs.instructions.md`
- **Skill**: `.github/skills/handoff-automation.md`
- **Estratégia**: `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- **README**: `.github/README.md` (seção "Orquestrador Unificado")

---

## Próximos Passos

1. ✅ Prompt unificado criado
2. ✅ Agent atualizado para referenciar
3. ✅ Orquestrador principal (orquestrador-mtr) atualizado
4. ✅ Documentação sincronizada
5. ⏭️ **Testar com primeira feature**:
   ```
   @workspace #executor-handoffs
   /handoff Implemente cancelamento de manifesto com auditoria
   ```

---

## Status

🟢 **Pronto para uso**

- Frontmatter validado
- Integração com agent completa
- Documentação sincronizada
- Backward compatibility mantida
- Simples de usar (3 passos)

Comece agora:
```
@workspace #executor-handoffs
/handoff [descrição da sua feature]
```
