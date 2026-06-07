---
applyTo: ".github/agents/executor-handoffs.agent.md,.github/prompts/handoff.prompt.md,.github/prompts/handoff-*.prompt.md,.github/skills/handoff-*.md"
---

## Instructions para Executor de Handoffs

### Objetivo

Estruturar execução de features multi-camada através de **orquestração automática de handoffs** com documentação contínua, validações automáticas e rastreabilidade 100%.

---

## Responsabilidades Principais

### 1. Análise Estruturada

Antes de iniciar qualquer handoff:

- **Decompor demanda** em camadas técnicas impactadas
  - Contrato (OpenAPI)
  - Validação CETESB (coerência com HARs)
  - Gateway/Integração (CETESB, session, payloads)
  - Banco (migrations, repositories)
  - Testes (unit, integration, E2E)
  - Documentação (copilot/, roadmap)

- **Identificar dependências** e ordem sequencial
  - Contrato SEMPRE primeiro (define interface)
  - Validação CETESB APÓS contrato (valida coerência)
  - Integração APÓS validação (usa contrato validado)
  - Banco ANTES de testes (dados disponíveis)
  - Testes APÓS banco (tudo pronto)
  - Docs ÚLTIMO (descreve tudo pronto)

- **Registrar riscos** e critérios de pronto
  - Riscos: quais dependências podem falhar?
  - Critérios: quando terminar cada camada?
  - Blocadores: o que impede inicio imediato?

- **Criar task list estruturada**
  - Tarefas por camada
  - Pré-condições (o que precisa estar pronto)
  - Pós-condições (como validar conclusão)
  - Owner (especialista responsável)

### 2. Orquestração de Handoffs

Padrão PRÉ-HANDOFF → HANDOFF → PÓS-HANDOFF:

#### PRÉ-HANDOFF (você)

```markdown
1. Atualizar docs/copilot/14-estrutura-copilot.md
   - Adicionar na seção apropriada:
   ## ✅ [Feature Name] (2026-03-08 - em progresso)
   - Handoff N/N: [Camada]
     - Status: ▶ EM PROGRESSO

2. Create/Update DL-XXX em docs/copilot/13-decision-log.md
   - Tema, Data, Tipo, Especialistas
   - Decomposição por camada
  - Status: 🔄 EM PROGRESSO - Handoff N/N
   - Checklist de pré-condições

3. Montar contexto claro para próximo especialista
   - Qual camada?
   - Quais arquivos modificar?
   - Qual validação esperada?
   - Referência ao DL-XXX

4. Se a demanda estiver usando a frente operacional coordenada
  - Executar `npm run handoff:front:prepare -- --dl DL-XXX --title "<título>" --request "<contexto>"`
  - Confirmar geração de `manifest.json`, `status-board.md`, `events.ndjson` e `briefings/`
  - Usar esses artefatos como trilha observável durante a execução
```

#### HANDOFF (runSubagent)

```markdown
Escalar para especialista apropriado com:

runSubagent({
  prompt: `
[CONTEXTO DA FEATURE]
Demanda: [descrição]
Feature: [nome]
Impacto: [camadas]

[CONTEXTO DO HANDOFF]
Especialista: [você é responsável por esta camada]
Camada: [qual camada sendo executada]
Ordem: Você é handoff N/N (N planejado para esta demanda)
Dependências: [o que precisa estar pronto antes]

[TAREFAS ESPECÍFICAS]
- Modificar: [arquivos]
- Adicionar: [exemplos, validadores, testes]
- Validar: [como saber se está certo]
- Registrar: Conclusão em DL-XXX

[REFERÊNCIAS]
- DL-XXX: docs/copilot/13-decision-log.md
- Estratégia: docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md
- Rápido: docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md
  `,
  description: "handoff-N-[nome-camada]"
})
```

#### PÓS-HANDOFF (você)

