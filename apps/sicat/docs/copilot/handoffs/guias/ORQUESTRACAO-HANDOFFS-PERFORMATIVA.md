# Orquestração de Handoffs: Estratégia Performática e Documentada

## Objetivo

Estruturar forma mais performática e útil de integrar todos os handoffs no orquestrador, sempre atualizando a documentação entre cada etapa e estruturando tudo necessário.

## Visão Geral

A estratégia divide demandas multi-camada em **7 fases sequenciais** com **documentação contínua** e **validações automáticas** entre etapas.

```
┌──────────────────────────────────────────────────────────┐
│ ORQUESTRADOR (você)                                      │
│                                                          │
│ 1. PLANEJAMENTO                                          │
│    └─ Identificar camadas, ordem, dependências          │
│                                                          │
│ 2. PRÉ-HANDOFF #1 (Contrato)                           │
│    ├─ Update docs/copilot/ (status em progresso)        │
│    ├─ Create/update decision-log entry                  │
│    └─ Send → programador-backend-mtr                    │
│                                                          │
│ 3. PÓS-HANDOFF #1 + PRÉ-HANDOFF #2 (Validação CETESB) │
│    ├─ Integrar resultado #1                             │
│    ├─ npm run validate:cetesb-source                    │
│    ├─ Update docs/copilot/ (confirmar coerência)        │
│    └─ Send → validador-cetesb-mtr                       │
│                                                          │
│ 4. PÓS-HANDOFF #2 + PRÉ-HANDOFF #3 (Integração)        │
│    ├─ Integrar resultado #2                             │
│    ├─ npm run test:source-of-truth                      │
│    └─ Send → integrador-cetesb-mtr                      │
│                                                          │
│ 5. PÓS-HANDOFF #3 + PRÉ-HANDOFF #4 (Banco)             │
│    ├─ Integrar resultado #3                             │
│    ├─ npm run test:integration                          │
│    └─ Send → postgres-queue-mtr (se aplicável)          │
│                                                          │
│ 6. PÓS-HANDOFF #4 + PRÉ-HANDOFF #5 (Testes)            │
│    ├─ Integrar resultado #4                             │
│    ├─ npm run test (validações intermediárias)          │
│    └─ Send → tester-qa-mtr                              │
│                                                          │
│ 7. PÓS-HANDOFF #5 + PRÉ-HANDOFF #6 (Documentação)      │
│    ├─ Integrar resultado #5                             │
│    ├─ Todos testes passam                               │
│    └─ Send → documentador-mtr                           │
│                                                          │
│ 8. CONSOLIDAÇÃO FINAL                                   │
│    ├─ Integrar resultado #6                             │
│    ├─ npm run validate (TODAS as validações)            │
│    ├─ Update docs/copilot/ (remover "em progresso")     │
│    ├─ Registrar em decision-log: "Completado"           │
│    └─ Ready to merge                                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Fases Detalhadas

### Fase 1: Planejamento (você)

**Duração**: 5-10 min  
**Saída**: task list documentada

```markdown
## Demanda: [Descrição]

### Análise de Impacto
- [ ] Contrato HTTP (OpenAPI, examples)
- [ ] Validação CETESB (validar com HAR)
- [ ] Integração (gateway, session, payloads)
- [ ] Banco (schema, migrations)
- [ ] Testes (cobertura de sucesso/falha)
- [ ] Documentação (docs/copilot/)

### Ordem de Execução (dependency-first)
1. Contrato (define interface) → programador-backend-mtr
2. Validação CETESB (valida coerência) → validador-cetesb-mtr
3. Integração (usa contrato) → integrador-cetesb-mtr
4. Banco (se aplicável) → postgres-queue-mtr
5. Testes (cobre tudo) → tester-qa-mtr
6. Documentação (descreve tudo) → documentador-mtr

### Riscos Identificados
- [lista riscos]

### Critério de Pronto
- Todos testes passam
- decision-log atualizado
- docs/copilot/ sincronizado
```

### Fase 2: Handoff #1 - Contrato (programador-backend-mtr)

**PRÉ-HANDOFF (você)**:
```bash
# 1. Update docs/copilot/14-estrutura-copilot.md
# Adicionar na seção apropriada:
## ✅ [Feature Name] (2026-03-08 - em progresso)
- Handoff 1/6: Contrato OpenAPI
  - Status: ▶ EM PROGRESSO

