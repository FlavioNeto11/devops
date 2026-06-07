# Resumo: Criação do Validador CETESB MTR (2026-03-08)

## Objetivo realizado
Criar agente especializado integrado ao orquestrador que valida se tudo está coerente com o conteúdo de `docs/cetesb/` (arquivos HAR com evidência real).

## O que foi criado

### 1. Agente: `validador-cetesb-mtr.agent.md`
Agente especializado em auditoria de coerência com evidência real.

**Responsabilidades:**
- Analisar HARs em `docs/cetesb/`
- Validar que OpenAPI reflete os HARs
- Validar que examples existem e são válidos
- Validar que validadores cobrem campos reais
- Validar que gateway mapeia corretamente
- Validar que testes cobrem cenários do HAR

**Handoffs automáticos:**
- Divergência em OpenAPI → `programador-backend-mtr`
- Divergência em validador → `integrador-cetesb-mtr`
- Divergência em gateway → `integrador-cetesb-mtr`
- Divergência em teste → `tester-qa-mtr`
- Novo HAR → `documentador-mtr`

### 2. Skill: `cetesb-evidence-validation.md`
Padroniza processo de validação com 8 passos:
1. Inventário de HARs
2. Mapeamento em `src/lib/cetesb-source-of-truth.js`
3. Validação OpenAPI
4. Validação Examples
5. Validação Validadores
6. Validação Gateway
7. Validação Testes
8. Auditoria automática

Inclui checklist de validação, interpretação de HAR e cenários comuns.

### 3. Prompt: `auditar-coerencia-cetesb.prompt.md`
Prompt operacional com 3 modos de execução:
- **all**: auditoria completa de todos HARs
- **openapi|examples|validators|gateway|tests**: auditoria por camada
- **login|gerar_mtr|imprimir|cancelar|criar_cadastro**: auditoria de operação específica

### 4. Integração no orquestrador
**Arquivo**: `.github/agents/orquestrador-mtr.agent.md`

Mudanças:
- Novo handoff adicionado (8º handoff)
- Regra de escalonamento atualizada com novo agente
- Protocolo para divergências: sempre escale para `validador-cetesb-mtr` primeiro

### 5. Documentação sincronizada
Atualizados:
- `.github/agents/README.md` - novo agente listado
- `.github/copilot-instructions.md` - regra #8 ampliada com novo agente
- `docs/copilot/14-estrutura-copilot.md` - estrutura meta sincronizada
- `docs/copilot/13-decision-log.md` - DL-014 registrado
- `docs/copilot/README.md` - novo documento adicionado ao índice
- `docs/copilot/validadores/cetesb/validador-cetesb-integracao.md` - NOVO guia de uso

## Estrutura criada

```
.github/
├── agents/
│   ├── validador-cetesb-mtr.agent.md (✅ NOVO)
│   ├── orquestrador-mtr.agent.md (✅ ATUALIZADO)
│   └── README.md (✅ ATUALIZADO)
├── skills/
│   ├── cetesb-evidence-validation.md (✅ NOVO)
│   └── ... (existentes)
├── prompts/
│   ├── auditar-coerencia-cetesb.prompt.md (✅ NOVO)
│   └── ... (existentes)
├── copilot-instructions.md (✅ ATUALIZADO)
└── README.md (✅ ATUALIZADO)

docs/copilot/
├── 14-estrutura-copilot.md (✅ ATUALIZADO)
├── 13-decision-log.md (✅ ATUALIZADO - DL-014)
├── README.md (✅ ATUALIZADO)
└── validador-cetesb-integracao.md (✅ NOVO)
```

## Validações executadas

✅ **npm run validate:cetesb-source**
```
[ok] Política de fonte da verdade CETESB validada com sucesso.
```

✅ **npm run test:source-of-truth**
```
✔ docs/cetesb contém todos HARs obrigatórios
✔ mapeamento de evidência CETESB é coerente
2/2 passing
```

## Como usar

### Via Copilot Chat

