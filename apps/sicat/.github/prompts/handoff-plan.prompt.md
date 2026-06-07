---
name: handoff-plan
description: Decompor uma demanda em fases executáveis, dependências, riscos e validações antes dos handoffs
agent: executor-handoffs
argument-hint: "descrição da feature ou demanda"
---

<!-- markdownlint-disable MD040 -->

# Planejar Handoff Multi-Camada

Use este prompt para pedir ao `executor-handoffs` apenas a **decomposição executável** da demanda, sem partir imediatamente para a implementação.

## Como Usar

```
@workspace #executor-handoffs

/handoff-plan Adicione suporte a diferentes tipos de transportadores (pessoa física vs jurídica)

Contexto adicional:
- Já existe validação de CNPJ, precisa adicionar CPF
- CETESB pode ter restrições
- Impacta formulário e banco de dados
```

Ou simples:

```
/handoff-plan Implemente auditoria de mudanças em manifestos
```

## Resultado Esperado

O executor deve responder com:

1. **Classificação executável**
   - complexidade
   - camadas impactadas
   - risco
   - modo de execução (`linear` ou `coordinated-front`)

2. **Plano de handoffs**
   - ordem
   - especialista por fase
   - dependências
   - validações esperadas

3. **Riscos e blocadores**
   - hipóteses críticas
   - dependências externas
   - checagens obrigatórias com CETESB/HAR

4. **Critério de pronto**
   - o que precisa estar implementado, validado e documentado

## Exemplo de Saída

```markdown
## PLANEJAMENTO: Tipos de Transportadores (CPF vs CNPJ)

### Decomposição em Camadas

1. **CONTRATO** (20 min)
   - POST /v1/manifestos: novo campo "transporterType" (enum: CNPJ | CPF)
   - GET /v1/manifestos/{id}: retornar transporterType
   - Examples: request/response com ambos tipos

2. **VALIDAÇÃO CETESB** (10 min)
   - Auditar se CETESB permite ambos tipos
   - Se divergência: registrar

3. **VALIDADOR** (30 min)
   - Se CNPJ: existente (validador-cnpj)
   - Se CPF: novo validador-cpf
   - Validar campo "transporterType"

4. **GATEWAY** (30 min)
   - Ajustar payload para CETESB (ambos tipos)
   - Testar integração

5. **BANCO** (20 min)
   - Migration: adicionar column transporterType
   - Repository: carregar/persistir

6. **TESTES** (40 min)
   - Test CNPJ: ✅ 200
   - Test CPF: ✅ 200
   - Test invalid CPF: ✅ 400
   - E2E: ambos tipos

7. **DOCS** (15 min)
   - Modelo: adicionar field
   - Roadmap: marcar completo

### Ordem Sequencial
Contrato → CETESB → Validador → Gateway → Banco → Testes → Docs

### Modo de Execução
Linear por dependência, com validação CETESB antes de gateway/banco.

### Riscos
1. CETESB pode não suportar CPF
   - Impact: redesenhar validação
   - Mitigação: validar logo em CETESB
2. CPF tem validação diferente de CNPJ
   - Impact: implementação mais complexa
   - Mitigação: buscar biblioteca confiável

### Critério de Pronto
- ✅ OpenAPI suporta ambos tipos
- ✅ CETESB validado (risco 1 resolvido)
- ✅ Validador CPF implementado
- ✅ Testes passam (ambos tipos)
- ✅ Docs atualizadas
- ✅ validações aplicáveis executadas
```

## Referências

- `docs/copilot/handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- `docs/copilot/handoffs/guias/QUICK-REFERENCE-HANDOFFS.md`
- `.github/instructions/executor-handoffs.instructions.md`
