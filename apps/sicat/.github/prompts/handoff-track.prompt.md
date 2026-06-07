---
name: handoff-track
description: Visualizar status de uma execução multi-camada a partir do DL, artefatos de handoff e próximos passos
agent: executor-handoffs
argument-hint: "número DL ou nome da feature"
---

<!-- markdownlint-disable MD040 -->

# Acompanhar Progresso de Handoff

Use este prompt para pedir ao `executor-handoffs` um resumo de progresso, bloqueios e próximos passos de uma execução em andamento.

## Como Usar

```
@workspace #executor-handoffs

/handoff-track DL-001

ou

/handoff-track OAuth 2.0 Authentication
```

## Resultado Esperado

O executor deve:

1. **Localizar decision-log entry**
   - Buscar DL-XXX ou feature name
   - Ler conteúdo completo

2. **Verificar artefatos relacionados**
   - `docs/copilot/handoffs/DL-XXX/`
   - `docs/copilot/handoffs/DL-XXX/execution/` quando existir

3. **Extrair status de cada fase/handoff**
   - Qual está em progresso?
   - Qual está bloqueado?
   - Qual foi completado?

4. **Mostrar próximos passos**
   - O que vem a seguir?
   - Quem é responsável?
   - Qual validação falta?

5. **Identificar blocadores**
   - Se houver blocador, destacar
   - Ação necessária para desbloquear

6. **Resumir progresso**
   - quantas fases concluídas
   - fase atual
   - risco residual

## Exemplo de Saída

```
## STATUS: OAuth 2.0 Authentication (DL-001)

### Progresso Geral
Handoffs Completados: 2/N
Tempo Decorrido: 1h 15min
Tempo Estimado: 3h
Próximo Milestone: Handoff 3 (Gateway)

### Status por Handoff

✅ **Handoff 1: Contrato** (COMPLETADO - 18min)
   Especialista: programador-backend-mtr
   Arquivos: OpenAPI, examples, operations
   Validação: ✅ npm run validate:openapi

✅ **Handoff 2: Validação CETESB** (COMPLETADO - 8min)
   Especialista: validador-cetesb-mtr
   Resultado: Nenhuma divergência
   Validação: ✅ npm run validate:cetesb-source

▶️ **Handoff 3: Gateway** (EM PROGRESSO - 7min)
   Especialista: integrador-cetesb-mtr
   Tarefas:
   - [ ] Implementar OAuth provider Google
   - [ ] Implementar OAuth provider GitHub
   - [ ] Atualizar session-context-service
   ETA: +23 min (até 11h55)

⏳ **Handoff 4: Banco** (AGUARDANDO)
   Especialista: postgres-queue-mtr
   Estimado: 30min
   Pré-requisito: Handoff 3 ✅ (6min para disponível)

⏳ **Handoff 5: Testes** (AGUARDANDO)
   Especialista: tester-qa-mtr
   Estimado: 45min
   Pré-requisito: Handoff 4

⏳ **Handoff 6: Documentação** (AGUARDANDO)
   Especialista: documentador-mtr
   Estimado: 20min
   Pré-requisito: Handoff 5

### Próximo Passo
Aguardar conclusão de Handoff 3 (Gateway)
→ ETA: ~23 minutos
→ Responsável: integrador-cetesb-mtr
→ Link para comunicação: [DL-001 em docs/copilot/13-decision-log.md]

### Observações
Sem blocadores identificados. Progresso dentro do estimado.
```

## Referências

- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/copilot/handoffs/`
- `.github/agents/executor-handoffs.agent.md`
