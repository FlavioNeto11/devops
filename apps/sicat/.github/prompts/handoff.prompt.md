---
name: handoff
description: Executar demanda multi-camada com decomposição, handoffs por fase, validação contínua e consolidação final
agent: executor-handoffs
argument-hint: "descrição da feature ou demanda (obrigatório)"
---

<!-- markdownlint-disable MD022 MD031 MD032 MD040 -->

# Handoff Multi-Camada

Use este prompt para transformar uma demanda ampla do SICAT em execução por fases com especialistas, validações e fechamento documental.

## Entrada Obrigatória

Este prompt requer uma **descrição objetiva da demanda** como argumento:

```bash
/handoff Implemente autenticação JWT com refresh tokens
/handoff Adicione campo "internalNotes" opcional em manifestos
/handoff Redesenhe fluxo de cadastro para CNAE múltiplos
```

---
## Como usar

```
1️⃣  @workspace #executor-handoffs

2️⃣  /handoff Descrição da sua feature

3️⃣  Acompanhar docs/copilot/13-decision-log.md e docs/copilot/handoffs/
```

## O que o executor faz

1. **Decompor a demanda** em fases técnicas com dependências explícitas.
2. **Escolher o modo de execução**: sequência linear ou frente operacional coordenada.
3. **Acionar especialistas por fase** com contexto claro e objetivo verificável.
4. **Validar cada fase** antes de avançar para a próxima.
5. **Consolidar no final** com decision-log, artefatos de handoff e validações aplicáveis.

## Modos de execução

### Sequência linear
- Use quando a demanda tiver dependências claras entre contrato, integração, banco, testes e docs.

### Frente operacional coordenada
- Use quando a demanda atravessar integração, persistência, observabilidade e superfícies operacionais/admin.
- O executor prepara o kit observável em `docs/copilot/handoffs/DL-XXX/execution/` e fecha serialmente com QA/docs.

## Saída esperada

Ao final, o executor deve deixar claro:

- **Classificação executável:** fases, ordem, donos e validações.
- **Evidência por fase:** o que foi feito, por quem e com qual validação.
- **Consolidação:** `DL-XXX` atualizado, artefatos em `docs/copilot/handoffs/DL-XXX/` quando aplicável e resumo final.
- **Risco residual:** pendências reais ou confirmação de pronto.

## Documentação Automática

Cada handoff atualiza automaticamente:
- ✅ `docs/copilot/13-decision-log.md` (DL-XXX com HANDOFFs executados)
- ✅ `docs/copilot/handoffs/DL-XXX/` (quando a execução pede trilha própria)
- ✅ `docs/copilot/14-estrutura-copilot.md` (quando houver impacto estrutural/meta)
- ✅ validações apropriadas por fase

## Exemplos

### Simples
```bash
/handoff Adicione campo "internalNotes" opcional em manifestos
```

### Moderada
```bash
/handoff Implemente autenticação JWT com refresh tokens
```

### Complexa
```bash
/handoff Redesenhe fluxo de cadastro para suportar CNAE múltiplos
```

## Referências

- `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- `docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md`
- `.github/instructions/executor-handoffs.instructions.md`
- `.github/agents/executor-handoffs.agent.md`

### Convenção de Saída (obrigatória)
- Artefato por DL: `docs/copilot/handoffs/DL-XXX/`
- Artefato operacional por execução: `docs/copilot/handoffs/DL-XXX/execution/`
- Guias gerais de handoff: `docs/copilot/handoffs/guias/`
- Proibido criar `HANDOFF-*` na raiz de `docs/copilot/`
