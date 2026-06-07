# Skill: Handoff Executor Continuous

**Objetivo:** Executar handoffs sequenciais sem interrupção até conclusão total da feature.

---

## Quando Usar

Use esta skill quando:
- Feature requer múltiplos HANDOFFs (contrato → CETESB → gateway → banco → testes → docs)
- Demanda é clara: "Implemente [feature] com [requisito]"
- Planejamento de HANDOFFs necessários está documentado em decision-log

**NÃO use quando:**
- Feature é simples (1-2 arquivos)
- Apenas investigação/análise
- Apenas documentação

---

## Fluxo de Execução

### Fase 1: Planejamento (5 min)
```
1. Ler decision-log para identificar HANDOFFs necessários
2. Listar dependências entre HANDOFFs
3. Criar TODO list com N itens (HANDOFFs planejados + consolidação)
4. Estimar tempo total
```

### Fase 2: Execução Sequencial (SEM PAUSA)
```
Para cada HANDOFF planejado:
  1. Mark TODO como "in-progress"
  2. Executar implementação
  3. Validar (npm run validate/test conforme camada)
  4. Mark TODO como "completed"
  5. Atualizar decision-log com status
  6. Continuar para próximo HANDOFF (NÃO PARAR)
```

### Fase 2.1: Bolsões de execução (paralelismo controlado)
```
Bolso A (síncrono): Contrato → Validação CETESB
Bolso B (síncrono): Integração/Gateway → Banco (quando dependentes)
Bolso C (assíncrono): Testes || Documentação (somente sem conflito de arquivos)

Regra de segurança:
  - Se houver conflito de arquivos entre handoffs paralelos, cancelar paralelismo.
  - Voltar para execução sequencial até estabilizar.
```

### Exemplo de paralelismo seguro (Bolso C)
```javascript
// Pré-condição: integração e banco concluídos

// Pode rodar em paralelo se escopos não colidem
await Promise.all([
  runSubagent({ description: 'handoff-testes', prompt: '[...] tester-qa-mtr [...]' }),
  runSubagent({ description: 'handoff-docs', prompt: '[...] documentador-mtr [...]' })
]);

// Consolidação sempre serial
await runFinalConsolidation();
```

### Fase 3: Consolidação (5 min)
```
1. npm run validate:openapi (se alterou OpenAPI)
2. npm run test (sempre)
3. npm run migrate (se criou migration)
4. Verificar 0 erros/warnings novos
5. Atualizar README.md se aplicável
6. Criar pasta docs/copilot/handoffs/[DL-XXX]/ com 4 arquivos:
   - README.md (overview)
   - handoff-summary.md (resumo HANDOFFs)
   - technical-decisions.md (decisões)
   - validation-report.md (validações)
7. Se necessário, salvar materiais operacionais em docs/copilot/handoffs/[DL-XXX]/execution/
```

---

## Enforcement Rules

### ⚠️ NUNCA pare entre HANDOFFs
```javascript
// ERRADO (para após HANDOFF 2)
await executeHandoff2();
console.log('HANDOFF 2 completo');
// [PARA E ESPERA USUÁRIO]

// CORRETO (continua automaticamente)
await executeHandoff2();
console.log('HANDOFF 2 completo, iniciando HANDOFF 3...');
await executeHandoff3();
```

### ⚠️ SEMPRE valide antes de próximo HANDOFF
```javascript
await executeHandoff4();
await validateDatabase(); // ← OBRIGATÓRIO
await executeHandoff5();
```

### ⚠️ SEMPRE consolide ao final
```javascript
await executeHandoff6();
await consolidateFeature(); // ← OBRIGATÓRIO
// - npm run validate:openapi
// - npm run test
// - Decision-log atualizado
// - Pasta handoffs/DL-XXX/ criada
```

---

## Template de TODO List (N/N)

```javascript
manage_todo_list({
  operation: 'write',
  todoList: [
    { id: 1, status: 'in-progress', title: 'HANDOFF 1: Contrato OpenAPI' },
    { id: 2, status: 'not-started', title: 'HANDOFF 2: Gateway Integration' },
    { id: 3, status: 'not-started', title: 'HANDOFF 3: Testes' },
    { id: 4, status: 'not-started', title: 'CONSOLIDAÇÃO: Validações finais' }
  ]
});
```

---

## Template de Pasta de Handoff

```
docs/copilot/handoffs/[DL-XXX]/
├── README.md
│   ├─ Status: ✅ COMPLETO
│   ├─ Tempo total: XX min
│   ├─ Resumo executivo
│   ├─ Estrutura de documentação
│   └─ Referências
│
├── handoff-summary.md
│   ├─ HANDOFF 1: [título] (tempo) ✅
│   │  ├─ Especialista
│   │  ├─ Objetivo
│   │  ├─ Entregáveis
│   │  └─ Validação
│   ├─ HANDOFF 2 a 6 (idem)
│   └─ Métricas gerais
│
├── technical-decisions.md
│   ├─ Decisão 1: [título]
│   │  ├─ Contexto
│   │  ├─ Análise
│   │  ├─ Decisão
│   │  ├─ Justificativa
│   │  └─ Impacto
│   └─ Decisões 2 a N
│
└── validation-report.md
    ├─ Validações executadas (7)
    │  ├─ 1. OpenAPI
    │  ├─ 2. Testes
    │  ├─ 3. Migrations
    │  ├─ 4. Repository
    │  ├─ 5. Contrato
    │  ├─ 6. Examples
    │  └─ 7. Evidência CETESB
    ├─ Checklist de qualidade
    ├─ Métricas finais
    ├─ Riscos e pendências
    └─ Conclusão
```

