---
title: RESPOSTA - Prompts Especializados Não São Obsoletos
date: 2026-03-08
updated: 2026-03-08 (DL-016: flexibilização de handoffs)
---

# ✅ CLARIFICAÇÃO - Status dos Prompts Especializados

## Sua Pergunta

> Os prompts especializados (`handoff-execute`, `handoff-plan`, `handoff-track`) ficaram obsoletos ou redundantes?

---

## Resposta Rápida

**NÃO.** Eles NÃO são obsoletos. São **OPCIONAIS para casos avançados.**

```
/handoff (novo) ⭐ ATUALIZADO DL-016
├─ Para 95% dos casos: simples, automático, FLEXÍVEL ✅ RECOMENDADO
├─ Planejamento adaptativo: 2-N HANDOFFs conforme análise
└─ Usa os 3 especializados internamente (transparente)

/handoff-plan
├─ Para 2% dos casos: validar plano ANTES de executar
└─ Você decide quando rodar /handoff-execute

/handoff-execute ⭐ ATUALIZADO DL-016
├─ Para 2% dos casos: executar com controle granular
├─ Agora flexível: não força 6 HANDOFFs fixos
└─ Pausar entre handoffs, revisar cada resultado

/handoff-track
├─ Para 1% dos casos: acompanhar status (read-only)
└─ Ver progresso SEM executar nada novo
```

---

## Diferenças

| Aspecto | `/handoff` | `/handoff-plan\|execute\|track` |
|---------|-----------|--------------------------------|
| **Automatização** | 100% automático | Manual (você controla) |
| **Quantidade de chamadas** | 1 | 3 separadas |
| **Pode pausar entre fases?** | NÃO | SIM |
| **Flexibilidade** | ⭐ Adaptativa (2-N HANDOFFs) | ⭐ Adaptativa (DL-016) |
| **Ideal para** | Produção (95% dos casos) | Debugging/Controle (5%) |
| **Status** | ✅ Recomendado | ✅ Ativo (backup) |

---

## Exemplos Reais (⭐ atualizados DL-016)

### Caso 1: Feature Simples (PRIMEIRA ESCOLHA)

```bash
✅ /handoff Adicione campo "internalNotes"
   # Agora: 15 min (2 HANDOFFs: contrato + docs)
   # Antes: 45 min forçando 6 HANDOFFs ❌
```

### Caso 2: Feature Média

```bash
✅ /handoff Endpoint para consultar status por número
   # Agora: 35 min (4 HANDOFFs: contrato + gateway + testes + docs)
   # Executa somente o necessário
```

### Caso 3: Feature Complexa + Equipe (VALIDAÇÃO)

```bash
✅ /handoff-plan Redesenhe fluxo de cadastro
   # PM aprova o plano (5 min)
   
/handoff-execute Redesenhe fluxo de cadastro
   # Executa 2-4 horas (6+ HANDOFFs conforme plano validado)
```

### Caso 4: Debugging (DIAGNÓSTICO)

```bash
✅ /handoff-track DL-001
   # Ver onde travou (1 min)
   
/handoff-execute [reiniciar]
   # Corrigir (30 min)
```

---

## Por Que NÃO São Obsoletos

1. **Oferecem controle granular**
   - `/handoff` é "fire and forget"
   - Os 3 especializados permitem pausar, revisar, controlar

2. **Casos de uso específicos**
   - Validação antes de executar (plan)
   - Debugging incremental (execute + track)
   - Acompanhamento read-only (track)

3. **Backward compatibility**
   - Alguém pode preferir modo manual
   - Evoluem junto com `/handoff`

4. **A matriz de habilidades do executor ainda os usa internamente**
   - Quando você chama `/handoff`, internamente executa:
     ```
     Plan → Execute → Track → Consolidate
     ```
   - Você não vê, mas estão funcionando

---

## Recomendação Final

```
┌─────────────────────────────────────────────────┐
│ REGRA SIMPLES:                                  │
│                                                 │
│ Sempre tente /handoff PRIMEIRO                  │
│                                                 │
│ Se precisar de controle:                        │
│ └─ Use /handoff-plan + /handoff-execute        │
│                                                 │
│ Se só quer ver status:                          │
│ └─ Use /handoff-track                          │
└─────────────────────────────────────────────────┘
```

---

## Documentação

Para entender melhor quando usar cada um:
→ `docs/copilot/handoffs/guias/HANDOFF-UNIFICADO-VS-ESPECIALIZADOS.md`

---

**Status:** ✅ NÃO obsoletos  
**Recomendação:** Use `/handoff` 95% das vezes  
**Fallback:** Os 3 especializados estão lá para 5% avançado