# 2. Create/Update decision-log
# docs/copilot/13-decision-log.md:
## DL-XXX
**Tema:** [descrição da feature]
**Data:** 2026-03-08
**Especialistas envolvidos:** programador-backend-mtr, validador-cetesb-mtr, ...
**Status:** 🔄 EM PROGRESSO - Handoff 1/6 (Contrato)

# 3. Enviar para especialista
runSubagent({
  prompt: "Implemente a próxima etapa do backend Node.js em JavaScript ESM...",
  description: "handoff-1-contrato-openapi"
})
```

**ESPECIALISTA EXECUTA**:
- Atualiza `openapi/mtr_automacao_openapi_interna.yaml`
- Cria `examples/` correspondentes
- Regenera `src/generated/operations.js`
- Registra mudança em `docs/copilot/`

**PÓS-HANDOFF (você)**:
```bash
# 1. Integrar resultado
# - Verificar arquivos alterados
# - Confirmar que OpenAPI está válido
# - Revisar examples criados

# 2. Validação intermidiária
npm run validate:openapi
# Esperado: passing

# 3. Update decision-log
## DL-XXX
**Status:** 🔄 EM PROGRESSO - Handoff 2/6 (Validação CETESB)
**Handoff 1 Completado:**
- OpenAPI: ✓ XXX operações, YYY schemas
- Examples: ✓ ZZ arquivos criados
- Próximo: validador-cetesb-mtr para confirmar coerência com HARs

# 4. Próximo handoff
runSubagent({ 
  prompt: "Audite coerência entre implementação e evidência real em docs/cetesb/...",
  description: "handoff-2-validacao-cetesb"
})
```

### Fase 3: Handoff #2 - Validação CETESB (validador-cetesb-mtr)

**PRÉ-HANDOFF (você)**:
```bash
# Update docs/copilot/14-estrutura-copilot.md
## ✅ [Feature Name] (2026-03-08 - em progresso)
- Handoff 2/6: Validação CETESB
  - Status: ▶ EM PROGRESSO
```

**ESPECIALISTA EXECUTA**:
- Executa `npm run auditar-coerencia-cetesb all`
- Valida se novo contrato está alinhado com HARs
- Se divergência: registra em decision-log e escala para especialista apropriado
- Confirma coerência documentada

**PÓS-HANDOFF (você)**:
```bash
# 1. Integrar resultado
npm run test:source-of-truth
# Esperado: 2/2 passing

# 2. Update decision-log
## DL-XXX
**Status:** 🔄 EM PROGRESSO - Handoff 3/6 (Integração CETESB)
**Handoff 2 Completado:**
- Coerência: ✓ OpenAPI está alinhado com HARs
- Divergências: [nenhuma | lista + como resolvidas]
- Próximo: integrador-cetesb-mtr para implementação de validadores/gateway

