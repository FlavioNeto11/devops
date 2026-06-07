# 🚀 Executor de Handoffs: Guia de Uso Rápido

## O que é?

Sistema de orquestração automática para executar features multi-camada com **documentação contínua, validações automáticas e rastreabilidade 100%**.

---

## Quando usar?

Use o executor quando sua feature impacta **2 ou mais camadas técnicas**:

| Impacto | Recomendação | Tempo |
|---------|--------------|-------|
| 1 camada (ex: apenas docs) | Implementar direto | 15 min |
| 2 camadas (ex: contrato + banco) | Usar executor | 45 min |
| 3-5 camadas | **Usar executor** ⭐ | 2-3 horas |
| 6+ camadas | Usar executor + riscos elevados | 4-8 horas |

---

## Como Começar em 3 Passos

### 1️⃣ Descreva a Feature

```
@workspace #executor-handoffs

/handoff Adicione autenticação OAuth 2.0 com Google e GitHub
```

### 2️⃣ Acompanhe a Orquestração

Agent irá:
- Planejar decomposição em camadas e HANDOFFs necessários
- Criar decision-log (DL-XXX)
- Executar HANDOFFs sequenciais (conforme planejado)
- Validar entre cada etapa
- Consolidar com documentação estruturada

### 3️⃣ Revise o Decision-Log

Monitorar progresso em: `docs/copilot/13-decision-log.md`

---

## Prompts Disponíveis

| Prompt | Uso | Comando |
|--------|-----|---------|
| **handoff-execute** ⭐ | Executar feature completa | `/handoff [descrição]` |
| **handoff-plan** | Planejar antes de executar | `/planejar [descrição]` |
| **handoff-track** | Acompanhar progresso | `/acompanhar DL-XXX` |

---

## Arquitetura

```
executor-handoffs (agent)
├─ executor-handoffs.instructions.md (regras)
├─ handoff-automation.md (skill)
├─ handoff-execute.prompt.md (executar)
├─ handoff-plan.prompt.md (planejar)
└─ handoff-track.prompt.md (acompanhar)

Integrado com:
├─ orquestrador-mtr.agent.md (master orchestration)
├─ programador-backend-mtr (contrato)
├─ validador-cetesb-mtr (CETESB)
├─ integrador-cetesb-mtr (gateway)
├─ postgres-queue-mtr (banco/fila)
├─ tester-qa-mtr (testes)
└─ documentador-mtr (docs)
```

---

## Fluxo Detalhado

### Fase 1: PLANEJAMENTO (5 min)
- Decompor feature em 6 camadas
- Identificar ordem de execução
- Registrar riscos e critérios

### Fase 2-7: HANDOFFS SEQUENCIAIS (2-4 horas)
Padrão para cada handoff:
- **PRÉ**: atualizar docs + decision-log
- **DURANTE**: especialista executa
- **PÓS**: validar + atualizar docs

1. **Contrato** (programador-backend-mtr) - 20 min
2. **Validação CETESB** (validador-cetesb-mtr) - 10 min
3. **Gateway** (integrador-cetesb-mtr) - 30 min
4. **Banco** (postgres-queue-mtr) - 20 min
5. **Testes** (tester-qa-mtr) - 40 min
6. **Documentação** (documentador-mtr) - 15 min

### Fase 8: CONSOLIDAÇÃO (5 min)
- Executar suite completa de validações
- Confirmar pronto para merge
- Marcar feature como COMPLETADA

---

## Validações Automáticas

Entre cada handoff:

```bash
# Após contrato
npm run validate:openapi

# Após CETESB
npm run validate:cetesb-source

# Após gateway/banco
npm run test:integration

# Após testes
npm run test
npm run test:contract

# Consolidação: TODAS
npm run validate:openapi && \
npm run validate:cetesb-source && \
npm run test:source-of-truth && \
npm run test:integration && \
npm run test
```

---

## Decision-Log Automático

Agent cria e atualiza automaticamente em `docs/copilot/13-decision-log.md`:

```markdown
## DL-XXX
**Feature**: [nome]
**Status**: 🔄 EM PROGRESSO - Handoff 2/6

### Handoff 1: Contrato ✅ COMPLETADO
- OpenAPI atualizado
- Examples criados
- Validação: ✅ npm run validate:openapi

### Handoff 2: Validação CETESB ▶️ EM PROGRESSO
- Validando coerência com HAR
...
```

---

## Referências Importantes

| Documento | Conteúdo |
|-----------|----------|
| `ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md` | Estratégia completa (330 linhas) |
| `QUICK-REFERENCE-HANDOFFS.md` | Referência rápida (100 linhas) |
| `executor-handoffs.agent.md` | Agent definição (400 linhas) |
| `executor-handoffs.instructions.md` | Instructions detalhadas (300 linhas) |
| `handoff-automation.md` | Skill passo-a-passo |
| `14-estrutura-copilot.md` | Estrutura técnica |

---

## Exemplos Rápidos

### Exemplo 1: Feature Simples (1 campo)
```
/handoff Adicione campo "internalNotes" opcional em manifestos

Resultado:
- Tempo: 45 min
- Handoffs: 2 (contrato + docs)
- Validações: openapi + manual review
- Pronto para merge ✅
```

### Exemplo 2: Feature Média (autenticação)
```
/handoff Implemente autenticação JWT com refresh tokens

Resultado:
- Tempo: 2-3 horas
- Handoffs: 6 completos
- Validações: todas passando
- DL-XXX com histórico completo
- Pronto para merge ✅
```

### Exemplo 3: Feature Complexa (redesenho)
```
/handoff Redesenhe fluxo de cadastro para suportar CNAE múltiplos

Resultado:
- Tempo: 5-6 horas
- Handoffs: 6+ (pode ter iterações se riscos)
- Validações: todas + aprovação especialista
- DL-XXX com riscos resolvidos
- Pronto para merge ✅
```

---

## Dúvidas Frequentes

### P: E se uma validação falhar?
**R**: Agent registra em decision-log como "Bloqueador" e escala para especialista apropriado. Não continua para próximo handoff.

### P: E se encontrar divergência CETESB?
**R**: Agent registra divergência em decision-log e escala para `validador-cetesb-mtr` para investigar e coordenar solução.

### P: Quanto tempo leva?
**R**: 
- Simples (1-2 camadas): 45 min
- Média (4-5 camadas): 2-3 horas
- Complexa (6+ camadas): 4-8 horas

### P: Posso pausar e continuar depois?
**R**: Sim! Decision-log serve como checkpoint. Continue do ponto onde parou (próximo handoff).

### P: Preciso acompanhar todo tempo?
**R**: Não é necessário. Agent trabalha autonomamente. Revise decision-log entre handoffs ou ao final.

---

## Status de Implementação

✅ **Agent executor-handoffs criado**
✅ **Instructions e skill implementados**
✅ **3 prompts operacionais criados**
✅ **Integrado com orquestrador-mtr**
✅ **Documentação sincronizada**
✅ **Pronto para usar em produção**

---

## Próximos Passos

1. Use `/handoff [descrição]` para próxima feature multi-camada
2. Monitorar decision-log em `docs/copilot/13-decision-log.md`
3. Validações automáticas entre cada handoff
4. Consolidação automática quando tudo estiver pronto

**🎉 Pronto para começar! Use `/handoff` para iniciar sua próxima feature.**

