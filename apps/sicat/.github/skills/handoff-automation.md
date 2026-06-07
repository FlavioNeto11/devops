# 🎯 Skill: Orquestração Automática de Handoffs

**Objetivo**: Padronizar execução de features multi-camada com handoffs sequenciais, documentação contínua e validações automáticas.

**Quando usar**: Feature impacta 2+ camadas técnicas (contrato, CETESB, gateway, banco, testes, docs).

---

## Procedimento Passo-a-Passo

### 1. PLANEJAMENTO (5-10 min)

**Entrada**: Descrição da demanda

**Passos**:

1. **Decompor em camadas**
   - [ ] Contrato HTTP? (OpenAPI, examples, generated)
   - [ ] Validação CETESB? (coerência com HARs)
   - [ ] Integração externa? (gateway, session, payloads)
   - [ ] Banco? (migrations, repositories)
   - [ ] Testes? (unit, integration, E2E)
   - [ ] Documentação? (copilot/, roadmap)

2. **Identificar ordem**
   - [ ] Contrato sempre primeiro
   - [ ] CETESB após contrato
   - [ ] Gateway/Banco após validação
   - [ ] Testes após banco pronto
   - [ ] Docs último

3. **Registrar critérios**
   - [ ] Riscos por camada
   - [ ] Pré-condições
   - [ ] Validações esperadas
   - [ ] Critério de pronto

4. **Criar task list**
   ```markdown
   ## Planejamento: [Feature Name]
   
   ### Camadas Impactadas
   - [ ] 1. Contrato (20 min)
   - [ ] 2. CETESB (10 min)
   - [ ] 3. Gateway (40 min)
   - [ ] 4. Banco (30 min)
   - [ ] 5. Testes (40 min)
   - [ ] 6. Docs (20 min)
   
   ### Tempo Total: ~3 horas
   
   ### Riscos
   - [lista]
   
   ### Critério Pronto
   - [ ] Todos testes passando
   - [ ] Docs atualizadas
   - [ ] npm run validate (TODAS)
   ```

**Saída**: Task list estruturada + DL-XXX template

---

### 2. CRIAR DECISION-LOG ENTRY (você)

**Arquivo**: `docs/copilot/13-decision-log.md`

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

**Status:** 🔄 EM PROGRESSO - Planejamento

### Planejamento
**Camadas**: Contrato, CETESB, Gateway, Banco, Testes, Docs
**Ordem**: Contrato → CETESB → Gateway → Banco → Testes → Docs
**Tempo estimado**: ~3 horas
**Riscos**: [lista]
**Critério pronto**: Todos testes + docs atualizadas

### Handoff 1: Contrato
⏳ Aguardando início

### Demais handoffs planejados: Similar

**Resumo Final**: [Preenchido após consolidação]
```

---

## Bolsões de execução (arquitetura recomendada)

- **Bolso Síncrono A:** Contrato → Validação CETESB.
- **Bolso Síncrono B:** Gateway/Integração → Banco (quando dependentes).
- **Bolso Assíncrono C:** Testes e Documentação em paralelo quando escopos de arquivo não colidem.

Se detectar colisão de arquivos entre handoffs paralelos, interromper paralelismo e retornar para sequência linear.

---

### 3. PRÉ-HANDOFF (você)

Para cada handoff que vai iniciar:

```bash
# 1. Atualizar docs/copilot/14-estrutura-copilot.md
# (adicionar à seção apropriada)

## ✅ [Feature Name] (2026-03-08 - em progresso)
- Handoff 1/N: Contrato
  - Status: ▶ EM PROGRESSO

# 2. Atualizar DL-XXX
## DL-XXX
**Status:** 🔄 EM PROGRESSO - Handoff 1/N (Contrato)

### Handoff 1: Contrato (programador-backend-mtr)
- [ ] Atualizar OpenAPI
- [ ] Criar examples
- [ ] Regenerar operations
**Status:** ▶ EM PROGRESSO