# 3. Próximo handoff
runSubagent({ 
  prompt: "Evolua a integração real com a CETESB considerando...",
  description: "handoff-3-integracao-cetesb"
})
```

### Fase 4: Handoff #3 - Integração CETESB (integrador-cetesb-mtr)

**ESPECIALISTA EXECUTA**:
- Implementa validadores em `src/lib/validators/`
- Atualiza `src/gateways/cetesb-gateway.js`
- Alinha `src/services/` com novo contrato
- Registra mudanças documentadas

**PÓS-HANDOFF (você)**:
```bash
npm run test:integration
# Validar que integração funciona com novo contrato
```

### Fase 5: Handoff #4 - Banco (postgres-queue-mtr)

**ESPECIALISTA EXECUTA** (se aplicável):
- Cria migration em `src/sql/` se necessário
- Atualiza `src/repositories/` se schema mudou
- Testa com dados reais

**PÓS-HANDOFF (você)**:
```bash
npm run test:integration
# Validar que banco está sincronizado
```

### Fase 6: Handoff #5 - Testes (tester-qa-mtr)

**ESPECIALISTA EXECUTA**:
- Cria testes em `tests/unit/`, `tests/integration/`, `tests/api/`
- Cobre sucesso + falha para novo contrato
- Atualiza `tests/README.md`

**PÓS-HANDOFF (você)**:
```bash
npm run test
# Esperado: todos testes passando
npm run test:contract
# Esperado: validações de contrato passando
```

### Fase 7: Handoff #6 - Documentação (documentador-mtr)

**ESPECIALISTA EXECUTA**:
- Atualiza `docs/copilot/02-arquitetura.md`
- Atualiza `docs/copilot/05-modelo-de-dados.md`
- Adiciona entrada em `docs/copilot/10-backlog-executavel.md`
- Registra em `docs/copilot/09-roadmap.md`

**PÓS-HANDOFF (você)**:
```bash
# Revisar documentação está atualizada
# Confirmar decision-log tem toda história
```

### Fase 8: Consolidação Final (você)

```bash
# 1. Validações completas
npm run validate:openapi
npm run validate:cetesb-source
npm run test:source-of-truth
npm run test:contract
npm run test
npm run test:integration

# 2. Update decision-log final
## DL-XXX
**Tema:** [descrição da feature]
**Status:** ✅ COMPLETADO
**Resumo:**
- OpenAPI: [descrição]
- CETESB: [validação realizada]
- Integração: [resumo]
- Banco: [mudanças se aplicável]
- Testes: [cobertura]
- Documentação: [seções atualizadas]
**Próximos passos:** [se houver]

# 3. Merge
git merge feature/[nome]
```

## Matriz de Validações por Fase

| Fase | Validação | Comando | Status Esperado |
|---|---|---|---|
| 1 | OpenAPI | `npm run validate:openapi` | ✅ |
| 2 | Source-of-truth | `npm run test:source-of-truth` | 2/2 passing |
| 3 | Integração | `npm run test:integration` | ✅ |
| 4 | Banco | `npm run test:integration` | ✅ |
| 5 | Contrato | `npm run test:contract` | 4/4 passing |
| 5 | Unitários | `npm run test` | ✅ |
| 6 | Documentação | Manual review | ✅ |
| 8 | TODAS | All above | ALL PASSING |

## Checklist de Transição Entre Handoffs

Use este checklist ANTES de cada novo handoff:

```markdown
### Handoff N → N+1

- [ ] Resultado de handoff N está integrado no codebase?
- [ ] Validação apropriada passou (npm run validate/test)?
- [ ] decision-log foi atualizado com resultado?
- [ ] docs/copilot/14-estrutura-copilot.md reflete progresso?
- [ ] Próximo especialista tem contexto claro (decision-log)?
- [ ] Não há bloqueadores para próximo handoff?
- [ ] Todos os arquivos modificados em handoff N foram revisados?
```

## Template de Decision-Log para Multi-Handoff

```markdown
## DL-XXX
**Tema:** [Feature Name]
**Data:** 2026-03-08
**Tipo:** Feature multi-camada
**Especialistas:** 
- programador-backend-mtr (contrato)
- validador-cetesb-mtr (coerência)
- integrador-cetesb-mtr (integração)
- postgres-queue-mtr (banco)
- tester-qa-mtr (testes)
- documentador-mtr (docs)

**Status:** 🔄 EM PROGRESSO

### Handoff 1: Contrato (programador-backend-mtr)
- [ ] OpenAPI atualizado
- [ ] Examples criados
- [ ] Operations regeneradas
- **Status:** ⏳ Pendente

### Handoff 2: Validação CETESB (validador-cetesb-mtr)
- [ ] Coerência validada
- [ ] HARs refletidos
- **Status:** ⏳ Aguardando handoff 1

### Handoff 3: Integração (integrador-cetesb-mtr)
- [ ] Validadores implementados
- [ ] Gateway atualizado
- **Status:** ⏳ Aguardando handoff 2

### Handoff 4: Banco (postgres-queue-mtr)
- [ ] Migrations criadas
- [ ] Repositories atualizados
- **Status:** ⏳ Aguardando handoff 3

