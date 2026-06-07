# 🚀 Primeira Execução: Recomendações

Você agora tem um **sistema completo de orquestração de handoffs** pronto para usar. Esta guia ajuda você a executar a **primeira feature** com sucesso.

---

## 📋 Preparação (antes de começar)

### 1. Leia o Essencial
```
Tempo: 15 min
├─ .github/EXECUTOR-HANDOFFS-GUIA.md (5 min)
├─ docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md (5 min)
└─ Este arquivo (5 min)
```

### 2. Identifique a Feature
```
Critérios:
✅ Impacta 2+ camadas técnicas (contrato, CETESB, gateway, banco, testes, docs)
✅ Claramente definida
✅ Prazo flexível (2-6 horas)

Exemplos:
✅ Autenticação OAuth 2.0
✅ Novo tipo de validação de resíduo
✅ Suporte a HTTPS obrigatório
✅ Auditoria de mudanças em manifestos
✅ Suporte a múltiplos CNAE
```

### 3. Verifique Especialistas Disponíveis
```
Necessário:
- programador-backend-mtr ✅
- validador-cetesb-mtr ✅
- integrador-cetesb-mtr ✅
- postgres-queue-mtr ✅
- tester-qa-mtr ✅
- documentador-mtr ✅
```

---

## 🎬 Execução: Passo-a-Passo

### PASSO 1: Iniciar Feature (2 min)

Abra VS Code e use:

```
@workspace #executor-handoffs

/handoff [Descrição da feature]
```

**Exemplo:**
```
@workspace #executor-handoffs

/handoff Implemente suporte a HTTPS obrigatório para todas as requests,
rejeitando HTTP com erro 400 e redirecionando localhost para localhost:3000
```

### PASSO 2: Acompanhar Planejamento (5 min)

Agent irá:
1. Analisar a demanda
2. Decompor em camadas
3. Identificar ordem
4. Registrar riscos

**Esperado:**
```
PLANEJAMENTO:
- Camadas: Contrato, CETESB, Gateway, Banco, Testes, Docs (6)
- Ordem: Contrato → CETESB → Gateway → Banco → Testes → Docs
- Tempo estimado: ~3 horas
- Riscos: [lista]
- Pronto? SIM ✅

PRÓXIMO: Iniciando Handoff 1 (Contrato)
```

### PASSO 3: Acompanhar Decisão-Log (durante execução)

Abra em tempo real:
```
docs/copilot/13-decision-log.md
```

**Espere:**
```
## DL-001
**Tema:** HTTPS Obrigatório
**Status:** 🔄 EM PROGRESSO - Handoff 1/6

### Planejamento
- Camadas: Contrato, CETESB, Gateway, Banco, Testes, Docs
- Ordem: [definida]
- Tempo: ~3h
- Riscos: [listados]

### Handoff 1: Contrato
- [ ] OpenAPI: adicionar security scheme
- [ ] Examples: atualizar com https://
- [ ] Operations: regenerar
**Status:** ▶ EM PROGRESSO
```

### PASSO 4: Validações Automáticas (após cada handoff)

Agent executa automaticamente:
```
Após Handoff 1: npm run validate:openapi
Após Handoff 2: npm run validate:cetesb-source
Após Handoff 3: npm run test:integration
...etc
```

**Esperado:**
```
✅ npm run validate:openapi
   [ok] OpenAPI está válido

✅ npm run validate:cetesb-source
   [ok] Coerência confirmada

✅ Próximo: Handoff 2
```

### PASSO 5: Consolidação Final (5 min)

Após todos 6 handoffs:

**Esperado em docs/copilot/13-decision-log.md:**
```
## DL-001
**Status:** ✅ COMPLETADO

### Resumo Final
- Feature: HTTPS Obrigatório
- Duração: 2h 45min
- Handoffs: 6/6 ✅
- Validações: TODAS ✅
- Documentação: ✅ Atualizada
- Pronto para merge: SIM ✅
```

---