```
Prompt: auditar-coerencia-cetesb
Argumento: all
```

Resultado: auditoria completa validando:
- ✓ HARs presentes em `docs/cetesb/` (5 operações)
- ✓ Mapeamento em `src/lib/cetesb-source-of-truth.js`
- ✓ OpenAPI contém endpoints + schemas
- ✓ Examples existem (request + response)
- ✓ Validadores cobrem campos obrigatórios
- ✓ Gateway mapeia headers/body corretamente
- ✓ Testes cobrem cenários do HAR
- ✓ Validações automáticas passam

Se tudo está ok: "✅ Implementação está coerente com evidência em docs/cetesb/"
Se há divergências: agente escala para especialista apropriado

### Protocolo de divergência

1. Desenvolvedor encontra divergência (código vs HAR)
2. **NÃO** tenta "solução" rápida
3. **ESCALA** para `validador-cetesb-mtr` (prompt `auditar-coerencia-cetesb`)
4. Validador audita raiz
5. Validador **escala para especialista apropriado**
6. Especialista faz correção com referência ao HAR
7. Registra em decision-log (como DL-014)
8. Validador re-executa para confirmar coerência

## Matriz de escalação

| Divergência | Escala para | Motivo |
|---|---|---|
| OpenAPI diverge | `programador-backend-mtr` | Contrato é responsabilidade do backend |
| Examples faltam | `programador-backend-mtr` | Exemplos são parte do contrato |
| Validador rejeita campo real | `integrador-cetesb-mtr` | Validador é responsabilidade do integrador |
| Gateway não mapeia | `integrador-cetesb-mtr` | Gateway é responsabilidade do integrador |
| Teste falha em cenário real | `tester-qa-mtr` | Cobertura é responsabilidade de QA |
| Novo HAR capturado | `documentador-mtr` | Novo HAR precisa de registro e docs |

## Benefícios

1. **Coerência garantida**: validação automática evita drift entre código e HAR
2. **Baseado em evidência**: divergências são investigadas antes de "solução"
3. **Escalonamento eficiente**: mismatch vai sempre para especialista apropriado
4. **Rastreabilidade**: cada divergência é registrada em decision-log
5. **Reproduzibilidade**: protocolo padronizado para todos os cenários
6. **Qualidade**: catches divergências precocemente no desenvolvimento

## Exemplo prático

### Cenário: novo campo em HAR

```
HAR mtr.cetesb.sp.gov.br_gerar_mtr.har mostra novo campo:
"newFieldRequired": "value"

Desenvolvedor:
→ Executa: auditar-coerencia-cetesb → gerar_mtr
→ Validador encontra: campo não está em OpenAPI nem no validador

Resultado:
✗ OpenAPI schema diverge
✗ Validador não valida campo obrigatório

Ações automáticas:
→ Escala para programador-backend-mtr (OpenAPI)
→ Escala para integrador-cetesb-mtr (validador)

Após correções:
→ Re-executa auditar-coerencia-cetesb → gerar_mtr
→ ✅ Tudo alinhado com HAR novo
```

## Referências rápidas

- **Como usar**: `docs/copilot/validadores/cetesb/validador-cetesb-integracao.md`
- **Agente**: `.github/agents/validador-cetesb-mtr.agent.md`
- **Skill**: `.github/skills/cetesb-evidence-validation.md`
- **Prompt**: `.github/prompts/auditar-coerencia-cetesb.prompt.md`
- **Decision**: `docs/copilot/13-decision-log.md#DL-014`
- **Estrutura**: `docs/copilot/14-estrutura-copilot.md`
- **HARs reais**: `docs/cetesb/`

## Status final

✅ **Agente criado e integrado**
✅ **Skill padronizada**
✅ **Prompt operacional**
✅ **Orquestrador atualizado**
✅ **Documentação sincronizada**
✅ **Validações passando (100%)**
✅ **Decision-log atualizado (DL-014)**
✅ **Pronto para uso**


