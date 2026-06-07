# Skill: Copilot Structure Evolution

## Quando usar

Use esta skill para **evoluir, auditar ou otimizar a estrutura de orquestração** do repositório (agents, prompts, skills, instructions, workflows).

## Objetivo

Manter `.github/` eficiente, consistente e sincronizado com `docs/copilot/14-estrutura-copilot.md`.

## Agente responsável

Primariamente: `meta-evolution-copilot`  
Secundário: `orquestrador-mtr` (quando evolução estrutural faz parte de demanda maior)

## Contexto obrigatório

Sempre consultar:

- `docs/copilot/14-estrutura-copilot.md` (fonte de verdade)
- `.github/copilot-instructions.md` (regras centrais)
- `docs/copilot/13-decision-log.md` (histórico de decisões)
- `.github/README.md` (estado atual da estrutura)
- `.vscode/mcp.json` quando a demanda envolver runtime MCP, memória orquestrada ou wiring de workspace
- `.github/skills/mempalace-memory-orchestration/SKILL.md` quando a evolução estrutural envolver mempalace

## Matriz de análise estrutural

### 1. Auditoria de agents

**Verificar:**

- Agentes com responsabilidades sobrepostas?
- Gaps (domínios sem agente responsável)?
- Agentes não referenciados em prompts/skills?
- Estrutura markdown inconsistente?

**Ações típicas:**

- Merge de agentes duplicados
- Split de agentes monolíticos
- Criação de especialistas para gaps
- Padronização de seções (missão, quando usar, limitações)

### 2. Auditoria de prompts

**Verificar:**

- Prompts não conectados a agentes?
- Prompts operacionais faltando (feature, bug, hardening)?
- Duplicidade de fluxos entre prompts?
- Referências quebradas a agents/skills?

**Ações típicas:**

- Consolidação de prompts similares
- Criação de prompts operacionais padrão
- Atualização de referências a agentes
- Sincronização com `.github/agents/`

### 3. Auditoria de skills

**Verificar:**

- Skills órfãs (não referenciadas)?
- Skills com contexto duplicado de instructions?
- Skills sem agente responsável?
- Estrutura inconsistente?

**Ações típicas:**

- Merge de skills sobrepostas
- Criação de skills por domínio técnico
- Sincronização com instructions (applyTo)
- Remoção de skills não utilizadas

### 4. Auditoria de instructions

**Verificar:**

- Regras contraditórias entre arquivos?
- Duplicidade de conteúdo?
- applyTo globs incorretos ou muito amplos?
- Instructions sem evidência de uso?

**Ações típicas:**

- Consolidação de regras duplicadas
- Refinamento de applyTo patterns
- Remoção de instructions obsoletas
- Sincronização com skills complementares

### 5. Auditoria de workflows

**Verificar:**

- Workflows duplicando validações?
- Triggers desnecessários?
- Dependências circulares?
- Tempo de execução otimizável?

**Ações típicas:**

- Merge de workflows similares
- Otimização de triggers
- Paralelização de jobs independentes
- Documentação de propósito de cada workflow

## Checklist de consistência

Ao evoluir estrutura, validar:

- [ ] Nomenclatura padronizada (kebab-case)
- [ ] Seções obrigatórias presentes (missão, quando usar, limitações)
- [ ] Referências cruzadas funcionais (agents ↔ prompts ↔ skills)
- [ ] Dependências opcionais de runtime claramente documentadas
- [ ] Sincronização com `docs/copilot/14-estrutura-copilot.md`
- [ ] 0 erros de linting/validação em `.github/`
- [ ] Decision-log atualizado com justificativa
- [ ] README.md refletindo mudanças

## Padrões de refatoração

### Consolidação

**Quando:** 2+ arquivos com >70% conteúdo duplicado  
**Como:** Merge em único arquivo, atualizar referências, deprecar antigos

### Especialização

**Quando:** 1 arquivo monolítico com múltiplas responsabilidades  
**Como:** Split em arquivos focados, criar matriz de escalonamento, atualizar prompts

### Criação

**Quando:** Gap identificado (funcionalidade sem agent/skill/prompt)  
**Como:** Criar com template padrão, conectar a estrutura existente, documentar

### Remoção

**Quando:** Arquivo não referenciado há >2 versões  
**Como:** Validar ausência de uso (grep), mover para deprecated/, documentar motivo

## Validação de impacto

Antes de aplicar mudanças estruturais:

1. **Impacto em referências:** grep por nome do arquivo em `.github/` e `docs/copilot/`
2. **Impacto em fluxos:** testar escalonamento simulado (feature → especialistas)
3. **Impacto em documentação:** verificar sincronização com `14-estrutura-copilot.md`
4. **Impacto em workflows:** validar triggers e dependências

Após aplicar mudanças:

1. **Validação sintática:** 0 erros em `.github/`
2. **Validação semântica:** referências funcionais (grep validation)
3. **Validação funcional:** pelo menos 1 cenário de teste (feature/bug/hardening)
4. **Validação documental:** `13-decision-log.md` e `14-estrutura-copilot.md` atualizados

## Entregáveis típicos

### Auditoria

- Relatório de gaps/duplicidades
- Mapa de dependências (agents → skills → instructions)
- Checklist de inconsistências
- Plano de refatoração proposto

### Refatoração

- Arquivos criados/modificados/removidos
- Atualização de referências cruzadas
- Sincronização com documentação
- Migration guide (se breaking changes)

### Validação

- 0 erros estruturais
- 0 referências quebradas
- Cenário de teste executado com sucesso
- Decision-log atualizado

## Exemplo de aplicação

**Cenário:** Identificar duplicidade entre instructions

```
Skill aplicada por meta-evolution-copilot:
1. Grep por regras duplicadas em .github/instructions/
2. Comparar applyTo patterns para sobreposição
3. Propor merge de backend-node.instructions.md + api-contract.instructions.md
4. Validar impacto (quais arquivos afetados?)
5. Executar consolidação
6. Atualizar README.md
7. Registrar em decision-log
```

**Resultado:**

- `backend-node.instructions.md` absorve regras de contrato
- `api-contract.instructions.md` focado apenas em OpenAPI schema
- applyTo patterns refinados para evitar sobreposição
- Decision-log registra motivo da consolidação