### Handoff 5: Testes (tester-qa-mtr)
- [ ] Testes unitários criados
- [ ] Testes integração criados
- [ ] Cobertura de contrato
- **Status:** ⏳ Aguardando handoff 4

### Handoff 6: Documentação (documentador-mtr)
- [ ] Arquitetura.md atualizado
- [ ] Modelo-de-dados.md atualizado
- [ ] Roadmap.md atualizado
- **Status:** ⏳ Aguardando handoff 5

**Resumo Final:** [Preenchido após completar todos]
```

## Benefícios desta Estratégia

✅ **Documentação contínua**: cada handoff atualiza decision-log  
✅ **Validação entre etapas**: cada transição valida com npm run  
✅ **Dependency-aware**: ordem respeta dependências técnicas  
✅ **Rastreabilidade**: histórico completo em decision-log  
✅ **Paralelizável**: identifica handoffs que podem ser simultâneos  
✅ **Reduplicable**: protocolo padronizado para todas as features  
✅ **Escalável**: suporta 1-N especialistas em paralelo quando possível  

## Exemplo Real: Implementar novo campo obrigatório

```
DEMANDA: Adicionar campo "companyRegistration" obrigatório em manifestos

PLANEJAMENTO (5 min):
├─ Impactado: Contrato + CETESB + Validador + Testes + Docs
├─ Ordem: Contrato → CETESB → Validador → Testes → Docs
├─ Riscos: HAR pode não ter campo → será divergência
└─ Pronto: Todos testes passam + docs atualizadas

FASE 1: CONTRATO (programador-backend-mtr - 20 min)
├─ OpenAPI POST /v1/manifestos: adicionar field
├─ Examples: atualizar request/response
├─ Generated ops: regenerar
└─ DL-XXX: registrar que adicionado

FASE 2: VALIDAÇÃO (validador-cetesb-mtr - 10 min)
├─ Executar: auditar-coerencia-cetesb all
├─ Encontrado: HAR não tem campo "companyRegistration"
├─ Divergência: campo é obrigatório no OpenAPI mas não está em HAR
└─ DL-XXX: registrar divergência + próximo passo

FASE 3: RESOLUÇÃO (você + integrador-cetesb-mtr - 30 min)
├─ Decidir: campo é novo ou foi ignorado no HAR?
├─ Se novo: deixar como validation rule + comentário
├─ Se ignorado: contactar CETESB para novo HAR
├─ manifest-validator: adicionar regra para campo obrigatório
└─ DL-XXX: registrar decisão

FASE 4: TESTES (tester-qa-mtr - 30 min)
├─ Test com campo presente: ✓ 200
├─ Test sem campo: ✓ 400 Bad Request
├─ Test com valor inválido: ✓ 400 Validation Error
└─ Cobertura completa

FASE 5: DOCS (documentador-mtr - 15 min)
├─ Modelo-de-dados: adicionar field
├─ Arquitetura: notar nova validação
├─ Roadmap: marcar como completo
└─ DL-XXX: final status ✅

CONSOLIDAÇÃO (5 min):
├─ npm run validate:openapi ✅
├─ npm run test:source-of-truth ✅ 2/2
├─ npm run test ✅ todos passing
├─ DL-XXX: status ✅ COMPLETADO
└─ Ready to merge

TEMPO TOTAL: ~2 horas (com handoffs sequenciais)
DOCUMENTAÇÃO: 100% rastreada em DL-XXX
```

## Automação Futura

Para acelerar ainda mais, considere:

1. **Script de prep**: automatizar criação de DL template
2. **CI/CD integration**: validações automáticas após cada handoff
3. **Status board**: visualizar progresso em tempo real
4. **Auto-escalation**: se validação falha, escalar para especialista apropriado

## Referências

- `.github/agents/orquestrador-mtr.agent.md` - estratégia detalhada
- `docs/copilot/13-decision-log.md` - histórico de decisões
- `docs/copilot/14-estrutura-copilot.md` - estrutura meta
- Handoffs: `programador-backend`, `validador-cetesb`, `integrador-cetesb`, `postgres-queue`, `tester-qa`, `documentador`