# 3. Montar contexto claro para especialista
[Vide seção "Contexto para Especialista" abaixo]
```

---

### 4. HANDOFF → runSubagent (você)

Escalar para especialista apropriado:

```javascript
runSubagent({
  prompt: `
## DEMANDA: [Feature Name]

[CONTEXTO DA FEATURE]
Descrição: [breve descrição]
Impacto: [camadas]
Complexidade: [simples/média/complexa]

## ESTE HANDOFF

**Especialista**: Você (programador-backend-mtr)
**Camada**: Contrato OpenAPI
**Ordem**: Handoff 1/N
**Tempo estimado**: 20 minutos

## TAREFAS

Implemente primeira etapa da feature:

1. **OpenAPI** (openapi/mtr_automacao_openapi_interna.yaml)
   - [ ] Adicionar operação / modificar operação existente
   - [ ] Incluir campos obrigatórios/opcionais
   - [ ] Documentar comportamento esperado

2. **Examples** (examples/)
   - [ ] Criar request example
   - [ ] Criar response example (sucesso)
   - [ ] Criar response example (erro)

3. **Generated** (src/generated/operations.js)
   - [ ] Executar: npm run generate:operations
   - [ ] Confirmar que operations foram atualizadas

4. **Registre sua conclusão**
   - [ ] Informar quais arquivos foram modificados
   - [ ] Informar se encontrou divergência CETESB
   - [ ] Adicionar observação em DL-XXX

## CRITÉRIO DE PRONTO

Você termina quando:
- [ ] OpenAPI está válido (npm run validate:openapi)
- [ ] Examples refletem novo contrato
- [ ] Operations regeneradas
- [ ] Nenhuma divergência com HARs identificada (ou registrada)

## REFERÊNCIAS

- **Decision-Log**: docs/copilot/13-decision-log.md (DL-XXX)
- **Estratégia completa**: docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md
- **Quick ref**: docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md

## PRÓXIMO PASSO

Quando terminar:
1. Comunique arquivos modificados
2. Registre observações em DL-XXX
3. Aguarde validação (npm run validate:openapi)
4. Próximo handoff: validador-cetesb-mtr
  `,
  description: "handoff-1-contract-[feature-name]"
})
```

---

### 5. PÓS-HANDOFF (você)

Após especialista terminar:

```bash
# 1. Integrar resultado
# - Revisar arquivos modificados
# - Confirmar padrões são respeitados
# - Git add/commit se tudo OK

# 2. Validar
npm run validate:openapi
# Esperado: ✅ PASSED

# 3. Atualizar DL-XXX
## DL-XXX
**Status:** 🔄 EM PROGRESSO - Handoff N/N

### Handoff 1: Contrato ✅
- [x] OpenAPI atualizado
- [x] Examples criados
- [x] Operations regeneradas
**Status:** ✅ COMPLETADO

**Resultado**:
- Arquivos: openapi/..., examples/...
- Validação: ✅ npm run validate:openapi
- Divergências: Nenhuma

### Handoff 2: Validação CETESB
- [ ] Coerência validada
- [ ] HARs refletidos
**Status:** ▶ EM PROGRESSO

# 4. Continuar para próximo handoff
[Repetir: PRÉ-HANDOFF → HANDOFF → PÓS-HANDOFF]
```

---

### 6. CONSOLIDAÇÃO (você)

Após todos os handoffs planejados:

```bash
# 1. Executar suite completa de validações
npm run validate:openapi
npm run validate:cetesb-source
npm run test:source-of-truth
npm run test:integration
npm run test
npm run test:contract

# 2. Confirmar todos passando
# Se algum falhar: voltar para especialista apropriado

# 3. Atualizar DL-XXX final
## DL-XXX
**Status:** ✅ COMPLETADO

### Resumo Final
- **Feature**: [nome]
- **Data conclusão**: 2026-03-08
- **Duração total**: 3h 20min
- **Handoffs executados**: N/N
- **Testes**: ✅ 100% passando
- **Validações**: ✅ TODAS
- **Documentação**: ✅ Atualizada

### Próximo Passo
- Git merge feature/[nome]

# 4. Atualizar docs/copilot/14-estrutura-copilot.md
# (remover "em progresso")

## ✅ [Feature Name] (2026-03-08)
✅ COMPLETADO - Pronto para merge
```

---

## Contexto para Especialista

Quando escalar para especialista, incluir:

### Informações Essenciais

```markdown
**Feature**: [Nome da feature]
**Descrição**: [O que muda e por quê]
**Handoff**: N/N - [Camada]
**Especialista**: [programador-backend | validador-cetesb | etc]