```markdown
1. Integrar resultado do especialista
   - Revisar arquivos alterados
   - Confirmar que respeita contrato
   - Validar nomenclatura/padrões

2. Executar validação apropriada
   - npm run validate:openapi (após contrato)
   - npm run validate:cetesb-source (após CETESB)
   - npm run test:integration (após gateway/banco)
   - npm run test (após testes)
   
3. Atualizar DL-XXX
   - Registrar resultado de handoff N
   - Anotar qualquer divergência/riscos
  - Status: ▶ EM PROGRESSO - Handoff N+1/N

4. Próximo handoff
   - Se passou validação: continuar para N+1
   - Se falhou validação: escalar para especialista diagnosticar
   - Se divergência CETESB: escalar para validador-cetesb-mtr
```

### 3. Documentação Contínua

Manter sincronizados SEMPRE:

#### docs/copilot/14-estrutura-copilot.md

```markdown
## ✅ [Feature Name] (2026-03-08 - em progresso)
- Handoff 1/N: Contrato
  - Status: ✅ COMPLETADO
- Handoff 2/N: Validação CETESB
  - Status: ▶ EM PROGRESSO
- Demais handoffs planejados: Pendentes
```

#### docs/copilot/13-decision-log.md

Template para cada feature multi-camada:

```markdown
## DL-XXX
**Tema:** [Feature Name]
**Data:** 2026-03-08
**Tipo:** Feature multi-camada
**Especialistas:** [especialistas necessários]
**Status:** 🔄 EM PROGRESSO - Handoff N/N

### Planejamento
- Camadas: [lista]
- Ordem: [dependency-first order]
- Riscos: [lista]
- Critério pronto: [checklist]

### Handoff 1: Contrato
- [ ] Task 1
- [ ] Task 2
**Status:** ✅ COMPLETADO

### Handoff 2: Validação CETESB
- [ ] Task 1
- [ ] Task 2
**Status:** ▶ EM PROGRESSO

### Demais handoffs planejados: [Similar]

**Resumo Final:** [Preenchido após consolidação]
```

### 4. Validações Automáticas

Entre cada handoff, executar validação apropriada:

| Após Handoff | Validação | Comando |
|---|---|---|
| 1 (Contrato) | OpenAPI | `npm run validate:openapi` |
| 2 (CETESB) | Source-of-truth | `npm run validate:cetesb-source` |
| 3 (Gateway) | Integração | `npm run test:integration` |
| 4 (Banco) | Integração | `npm run test:integration` |
| 5 (Testes) | Todos | `npm run test` |
| Consolidação | TODAS | `npm run validate && npm run test` |

**Se validação falhar:**
1. Registrar em DL-XXX como "Bloqueador"
2. Escalar para especialista apropriado
3. Não continuar para próximo handoff
4. Aguardar resolução

**Se divergência CETESB encontrada:**
1. Registrar em DL-XXX com descrição da divergência
2. Escalar para validador-cetesb-mtr
3. Decidir se é novo comportamento ou ignorado no HAR
4. Documentar decisão em DL-XXX

### 5. Consolidação Final

Após todos HANDOFFs planejados:

```bash
# 1. Executar validações aplicáveis
npm run validate:openapi           # se alterou OpenAPI
npm run validate:cetesb-source     # se consultou HAR
npm run test:source-of-truth       # se alterou validadores
npm run test:integration           # se alterou gateway
npm run test                       # sempre (>95% cobertura)
npm run test:contract              # se alterou contrato

# 2. Confirmar todos passando
# (se algum falhar, voltar para especialista apropriado)

# 3. Atualizar documentação final
# - DL-XXX: Status ✅ COMPLETADO
# - docs/copilot/14-estrutura-copilot.md: Remover "em progresso"
# - docs/copilot/09-roadmap.md: Marcar como completo (se aplicável)

# 4. Pronto para merge
```

---

## Padrões Obrigatórios

### Nomenclatura

- **Decision-log**: `DL-XXX` (DL-001, DL-002, etc)
- **Feature branch**: `feature/[nome-descritivo]`
- **Handoff prompt**: `handoff-N-[nome-camada]` (ex: handoff-1-contract)

### Documentação

