# 🎯 PRONTO: Agente Validador CETESB Criado e Integrado

## O que foi entregue

Um **agente especializado e integrado ao orquestrador** que valida se tudo está coerente com `docs/cetesb/` (evidência real em HARs).

## Componentes Criados

### 1️⃣ Agente: `validador-cetesb-mtr.agent.md`
- **Arquivo**: `.github/agents/validador-cetesb-mtr.agent.md` (7.5 KB)
- **Missão**: Auditar coerência entre implementação e HARs reais
- **Como funciona**: Analisa HAR → valida OpenAPI/examples/validadores/gateway/testes → escala divergências

### 2️⃣ Skill: `cetesb-evidence-validation.md`
- **Arquivo**: `.github/skills/cetesb-evidence-validation.md`
- **Conteúdo**: 8 passos de validação com checklist e interpretação de HAR
- **Uso**: Padroniza processo de auditoria de coerência

### 3️⃣ Prompt: `auditar-coerencia-cetesb.prompt.md`
- **Arquivo**: `.github/prompts/auditar-coerencia-cetesb.prompt.md`
- **3 Modos**:
  - `all` → auditoria completa
  - `openapi|examples|validators|gateway|tests` → auditoria por camada
  - `login|gerar_mtr|imprimir|cancelar|criar_cadastro` → auditoria por operação

### 4️⃣ Documentação Completa
- `docs/copilot/validadores/cetesb/validador-cetesb-integracao.md` - Guia de uso
- `docs/copilot/validadores/cetesb/RESUMO-VALIDADOR-CETESB-MTR.md` - Resumo técnico
- `docs/copilot/validadores/cetesb/CHECKLIST-VALIDADOR-CETESB.md` - Checklist de implementação
- `docs/copilot/validadores/cetesb/FLUXOGRAMA-VALIDADOR-CETESB.md` - Diagramas e fluxos

## Como usar

### Passo 1: Abrir Copilot Chat no VS Code
```
Ctrl+Shift+I (Windows/Linux) ou Cmd+Shift+I (Mac)
```

### Passo 2: Executar o prompt
```
No Copilot Chat, digite:

Prompt: auditar-coerencia-cetesb
Argumento: all

ou escolha um dos modos específicos acima
```

### Passo 3: Validador fará auditoria
```
✓ Listará HARs em docs/cetesb/ (5 operações)
✓ Validará OpenAPI + examples + validadores + gateway + testes
✓ Executará npm run validate:cetesb-source
✓ Executará npm run test:source-of-truth
✓ Relatório de coerência
✓ Escalonará divergências encontradas para especialistas
```

## Protocolo de Divergência

**Quando encontrar divergência entre código e HAR:**

1. ❌ **NÃO** implemente "solução" rápida
2. ✅ **ESCALE** para `validador-cetesb-mtr`
3. Validador audita raiz
4. Validador escala para especialista apropriado (backend, integrador, QA)
5. Especialista faz correção com referência ao HAR
6. Registra em decision-log
7. Validador re-audita para confirmar

## Integração com Orquestrador

O agente está **totalmente integrado** ao `orquestrador-mtr`:

```
orquestrador-mtr
├─ Implementar backend → programador-backend-mtr
├─ Integrar CETESB → integrador-cetesb-mtr
├─ Evoluir Postgres/fila → postgres-queue-mtr
├─ Validar com testes → tester-qa-mtr
├─ Auditar coerência com HARs → validador-cetesb-mtr ✅ NOVO
├─ Atualizar documentação → documentador-mtr
└─ Evoluir estrutura Copilot → meta-evolution-copilot
```

## Matriz de Escalação

Validador escala automaticamente para:

| Divergência | Especialista | Motivo |
|---|---|---|
| OpenAPI diverge | programador-backend-mtr | Contrato |
| Examples faltam | programador-backend-mtr | Contrato |
| Validador diverge | integrador-cetesb-mtr | Validação |
| Gateway diverge | integrador-cetesb-mtr | Integração |
| Teste diverge | tester-qa-mtr | Testes |
| Novo HAR | documentador-mtr | Documentação |

## Validações ✅

Todas as validações passam:

```
✅ npm run validate:cetesb-source
   [ok] Política de fonte da verdade CETESB validada com sucesso.

✅ npm run test:source-of-truth
   ✔ docs/cetesb contém todos HARs obrigatórios
   ✔ mapeamento de evidência CETESB é coerente
   (2/2 passing)
```

## Exemplo: Auditar operação de geração de MTR

```
1. Copilot Chat:
   Prompt: auditar-coerencia-cetesb
   Argumento: gerar_mtr

2. Validador:
   ✓ Extrai HAR: mtr.cetesb.sp.gov.br_gerar_mtr.har
   ✓ Valida OpenAPI: POST /v1/manifestos presente?
   ✓ Valida examples: request/response existem?
   ✓ Valida validador: manifest-validator cobre campos?
   ✓ Valida gateway: mapeia headers/body?
   ✓ Valida testes: cenários cobrem fluxo?

3. Resultado:
   ✅ Coerência confirmada
   ou
   ❌ Divergências encontradas + escalonamento automático
```

## Documentação de Referência

Leia em ordem:

1. **Passo a passo**: `docs/copilot/validadores/cetesb/validador-cetesb-integracao.md`
2. **Resumo técnico**: `docs/copilot/validadores/cetesb/RESUMO-VALIDADOR-CETESB-MTR.md`
3. **Fluxogramas**: `docs/copilot/validadores/cetesb/FLUXOGRAMA-VALIDADOR-CETESB.md`
4. **Checklist**: `docs/copilot/validadores/cetesb/CHECKLIST-VALIDADOR-CETESB.md`
5. **Decisão**: `docs/copilot/13-decision-log.md#DL-014`

## Benefícios

✅ **Coerência garantida** - validação automática evita drift  
✅ **Baseado em evidência** - divergências investigadas antes de "solução"  
✅ **Escalonamento eficiente** - mismatch vai para especialista apropriado  
✅ **Rastreabilidade** - cada decisão registrada em decision-log  
✅ **Reproduzibilidade** - protocolo padronizado para todos os cenários  

## Próximos Passos

1. ✅ **Testar agente**
   ```
   Copilot Chat: auditar-coerencia-cetesb → argumento: all
   ```

2. ✅ **Experimentar protocolo**
   - Quando encontrar divergência, escale para validador
   - Observe como valida raiz
   - Observe escalonamento para especialista

3. 📖 **Documentar aprendizados**
   - Se encontrar padrão novo, registre em decision-log
   - Se precisar ajustar skill, atualize cetesb-evidence-validation.md

4. 🔄 **Integrar em fluxo diário**
   - Use prompt `auditar-coerencia-cetesb` quando:
     - Acabou feature novo
     - Antes de submeter PR
     - Quando encontrar "anomalia" em testes

## Status

| Item | Status |
|---|---|
| Agente criado | ✅ |
| Skill padronizada | ✅ |
| Prompt operacional | ✅ |
| Orquestrador integrado | ✅ |
| Documentação | ✅ |
| Validações passando | ✅ |
| Pronto para uso | ✅ |

---

## 🚀 Pronto para usar agora!

Execute no Copilot Chat:
```
Prompt: auditar-coerencia-cetesb
Argumento: all
```


