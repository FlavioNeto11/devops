# Quick Reference: Orquestração de Handoffs

## TL;DR

Use esta estrutura para features que impactam múltiplas camadas:

```
1. PLANEJAMENTO (5 min) → identifique camadas e ordem
2. CONTRATO (programador-backend-mtr) → OpenAPI + examples
3. CETESB (validador-cetesb-mtr) → validar coerência com HAR
4. INTEGRAÇÃO (integrador-cetesb-mtr) → validadores + gateway
5. BANCO (postgres-queue-mtr) → migrations (se aplicável)
6. TESTES (tester-qa-mtr) → cobertura completa
7. DOCS (documentador-mtr) → arquitetura, modelo, roadmap
8. CONSOLIDAÇÃO (você) → validações finais + merge
```

Entre cada etapa:
- ✅ Update `docs/copilot/14-estrutura-copilot.md`
- ✅ Update `docs/copilot/13-decision-log.md`
- ✅ `npm run validate` (apropriado)

## Tempo Estimado

- Feature simples (1 camada): 30 min
- Feature média (3-4 camadas): 2 horas
- Feature complexa (5+ camadas): 4-6 horas

## Checklist Rápido

### Antes de cada handoff

```markdown
- [ ] decision-log criado/atualizado com objetivo
- [ ] docs/copilot/ marca status "em progresso"
- [ ] especialista tem contexto claro (DL + docs)
- [ ] próximo especialista identificado
```

### Depois de cada handoff

```markdown
- [ ] Resultado integrado no codebase
- [ ] npm run validate/test passa (apropriado)
- [ ] decision-log atualiza com resultado
- [ ] docs/copilot/ reflete progresso
- [ ] Nenhum bloqueador para próximo handoff
```

## Matriz de Validações

| Handoff | Validação | Comando |
|---|---|---|
| 1 Contrato | OpenAPI | `npm run validate:openapi` |
| 2 CETESB | Source-of-truth | `npm run test:source-of-truth` |
| 3 Integração | Integração | `npm run test:integration` |
| 4 Banco | Banco | `npm run test:integration` |
| 5 Testes | Contrato + Unitários | `npm run test:contract && npm run test` |
| 6 Docs | Manual review | ✅ |
| 8 Consolidação | TODAS | Todos acima + verificação final |

## Template Mínimo de Decision-Log

```markdown
## DL-XXX
**Tema:** [Feature name]
**Especialistas:** backend, cetesb, integrador, testes, docs
**Status:** EM PROGRESSO

### Handoffs
- [ ] 1. Contrato (programador-backend)
- [ ] 2. CETESB (validador-cetesb)
- [ ] 3. Integração (integrador-cetesb)
- [ ] 4. Banco (postgres-queue)
- [ ] 5. Testes (tester-qa)
- [ ] 6. Docs (documentador)

**Final:** [Preenchido após completar]
```

## Handoff Command Template

```bash
# Substitua XXX e [escopo]
runSubagent({
  prompt: "[prompt do especialista]",
  description: "handoff-N-[escopo]"
})
```

## Common Issues

**Problema**: Validação falha no handoff 2?  
**Solução**: Validador encontrou divergência com HAR. Registre em DL e escale para especialista apropriado.

**Problema**: Próximo handoff quer mudar algo do handoff anterior?  
**Solução**: Não volte. Registre mudança em novo DL, escale para especialista apropriado.

**Problema**: Quanto tempo isso vai levar?  
**Resposta**: ~2h para feature média (3-4 camadas), incluindo espera por especialistas.

## Referências

- **Estratégia completa**: `ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- **Orquestrador atualizado**: `.github/agents/orquestrador-mtr.agent.md`
- **Decision-log**: `docs/copilot/13-decision-log.md`
- **Estrutura**: `docs/copilot/14-estrutura-copilot.md`