- Toda feature multi-camada → entry em DL-XXX
- Toda decisão importante → registrado em DL-XXX
- Toda validação → comando npm run executado
- Toda divergência → escalado e registrado

### Destino Canônico de Arquivos (OBRIGATÓRIO)

- **Docs executivos de handoff (genéricos):** `docs/copilot/handoffs/guias/`
- **Artefatos de execução por decisão (DL):** `docs/copilot/handoffs/DL-XXX/execution/`
- **Documentos de validação CETESB:** `docs/copilot/validadores/cetesb/`
- **Documentos de implementação técnica:** `docs/copilot/implementacoes/`

### Regras Anti-Duplicação (OBRIGATÓRIO)

- Não criar arquivos `HANDOFF-*` soltos em `docs/copilot/` raiz.
- Não criar versão duplicada por idioma/case para o mesmo conteúdo (`handoff-3-context.md` vs `HANDOFF-3-CONTEXTO.md`).
- Preferir nomes canônicos em `kebab-case` minúsculo para novos arquivos.
- Se precisar manter histórico, consolidar no arquivo canônico e remover o redundante.

### Sequência Adaptativa

**HANDOFFs disponíveis** (escolher conforme análise de impacto):
1. **Contrato** (programador-backend-mtr) - quando impacta OpenAPI
2. **Validação CETESB** (validador-cetesb-mtr) - quando consulta HAR
3. **Integração** (integrador-cetesb-mtr) - quando altera gateway
4. **Banco** (postgres-queue-mtr) - quando muda schema/fila
5. **Testes** (30-60 min) - tester-qa-mtr
6. **Documentação** (15-30 min) - documentador-mtr
7. **Consolidação** (5-15 min) - você

**Não executar camadas não impactadas**. Registrar no DL-XXX como "não aplicável".

### Preset operacional coordenado (DL-086)

Quando o `orquestrador-mtr` disparar o preset de frente operacional coordenada, execute nesta forma:

0. **Bootstrap obrigatório:** logo após criar/atualizar o `DL-XXX`, executar `npm run handoff:front:prepare -- --dl DL-XXX --title "<título>" --request "<contexto consolidado>"`.
1. **Frente coordenada por independência de arquivos:** `integrador-cetesb-mtr`, `postgres-queue-mtr`, `dashboard-observability-mtr`, `jobs-monitoramento-logs-mtr`, `sessao-conta-mtr`, `manifestos-operacional-mtr`, `perfis-acessos-admin-mtr`.
2. **Detecção de colisão:** se dois ou mais especialistas precisarem editar o mesmo arquivo, quebrar o subconjunto conflitante em sequência local antes de prosseguir.
3. **Fechamento serial obrigatório:** somente após concluir a frente coordenada, executar `tester-qa-mtr` e depois `documentador-mtr`.
4. **Consolidação final:** registrar o preset em `DL-XXX`, atualizar `docs/copilot/14-estrutura-copilot.md` e consolidar validações aplicáveis.
5. **Observação de runtime:** tratar o preset como paralelismo lógico de planejamento; no runtime atual, os handoffs não ficam visíveis como execução simultânea no VS Code.
6. **Sincronização do board:** sempre que uma lane iniciar, bloquear ou concluir, atualizar o board com `npm run handoff:front:update -- --dl DL-XXX --agent <agente> --status <status> --note "<resumo>"`.

---

## Checklist Operacional

### Antes de Iniciar Feature

- [ ] Demanda está clara e bem definida?
- [ ] Quais camadas são impactadas? (contrato, CETESB, etc)
- [ ] Conhece ordem sequencial? (contrato primeiro)
- [ ] Está pronto para 15 min a 8 horas de orquestração?
- [ ] Especialistas estão disponíveis?

### Durante Cada Handoff

- [ ] PRÉ-HANDOFF executado?
  - [ ] docs/copilot/14-estrutura-copilot.md atualizado
  - [ ] DL-XXX criado/atualizado
  - [ ] Contexto claro para especialista
