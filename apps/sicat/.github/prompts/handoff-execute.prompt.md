---
name: handoff-execute
description: Executar uma demanda já definida com handoffs por fase, validação contínua e consolidação obrigatória
agent: executor-handoffs
argument-hint: "descrição da feature ou demanda"
---

<!-- markdownlint-disable MD022 MD031 MD032 MD040 -->

# Executar Handoff Multi-Camada

Use este prompt quando você já quer partir da demanda para execução em fases pelo `executor-handoffs`.

## Como Usar

Descreva a demanda e, se necessário, inclua contexto adicional:

```
@workspace #executor-handoffs

/handoff-execute Adicione autenticação OAuth 2.0 com Google e GitHub

Contexto:
- Feature: Login via OAuth 2.0 (Google + GitHub)
- Impacto estimado: camadas necessárias (Contrato, CETESB, Gateway, Banco, Testes, Docs)
- Prazo: Hoje
```

Ou mais simples:

```
/handoff-execute Implemente cancelamento de manifesto com auditoria de logs
```

## O Que Acontece

O executor deve:

1. **Decompor a demanda** em fases e dependências.
2. **Escolher especialistas** adequados para cada fase.
3. **Executar a sequência** com validação após cada etapa.
4. **Usar preset coordenado** quando a demanda for operacional/transversal.
5. **Consolidar a entrega** com DL, artefatos e validações finais.

## Fases típicas

- **Contrato/OpenAPI** → `programador-backend-mtr`
- **Validação CETESB/HAR** → `validador-cetesb-mtr`
- **Gateway/integração** → `integrador-cetesb-mtr`
- **Banco/fila/worker** → `postgres-queue-mtr`
- **Frontend/superfície operacional** → especialista dono da área
- **Testes** → `tester-qa-mtr`
- **Docs/finalização** → `documentador-mtr`

## Preset frente operacional coordenada

Quando a demanda atravessar integração, persistência, observabilidade e superfícies operacionais/admin, o executor deve:

1. criar/atualizar `DL-XXX`
2. preparar o kit observável com `handoff:front:prepare`
3. organizar as lanes por independência de arquivos
4. serializar conflitos
5. fechar com `tester-qa-mtr` e `documentador-mtr`

## Documentação Automática

Cada handoff atualiza:
- ✅ `docs/copilot/13-decision-log.md` (DL-XXX)
- ✅ `docs/copilot/handoffs/DL-XXX/` quando aplicável
- ✅ `docs/copilot/14-estrutura-copilot.md` quando houver impacto estrutural/meta
- ✅ validações apropriadas por fase

## Referências

- `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- `docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md`
- `.github/instructions/executor-handoffs.instructions.md`
- `.github/agents/executor-handoffs.agent.md`

## Convenção de Artefatos
- `docs/copilot/handoffs/DL-XXX/` para documentação final da DL
- `docs/copilot/handoffs/DL-XXX/execution/` para materiais operacionais de execução
- Não gerar arquivos `HANDOFF-*` na raiz de `docs/copilot/`

---

## Exemplos

### Simples (1-2 camadas)
```
/handoff-execute Adicione campo "internalNotes" opcional em manifestos
```

### Média (4-5 camadas)
```
/handoff-execute Implemente autenticação JWT com refresh tokens
```

### Complexa (6+ camadas)
```
/handoff-execute Redesenhe fluxo de cadastro para suportar CNAE múltiplos
```
