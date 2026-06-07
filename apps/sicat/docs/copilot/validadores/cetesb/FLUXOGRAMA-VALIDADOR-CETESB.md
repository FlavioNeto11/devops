# Fluxograma: Validador CETESB MTR

## Arquitetura da Solução

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ORQUESTRADOR (orquestrador-mtr.agent.md)                       │
│  ├─ Avalia demanda                                               │
│  ├─ Identifica impacto                                           │
│  └─ Escala para especialistas                                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ NOVO: Quando divergência com docs/cetesb/ é encontrada:   ││
│  │                                                             ││
│  │ 1. ESCALAR → validador-cetesb-mtr                         ││
│  │ 2. VALIDADOR AUDITA RAIZ                                  ││
│  │ 3. ESCALA → especialista apropriado                       ││
│  │ 4. ESPECIALISTA FAZ CORREÇÃO                              ││
│  │ 5. REGISTRA EM decision-log (DL-014+)                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         ↓
         │
    ┌────────────────────────────────────────────┐
    │ VALIDADOR CETESB MTR                       │
    │ (validador-cetesb-mtr.agent.md)            │
    │                                             │
    │ Responsabilidades:                         │
    │ • Analisar HARs em docs/cetesb/           │
    │ • Validar OpenAPI vs HAR                   │
    │ • Validar examples vs HAR                  │
    │ • Validar validadores vs HAR               │
    │ • Validar gateway vs HAR                   │
    │ • Validar testes vs HAR                    │
    │ • Escalade divergências para especialistas │
    └────────────────────────────────────────────┘
         ↓
         │ Usa skill:
         ↓
    ┌────────────────────────────────────────────┐
    │ SKILL: cetesb-evidence-validation.md       │
    │                                             │
    │ 8 Passos de Validação:                     │
    │ 1. Inventário de HARs                      │
    │ 2. Mapeamento em source-of-truth.js        │
    │ 3. Validação OpenAPI                       │
    │ 4. Validação Examples                      │
    │ 5. Validação Validadores                   │
    │ 6. Validação Gateway                       │
    │ 7. Validação Testes                        │
    │ 8. Auditoria Automática (npm run validate) │
    └────────────────────────────────────────────┘
         ↓
         │ Executado via:
         ↓
    ┌────────────────────────────────────────────┐
    │ PROMPT: auditar-coerencia-cetesb.prompt.md │
    │                                             │
    │ Modos de Execução:                         │
    │ • all → auditoria completa                 │
    │ • openapi|examples|validators|gateway|tests│
    │ • login|gerar_mtr|imprimir|cancelar|      │
    │   criar_cadastro                           │
    └────────────────────────────────────────────┘
         ↓
         │ Valida contra:
         ↓
    ┌────────────────────────────────────────────┐
    │ FONTE DA VERDADE: docs/cetesb/             │
    │                                             │
    │ HARs Reais:                                │
    │ • mtr.cetesb.sp.gov.br_login.har           │
    │ • mtr.cetesb.sp.gov.br_gerar_mtr.har       │
    │ • mtr.cetesb.sp.gov.br_imprimir_mtr.har    │
    │ • mtr.cetesb.sp.gov.br_cancelar_mtr.har    │
    │ • mtr.cetesb.sp.gov.br_criar_cadastro.har  │
    └────────────────────────────────────────────┘
```

## Fluxo de Divergência

```
┌──────────────────────────────────────┐
│ Desenvolvedor encontra divergência   │
│ entre código e HAR                   │
└──────────────────────────┬───────────┘
                           ↓
         ┌─────────────────────────────────────┐
         │ ❌ NÃO implementar solução rápida  │
         └─────────────────────────────────────┘
                           ↓
         ┌─────────────────────────────────────┐
         │ ✅ ESCALAR para validador-cetesb-mtr│
         │    prompt: auditar-coerencia-cetesb │
         │    com escopo relevante             │
         └─────────────────────────────────────┘
                           ↓
         ┌─────────────────────────────────────┐
         │ VALIDADOR:                          │
         │ 1. Audita raiz da divergência       │
         │ 2. Identifica camada impactada      │
         │ 3. Verifica causa (bug/mudança)     │
         │ 4. Escala para especialista         │
         └──────────┬──────────────────────────┘
                    ↓
      ┌─────────────┼─────────────┬──────────────┬─────────────┐
      ↓             ↓             ↓              ↓             ↓
   OpenAPI      Examples      Validador      Gateway         Test
   diverge?     diverge?      diverge?       diverge?        diverge?
      │             │             │              │             │
      ↓             ↓             ↓              ↓             ↓
 programador-  programador-  integrador-   integrador-    tester-
 backend-mtr   backend-mtr   cetesb-mtr    cetesb-mtr     qa-mtr
      │             │             │              │             │
      └─────────────┴─────────────┴──────────────┴─────────────┘
                           ↓
         ┌─────────────────────────────────────┐
         │ ESPECIALISTA FAZ CORREÇÃO            │
         │ com referência ao HAR e decision-log │
         └──────────────┬──────────────────────┘
                        ↓
         ┌─────────────────────────────────────┐
         │ VALIDADOR RE-AUDITA                 │
         │ auditar-coerencia-cetesb com mesmo  │
         │ escopo para confirmar coerência     │
         └─────────────────────────────────────┘
                        ↓
         ┌─────────────────────────────────────┐
         │ ✅ COERÊNCIA CONFIRMADA             │
         │    ou                               │
         │ ❌ NOVA DIVERGÊNCIA ENCONTRADA      │
         │    (repete processo)                │
         └─────────────────────────────────────┘