---

## Anti-Patterns (Evitar)

### ❌ Explosão de Arquivos
```
docs/copilot/
├── HANDOFF-2-SUMARIO.md (3200 linhas) ← EVITAR
├── HANDOFF-2-RELATORIO-FINAL.md (6600 linhas) ← EVITAR
├── HANDOFF-2-CHECKLIST.md (6900 linhas) ← EVITAR
├── HANDOFF-2-CONCLUSAO.md (6000 linhas) ← EVITAR
├── HANDOFF-2-INDICE.md (5600 linhas) ← EVITAR
└── ... (13 arquivos total) ← EVITAR
```

**Correto:**
```
docs/copilot/handoffs/DL-015/
├── README.md (60 linhas)
├── handoff-summary.md (120 linhas)
├── technical-decisions.md (180 linhas)
└── validation-report.md (200 linhas)
Total: 4 arquivos, 560 linhas
```

### ❌ Arquivos na Raiz
```
/
├── HANDOFF-2-LOG.md ← EVITAR (deveria estar em handoffs/DL-XXX/)
├── check-audit-table.js ← EVITAR (temporário, deletar)
└── reset-migration.js ← EVITAR (temporário, deletar)
```

### ❌ Parada Entre HANDOFFs
```
[HANDOFF 1 completo]
[HANDOFF 2 completo]
[PARA E ESPERA USUÁRIO] ← EVITAR
```

**Correto:**
```
[HANDOFF 1 completo] → [HANDOFF 2] → [HANDOFF 3] → ... → [HANDOFF 6] → [CONSOLIDAÇÃO]
(SEM PAUSA)
```

---

## Checklist de Saída

Antes de concluir, verificar:
- [ ] Todos os HANDOFFs planejados executados
- [ ] TODO list N/N completed (N = HANDOFFs planejados + consolidação)
- [ ] npm run validate:openapi ✅ (se OpenAPI alterado)
- [ ] npm run test ✅
- [ ] npm run migrate ✅ (se migrations criadas)
- [ ] 0 erros/warnings novos
- [ ] Decision-log atualizado com todos HANDOFFs
- [ ] Pasta handoffs/DL-XXX/ criada com 4 arquivos
- [ ] Materiais operacionais (se houver) em handoffs/DL-XXX/execution/
- [ ] Arquivos temporários removidos da raiz
- [ ] Nenhum breaking change introduzido

---

## Exemplos de Uso

**Exemplo 1: Feature complexa (6 HANDOFFs)**
```javascript
// Prompt: "Implemente cancelamento de manifesto com auditoria de logs"

1. Análise → DL-015 planejado com 6 HANDOFFs ✅
2. TODO list (7 itens: 6 HANDOFFs + consolidação) ✅
3. HANDOFF 1: Contrato OpenAPI (programador-backend-mtr) ✅
4. HANDOFF 2: Validação CETESB (validador-cetesb-mtr) ✅
5. HANDOFF 3: Gateway (integrador-cetesb-mtr) ✅
6. HANDOFF 4: Database (postgres-queue-mtr) ✅
7. HANDOFF 5: Testes (tester-qa-mtr) ✅
8. HANDOFF 6: Docs (documentador-mtr) ✅
9. CONSOLIDAÇÃO (você) ✅
10. Resultado: ✅ PRONTO (66 min total)
```

**Exemplo 2: Feature simples (2 HANDOFFs)**
```javascript
// Prompt: "Adicionar campo opcional 'observacao' em manifestos"

1. Análise → planejado 2 HANDOFFs ✅
2. TODO list (3 itens: 2 HANDOFFs + consolidação) ✅
3. HANDOFF 1: Contrato OpenAPI (programador-backend-mtr) ✅
4. HANDOFF 2: Docs (documentador-mtr) ✅
5. CONSOLIDAÇÃO (você) ✅
6. Resultado: ✅ PRONTO (15 min total)
```

**Exemplo 3: Feature média (4 HANDOFFs)**
```javascript
// Prompt: "Endpoint para consultar status de manifesto por número"

1. Análise → planejado 4 HANDOFFs ✅
2. TODO list (5 itens: 4 HANDOFFs + consolidação) ✅
3. HANDOFF 1: Contrato (programador-backend-mtr) ✅
4. HANDOFF 2: Gateway (integrador-cetesb-mtr) ✅
5. HANDOFF 3: Testes (tester-qa-mtr) ✅
6. HANDOFF 4: Docs (documentador-mtr) ✅
7. CONSOLIDAÇÃO (você) ✅
8. Resultado: ✅ PRONTO (35 min total)
```

---

**Skill criada:** 2026-03-08  
**Versão:** 1.0  
**Status:** ✅ ATIVO