**Status**:
- Handoffs anteriores: ✅ COMPLETADOS
- Este handoff: ▶ EM PROGRESSO
- Próximos handoffs: ⏳ Aguardando
```

### Task Específica

```markdown
**Tarefa**:
1. [O que fazer]
2. [O que modificar]
3. [Qual validação esperada]

**Arquivos impactados**:
- openapi/...
- src/...
- tests/...

**Critério de pronto**:
- [ ] Tarefa concluída
- [ ] Validação apropriada passou
- [ ] Registrado em DL-XXX
```

### Referências

```markdown
**Decision-Log**: DL-XXX em docs/copilot/13-decision-log.md
**Documentação**: 
- Estratégia: docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md
- Quick ref: docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md
- Estrutura: docs/copilot/14-estrutura-copilot.md
```

---

## Matriz de Validações

Execute após cada handoff:

| Handoff | Validação | Comando | Esperado |
|---------|-----------|---------|----------|
| 1 (Contrato) | OpenAPI | `npm run validate:openapi` | ✅ |
| 2 (CETESB) | Source Truth | `npm run validate:cetesb-source` | ✅ |
| 3 (Gateway) | Integração | `npm run test:integration` | ✅ |
| 4 (Banco) | Integração | `npm run test:integration` | ✅ |
| 5 (Testes) | Unit + Contract | `npm run test && npm run test:contract` | ✅ |
| Consolidação | TODAS | All above | ALL ✅ |

---

## Checklist Operacional

### Antes de Iniciar

- [ ] Demanda clara?
- [ ] Camadas identificadas?
- [ ] Ordem definida?
- [ ] Especialistas disponíveis?

### Durante Cada Handoff

- [ ] PRÉ-HANDOFF: docs + DL atualizados?
- [ ] HANDOFF: especialista tem contexto claro?
- [ ] PÓS-HANDOFF: validação passou?
- [ ] DL-XXX atualizado?

### Ao Final

- [ ] Todos os handoffs planejados completados?
- [ ] Suite de validações passou?
- [ ] DL-XXX marcado ✅?
- [ ] Pronto para merge?

---

## Troubleshooting

### Validação Falhou

```
Problema: npm run validate:openapi falhou após handoff 1
Solução:
1. Revisar erro específico
2. Registrar em DL-XXX
3. Escalar para programador-backend-mtr
4. NÃO continuar para handoff 2
5. Aguardar resolução
```

### Divergência CETESB

```
Problema: Encontrada divergência entre OpenAPI e HAR
Solução:
1. Registrar divergência em DL-XXX
2. Escalar para validador-cetesb-mtr
3. Decidir estratégia (novo comportamento? ignorado no HAR?)
4. Documentar decisão
5. Continuar quando resolvido
```

### Bloqueador

```
Problema: Feature depende de mudança externa
Solução:
1. Registrar em DL-XXX
2. Identificar responsável
3. Marcar como "Aguardando"
4. Retomar quando desbloqueado
```

---

## Exemplos Rápidos

### Feature Simples (1-2 camadas)
```
Tempo: 45 min
Handoffs: 2 (Contrato + Docs)
```

### Feature Média (4-5 camadas)
```
Tempo: 2-3 horas
Handoffs: 5-6 (Contrato → CETESB → Gateway → Banco → Testes → Docs)
```

### Feature Complexa (6+ camadas)
```
Tempo: 4-8 horas
Handoffs: 7+ (Todas + iterações se houver bloqueadores)
```

---

## Referências Rápidas

| Documento | Conteúdo |
|-----------|----------|
| `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md` | Estratégia completa |
| `docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md` | Referência rápida |
| `executor-handoffs.agent.md` | Agent executor (400 linhas) |
| `executor-handoffs.instructions.md` | Instructions detalhadas (300 linhas) |
| `13-decision-log.md` | Histórico de decisões |
| `14-estrutura-copilot.md` | Status de features em progresso |

---

## Próximos Passos

1. Use `/handoff [descrição]` para iniciar feature
2. Siga planejamento → handoffs sequenciais → consolidação
3. Mantenha DL-XXX sempre sincronizado
4. Validar entre cada handoff
5. Consolidar quando tudo estiver pronto