- [ ] HANDOFF executado?
  - [ ] runSubagent chamado com prompt estruturado
  - [ ] Especialista tem referência ao DL-XXX
- [ ] PÓS-HANDOFF executado?
  - [ ] Resultado integrado
  - [ ] Validação apropriada passou
  - [ ] DL-XXX atualizado
  - [ ] Próximo handoff pronto

### Após Conclusão

- [ ] DL-XXX marcado como ✅ COMPLETADO?
- [ ] docs/copilot/14-estrutura-copilot.md marcado como completo?
- [ ] Suite completa de validações passou?
- [ ] Pronto para merge?

---

## Tratamento de Erros

### Validação Falhou

1. Identificar qual validação falhou
2. Registrar em DL-XXX como "Bloqueador"
3. Escalar para especialista apropriado
4. NÃO continuar para próximo handoff
5. Aguardar especialista resolver

### Divergência CETESB Detectada

1. Registrar exatamente qual divergência
2. Registrar em DL-XXX com referência ao HAR
3. Escalar para validador-cetesb-mtr
4. Decidir estratégia:
   - É novo comportamento? → documentar
   - Foi ignorado no HAR? → contactar CETESB
   - É inferência anterior errada? → corrigir
5. Registrar decisão em DL-XXX
6. Continuar quando divergência resolvida

### Bloqueador Não Técnico

1. Registrar em DL-XXX
2. Identificar responsável (produto, especialista, etc)
3. Marcar como "Aguardando: [nome]"
4. Retomar quando desbloqueado

---

## Exemplos Prático

### Feature Simples (1 camada)

```
/handoff Adicione campo "internalNotes" opcional em manifestos

PLANEJAMENTO:
- Impacto: Contrato + Documentação (2 camadas)
- Ordem: Contrato → Docs
- Tempo: 45 min
- Risco: Nenhum

DL-XXX criado

HANDOFF 1: CONTRATO (20 min)
- OpenAPI: adicionar field
- Examples: atualizar
- Validação: ✅ npm run validate:openapi

HANDOFF 2: DOCS (15 min)
- Modelo-de-dados: adicionar field
- Validação: ✅ Docs reviewed

CONSOLIDAÇÃO: ✅ Pronto para merge
```

### Feature Média (4-5 camadas)

```
/handoff Implemente autenticação JWT com refresh tokens

PLANEJAMENTO:
- Impacto: Contrato, CETESB, Gateway, Banco, Testes, Docs (camadas necessárias)
- Ordem: Contrato → CETESB → Gateway → Banco → Testes → Docs
- Tempo: 4-5 horas
- Risco: CETESB pode não suportar JWT

DL-XXX criado

HANDOFFS planejados: [Conforme padrão]

CONSOLIDAÇÃO: ✅ Pronto para merge ou [Risco: escalar para CETESB]
```

### Feature Complexa (6+ camadas)

```
/handoff Redesenhe fluxo de cadastro de empresa para suportar CNAE múltiplos

PLANEJAMENTO:
- Impacto: Contrato, CETESB, Validador, Gateway, Banco, Testes, Docs (7 camadas)
- Ordem: [dependency-first]
- Tempo: 6-8 horas
- Risco: Múltiplos riscos técnicos e de integração

DL-XXX criado com riscos detalhados

HANDOFF 1-7: [Conforme padrão]

CONSOLIDAÇÃO: ✅ Pronto para merge + [Riscos resolvidos]
```

---

## Referências

- **Estratégia completa**: `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- **Quick reference**: `docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md`
- **Agent executor**: `.github/agents/executor-handoffs.agent.md`
- **Orquestrador**: `.github/agents/orquestrador-mtr.agent.md`
- **Decision-log**: `docs/copilot/13-decision-log.md`

---

## Evolução Contínua

Após cada feature multi-camada completa:

1. Registrar aprendizados em DL-XXX
2. Se tempo foi diferente de estimado: anotar
3. Se ordem foi diferente: considerar mudança padrão
4. Se validações novas necessárias: adicionar à matriz
5. Se especialista feedback: incorporar em próxima iteração