## ⏱️ Tempo Total Esperado

```
Planejamento:     5 min
Handoff 1:       20 min → Validação 1 min
Handoff 2:       10 min → Validação 1 min
Handoff 3:       30 min → Validação 1 min
Handoff 4:       20 min → Validação 1 min
Handoff 5:       40 min → Validação 1 min
Handoff 6:       15 min → Validação 1 min
Consolidação:     5 min → Validação final 2 min
                 ─────────
Total:       ~2h 40min
```

---

## ⚠️ Possíveis Cenários

### Cenário 1: Validação Falha ❌

```
npm run validate:openapi FALHOU

O que fazer:
1. Registrado em DL-001 como "Bloqueador"
2. Agent escala para programador-backend-mtr
3. Especialista diagnostica e corrige
4. Volta para validação
5. Continua para Handoff 2 quando passar ✅
```

### Cenário 2: Divergência CETESB 🔄

```
Encontrada divergência:
OpenAPI tem HTTPS obrigatório, mas HAR mostra HTTP

O que fazer:
1. Registrado em DL-001
2. Agent escala para validador-cetesb-mtr
3. Validador investiga: é novo recurso ou ignorado no HAR?
4. Decide estratégia
5. Continua quando resolvido
```

### Cenário 3: Bloqueador Não-Técnico ⏸️

```
Feature depende de mudança em serviço externo

O que fazer:
1. Registrado em DL-001 como "Aguardando"
2. Pausar feature
3. Continuar quando desbloqueado
4. DL-001 registra checkpoint
```

---

## 🎯 Checklist: Primeira Execução

Antes de iniciar:
- [ ] Leu guias de 15 min
- [ ] Feature identificada (2+ camadas)
- [ ] Especialistas disponíveis
- [ ] Reservou 2-6 horas
- [ ] VS Code aberto
- [ ] Terminal pronto

Durante execução:
- [ ] Decision-log monitorado
- [ ] Validações passando
- [ ] Sem blocadores críticos
- [ ] Especialistas recebendo contexto claro

Após conclusão:
- [ ] DL-XXX marcado ✅ COMPLETADO
- [ ] docs/copilot/14-estrutura-copilot.md atualizado
- [ ] npm run validate (TODAS) passando
- [ ] Pronto para merge ✅

---

## 📖 Referências Rápidas

| Preciso de... | Consulte... |
|---------------|-----------|
| Começar rápido | `.github/EXECUTOR-HANDOFFS-GUIA.md` |
| Referência rápida | `docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md` |
| Estratégia completa | `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md` |
| Acompanhar progresso | `docs/copilot/13-decision-log.md` (em tempo real) |
| Troubleshooting | `.github/skills/handoff-automation.md` |

---

## 💬 Dúvidas Frequentes

### P: Posso pausar e continuar depois?
**R:** Sim! Decision-log é seu checkpoint. Continue do próximo handoff.

### P: E se eu cometer erro durante planejamento?
**R:** Decision-log é editável. Corrija planejamento antes de Handoff 1.

### P: Quanto tempo leva mesmo?
**R:** Simples (2 camadas) = 45 min; Média (6 camadas) = 2-3h; Complexa (6+ com iterações) = 4-8h.

### P: Preciso acompanhar todo o tempo?
**R:** Não é necessário. Agent trabalha autonomamente. Revise entre handoffs ou ao final.

### P: Se falhar algo, perde o trabalho?
**R:** Não! Tudo está em DL-XXX. Especialista corrige e continua.

---

## ✅ Pronto para Começar!

```
1. Escolha feature com 2+ camadas
2. Abra VS Code Chat
3. Use: @workspace #executor-handoffs
4. Digite: /handoff [descrição]
5. Acompanhe decision-log
6. Validações automáticas entre handoffs
7. Consolidação quando tudo pronto ✅

Tempo total: 2-6 horas (incluindo especialistas)
Resultado: Feature 100% pronta para merge
```

**🚀 Boa sorte! Use `/handoff` agora!**

