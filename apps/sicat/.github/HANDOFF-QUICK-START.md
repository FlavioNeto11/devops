---
name: handoff-quick-start
description: Guia rápido - Como usar o novo prompt unificado /handoff
---

# ⚡ Quick Start - Prompt Unificado /handoff

Use este fluxo para demandas multi-owner ou cadeias já explícitas.

Pedidos isolados de subir ambiente local, subir stack local, deixar localhost no ar ou preparar ambiente para validar não devem começar por `/handoff`; o caminho correto é execução direta em `estrutura-vscode-mtr` ou via `orquestrador-mtr` para roteamento simples.

## Escolha a entrada certa

| Caso | Entrada recomendada |
| --- | --- |
| Implementação ou mudança com mais de um owner, fase ou validação encadeada | `@workspace #executor-handoffs` + `/handoff ...` |
| Operação isolada de localhost, stack local, tasks, debug ou preparo do workspace para validação manual | `@workspace #estrutura-vscode-mtr` ou prompt `/evoluir-estrutura-vscode ...` |

## Entrada direta para localhost isolado

Use uma destas entradas quando o pedido for somente operacional e terminar no próprio workspace local:

```text
@workspace #estrutura-vscode-mtr
Suba a stack local completa e deixe localhost pronto para validação manual.
```

```text
/evoluir-estrutura-vscode
Melhoria: criar ou ajustar tasks para subir api, worker e frontend localmente com restart previsível
Critérios: localhost pronto para validar e fluxo documentado no workspace
```

Se o pedido também incluir implementação, QA, documentação ou outro owner, volte para a trilha com handoff.

## 3 Passos para Demandas em Cadeia

```text
1️⃣  @workspace #executor-handoffs

2️⃣  /handoff Descrição da sua feature

3️⃣  Acompanhar docs/copilot/13-decision-log.md
    ✅ Feature pronta em 2-6 horas
```

---

## Exemplos Prontos para Copiar/Colar

Use os exemplos abaixo apenas quando a solicitação realmente exigir cadeia multi-owner.

### Exemplo 1: Simples (45 min)

```text
@workspace #executor-handoffs
/handoff Adicione campo "internalNotes" opcional em manifestos
```

### Exemplo 2: Média (2-3 horas) - MAIS COMUM

```text
@workspace #executor-handoffs
/handoff Implemente autenticação JWT com refresh tokens
```

### Exemplo 3: Complexa (4-6 horas)

```text
@workspace #executor-handoffs
/handoff Redesenhe fluxo de cadastro para suportar CNAE múltiplos
```

---

## O Que Acontece Automaticamente?

```text
✅ PLANEJAMENTO (5 min)
   └─ Decompõe em camadas
   └─ Identifica dependências
   └─ Cria task list

✅ HANDOFFS (2-4 horas)
   ├─ 1️⃣  Contrato (programador-backend)
   ├─ 2️⃣  CETESB (validador-cetesb)
   ├─ 3️⃣  Gateway (integrador-cetesb)
   ├─ 4️⃣  Banco (postgres-queue)
   ├─ 5️⃣  Testes (tester-qa)
   └─ 6️⃣  Docs (documentador)

✅ CONSOLIDAÇÃO (5 min)
   └─ Valida TUDO
   └─ Confirma pronto
```

---

## Documentação Automática

Cada handoff atualiza:

- ✅ `docs/copilot/13-decision-log.md` (DL-XXX)
- ✅ `docs/copilot/14-estrutura-copilot.md` (status)
- ✅ Validações (npm run validate)

---

## Modo Avançado (Opcional)

Se preferir controle granular:

```text
/handoff-plan "Sua feature"      # Planeje primeiro
/handoff-execute "Sua feature"   # Depois execute
/handoff-track DL-XXX            # Acompanhe progresso
```

Ou direto no agent:

```text
@workspace #executor-handoffs
[descrição detalhada da feature com contexto]
```

---

## Estimativa de Tempo

| Complexidade | Tempo | Exemplo |
| --- | --- | --- |
| 🟢 Simples | 45 min | Adicionar campo opcional |
| 🟡 Média | 2-3h | API novo endpoint |
| 🔴 Complexa | 4-6h | Redesenho de fluxo |

---

## Referências Rápidas

- 📖 **Documentação completa**: `docs/copilot/handoffs/guias/PROMPT-UNIFICADO-HANDOFF.md`
- 📚 **Estratégia detalhada**: `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- 🤖 **Agent completo**: `.github/agents/executor-handoffs.agent.md`

---

## Pronto?

```text
Se a demanda for multi-owner:

@workspace #executor-handoffs
/handoff [sua descrição aqui]
```

```text
Se a demanda for só de localhost/stack local:

@workspace #estrutura-vscode-mtr
[descreva a operação local desejada]
```

Ou execute diretamente `/evoluir-estrutura-vscode` no Copilot Chat quando o pedido for apenas operacional.