```

## Matriz de Escalação

```
┌─────────────────────┬──────────────────┬──────────────────────┐
│ Divergência         │ Escala para      │ Motivo               │
├─────────────────────┼──────────────────┼──────────────────────┤
│ OpenAPI schema      │ programador-     │ Contrato é           │
│ diverge de HAR      │ backend-mtr      │ responsabilidade do  │
│                     │                  │ backend              │
├─────────────────────┼──────────────────┼──────────────────────┤
│ Examples faltam     │ programador-     │ Exemplos são parte   │
│ ou divergem         │ backend-mtr      │ do contrato HTTP     │
├─────────────────────┼──────────────────┼──────────────────────┤
│ Validador rejeita   │ integrador-      │ Validador é          │
│ campo do HAR        │ cetesb-mtr       │ responsabilidade do  │
│                     │                  │ integrador           │
├─────────────────────┼──────────────────┼──────────────────────┤
│ Gateway não mapeia  │ integrador-      │ Gateway é            │
│ corretamente        │ cetesb-mtr       │ responsabilidade do  │
│                     │                  │ integrador CETESB    │
├─────────────────────┼──────────────────┼──────────────────────┤
│ Teste falha em      │ tester-qa-mtr    │ Cobertura de teste   │
│ cenário do HAR      │                  │ é responsabilidade   │
│                     │                  │ de QA                │
├─────────────────────┼──────────────────┼──────────────────────┤
│ Novo HAR capturado  │ documentador-mtr │ Novo HAR precisa de  │
│                     │                  │ registro em          │
│                     │                  │ docs/cetesb/ e docs  │
└─────────────────────┴──────────────────┴──────────────────────┘
```

## Validações Automáticas

```
auditar-coerencia-cetesb (prompt)
    │
    ├─→ npm run validate:cetesb-source
    │   └─→ scripts/validate-cetesb-source-of-truth.js
    │       • Verifica mapeamento em src/lib/cetesb-source-of-truth.js
    │       • Valida que HARs existem em docs/cetesb/
    │       • Confirma referências em openapi/
    │
    ├─→ npm run test:source-of-truth
    │   └─→ tests/unit/cetesb-source-of-truth.test.js
    │       • docs/cetesb contém todos HARs obrigatórios
    │       • mapeamento de evidência CETESB é coerente
    │
    ├─→ npm run validate:openapi
    │   └─→ Valida contrato (inclui source-of-truth)
    │       • Schemas alinhados com HARs
    │       • Exemplos presentes e válidos
    │
    └─→ npm run test:contract
        └─→ Valida padrão assíncrono
            • Examples são compatíveis com schemas
            • Campos obrigatórios presentes
```

## Documentação de Suporte

```
.github/
├── agents/
│   ├── validador-cetesb-mtr.agent.md (NOVO)
│   ├── orquestrador-mtr.agent.md (ATUALIZADO)
│   └── README.md (ATUALIZADO)
├── skills/
│   ├── cetesb-evidence-validation.md (NOVO)
│   └── ...
├── prompts/
│   ├── auditar-coerencia-cetesb.prompt.md (NOVO)
│   └── ...
└── copilot-instructions.md (ATUALIZADO)

docs/copilot/
├── 14-estrutura-copilot.md (ATUALIZADO)
├── 13-decision-log.md (ATUALIZADO - DL-014)
├── validador-cetesb-integracao.md (NOVO - guia de uso)
├── RESUMO-VALIDADOR-CETESB-MTR.md (NOVO - resumo)
├── CHECKLIST-VALIDADOR-CETESB.md (NOVO - checklist)
└── README.md (ATUALIZADO)
```

## Como Usar

### 1. Auditoria Completa
```bash
# Copilot Chat
Prompt: auditar-coerencia-cetesb
Argumento: all

# Valida tudo
```

### 2. Auditoria de Operação
```bash
Prompt: auditar-coerencia-cetesb
Argumento: gerar_mtr

# Valida apenas operação de geração de MTR
```

### 3. Auditoria de Camada
```bash
Prompt: auditar-coerencia-cetesb
Argumento: openapi

# Valida apenas contrato OpenAPI
```

## Status Final

```
✅ Agente criado e integrado
✅ Skill padronizada
✅ Prompt operacional (3 modos)
✅ Documentação completa (3 arquivos)
✅ Orquestrador atualizado
✅ Validações passando (100%)
✅ Decision-log atualizado (DL-014)
✅ Pronto para uso em produção
```

