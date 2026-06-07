# Validador CETESB - Integração e Uso

## O que foi criado

Um novo agente especializado `validador-cetesb-mtr` foi integrado ao orquestrador para auditar coerência entre implementação e evidência real em `docs/cetesb/` (arquivos HAR).

## Estrutura criada

### 1. Agente: `validador-cetesb-mtr.agent.md`
- **Responsabilidade**: validar que OpenAPI, examples, validadores, gateway e testes estão coerentes com HARs reais
- **Operação**: análise de HARs + auditoria de código + testes + escalonamento de divergências
- **Handoffs**: escala automaticamente para especialistas apropriados:
  - OpenAPI diverge → `programador-backend-mtr`
  - Validador diverge → `integrador-cetesb-mtr`
  - Gateway diverge → `integrador-cetesb-mtr`
  - Teste diverge → `tester-qa-mtr`
  - Novo HAR → `documentador-mtr`

### 2. Skill: `cetesb-evidence-validation.md`
Padroniza validação de coerência com passos:
1. **Inventário de HARs** - listar e extrair estrutura
2. **Mapeamento** - verificar `src/lib/cetesb-source-of-truth.js`
3. **Validação OpenAPI** - `npm run validate:openapi`
4. **Validação Examples** - verificar presença e estrutura JSON
5. **Validação Validadores** - verificar cobertura de campos
6. **Validação Gateway** - verificar mapeamento de headers/body
7. **Validação Testes** - verificar cobertura de cenários
8. **Auditoria Automática** - executar scripts de validação

### 3. Prompt: `auditar-coerencia-cetesb.prompt.md`
Prompt operacional com 3 modos:
- `all` - auditoria completa de todos HARs
- `openapi|examples|validators|gateway|tests` - auditoria por camada
- `login|gerar_mtr|imprimir|cancelar|criar_cadastro` - auditoria de operação específica

### 4. Integração no orquestrador
- Novo handoff adicionado ao `orquestrador-mtr`
- Regra de escalonamento atualizada com novo agente
- Documentação sincronizada

## Como usar

### Auditoria completa
```bash
# No Copilot Chat do VS Code:
Prompt: auditar-coerencia-cetesb
Argumento: all
```

Resultado:
- Inventário dos 5 HARs em `docs/cetesb/`
- Validação de cada camada (openapi, examples, validators, gateway, tests)
- Relatório de conformidade
- Escalonamento automático de divergências

### Auditoria de operação específica
```bash
Prompt: auditar-coerencia-cetesb
Argumento: gerar_mtr
```

Resultado:
- Extração de evidência do HAR de geração de MTR
- Validação se OpenAPI contém endpoint
- Validação se examples existem
- Validação se validador existe
- Validação se gateway implementa corretamente
- Validação se testes cobrem fluxo

### Auditoria de camada específica
```bash
Prompt: auditar-coerencia-cetesb
Argumento: openapi
```

Resultado:
- Validação de cada schema em OpenAPI contra HARs
- Checklist de conformidade
- Identificação de gaps

## Protocolo de divergência

Quando encontrar divergência entre código e HAR:

1. **Não implemente "solução" rápida**
2. **Escale para `validador-cetesb-mtr`**
3. Validador audita raiz
4. Validador escala para especialista apropriado
5. Especialista faz correção com referência ao HAR
6. Registra em decision-log (como DL-014)
7. Validador re-executa auditoria para confirmar

## Validações automáticas

O validador executa automaticamente:
```bash
npm run validate:cetesb-source      # Verifica mapeamento em cetesb-source-of-truth.js
npm run test:source-of-truth        # Testa se HARs existem e mapeamento é coerente
npm run validate:openapi             # Valida contrato (inclui source-of-truth)
npm run test:contract               # Valida exemplos e padrão assíncrono
```

## Matriz de escalação

| Divergência encontrada | Escala para | Motivo |
|---|---|---|
| OpenAPI schema diverge de HAR | `programador-backend-mtr` | Contrato é responsabilidade do backend |
| Examples faltam ou divergem | `programador-backend-mtr` | Exemplos são parte do contrato |
| Validador rejeita campo do HAR | `integrador-cetesb-mtr` | Validador é responsabilidade do integrador |
| Gateway não mapeia corretamente | `integrador-cetesb-mtr` | Gateway é responsabilidade do integrador |
| Teste falha em cenário do HAR | `tester-qa-mtr` | Cobertura de teste é responsabilidade de QA |
| Novo HAR capturado | `documentador-mtr` | Novo HAR precisa de documentação e registro |

## Benefícios

1. **Coerência garantida**: validação automática evita drift entre código e HAR
2. **Decisões baseadas em evidência**: divergências são investigadas antes de "solução"
3. **Escalação eficiente**: mismatch vai sempre para especialista apropriado
4. **Rastreabilidade**: cada decisão é registrada em decision-log com referência ao HAR
5. **Reproduzibilidade**: protocolo padronizado para todos os tipos de divergência

## Exemplo: Auditoria completa

```
Usuário: Prompt auditar-coerencia-cetesb → argumento: all

Validador faz:
1. Listar HARs: 5 arquivos encontrados ✓
2. Mapear em cetesb-source-of-truth.js: 5 operações mapeadas ✓
3. Validar OpenAPI: 5 endpoints presentes com schemas ✓
4. Validar Examples: 10 arquivos (5 request + 5 response) ✓
5. Validar Validadores: manifest-validator cobre campos ✓
6. Validar Gateway: headers/body mapeados corretamente ✓
7. Validar Testes: 23 testes cobrem cenários do HAR ✓
8. Executar npm run validate:cetesb-source → ✓
9. Executar npm run test:source-of-truth → 2/2 passing ✓

Resultado: ✅ Implementação está coerente com evidência em docs/cetesb/
```

## Exemplo: Divergência encontrada

```
Validador encontra:
- OpenAPI espera campo 'responsibleName'
- HAR mostra campo 'responsiblePersonName'

Ação automática:
→ Escala para programador-backend-mtr
→ Registra achado em decision-log (DL-015)
→ Espera correção

Após correção:
→ Re-executa auditoria
→ Confirma coerência
```

## Referências

- `.github/agents/validador-cetesb-mtr.agent.md` - definição do agente
- `.github/skills/cetesb-evidence-validation.md` - skill de validação
- `.github/prompts/auditar-coerencia-cetesb.prompt.md` - prompt operacional
- `docs/cetesb/README.md` - índice de HARs
- `docs/copilot/13-decision-log.md` - decision log (DL-014)
- `docs/copilot/14-estrutura-copilot.md` - estrutura meta sincronizada

