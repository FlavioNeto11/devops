---
name: auditar-coerencia-cetesb
description: Audita coerência entre implementação e evidência real em docs/cetesb/, verificando OpenAPI, examples, validadores, gateway e testes contra HARs reais.
agent: validador-cetesb-mtr
argument-hint: escopo da auditoria (all, openapi, examples, validators, gateway, tests) ou operação específica (login, gerar_mtr, imprimir, cancelar, criar_cadastro)
tools:
  ['edit', 'search', 'new', 'runCommands', 'problems', 'changes']
---

# Auditar Coerência com docs/cetesb/

Você está prestes a usar o agente **validador-cetesb-mtr** para auditar coerência entre implementação e evidência real.

## Como usar

### Opção 1: Auditoria completa
```
Execute este prompt com argumento: all

Resultado:
- Audita todos os HARs em docs/cetesb/
- Valida coerência em cada camada (openapi, examples, validators, gateway, tests)
- Gera relatório de achados
- Escala divergências para especialistas
```

### Opção 2: Auditoria por camada
```
Execute este prompt com argumento: openapi, examples, validators, gateway ou tests

Resultado:
- Valida coerência apenas daquela camada contra HARs
- Gera checklist de itens conformes
- Identifica gaps
```

### Opção 3: Auditoria de operação específica
```
Execute este prompt com argumento: login, gerar_mtr, imprimir, cancelar ou criar_cadastro

Resultado:
- Extrai evidência daquele HAR
- Valida se todas as camadas cobrem essa operação
- Gera relatório específico
```

## Fluxo esperado

1. **Análise de HARs**
   - Inventariar HARs em `docs/cetesb/`
   - Extrair operação, request/response, status codes

2. **Validação contra implementação**
   - Verificar OpenAPI contém endpoint + schemas
   - Verificar examples existem e são válidos
   - Verificar validadores cobrem campos obrigatórios
   - Verificar gateway mapeia corretamente
   - Verificar testes cobrem cenários do HAR

3. **Execução de validações automáticas**
   ```bash
   npm run validate:cetesb-source
   npm run test:source-of-truth
   npm run validate:openapi
   npm run test:contract
   ```

4. **Relatório de coerência**
   - Resumo de achados (conformes, gaps, divergências)
   - Lista de divergências por camada
   - Recomendações de ajustes

5. **Escalonamento de divergências**
   - Mismatch OpenAPI → `programador-backend-mtr`
   - Mismatch validador → `integrador-cetesb-mtr`
   - Mismatch gateway → `integrador-cetesb-mtr`
   - Mismatch teste → `tester-qa-mtr`
   - Novo HAR → `documentador-mtr`

## Exemplo: Auditar coerência completa

```
Prompt: auditar-coerencia-cetesb
Argumento: all

Agente irá:
1. Listar HARs em docs/cetesb/ (5 arquivos)
2. Para cada HAR:
   a. Extrair request/response structure
   b. Validar OpenAPI contém operação
   c. Validar examples existem
   d. Validar validadores (se aplicável)
   e. Validar gateway (se aplicável)
   f. Validar testes
3. Executar npm run validate:cetesb-source
4. Executar npm run test:source-of-truth
5. Gerar relatório de coerência
6. Escalar divergências encontradas
```

## Exemplo: Auditar operação específica

```
Prompt: auditar-coerencia-cetesb
Argumento: gerar_mtr

Agente irá:
1. Encontrar HAR: mtr.cetesb.sp.gov.br_gerar_mtr.har
2. Extrair estrutura: POST /v1/manifestos
3. Validar que openapi/ contém este endpoint
4. Validar que examples/ contém request/response
5. Validar que validador de manifesto existe
6. Validar que gateway implementa corretamente
7. Validar que tests cobrem este fluxo
8. Gerar checklist de conformidade
```

## Quando usar este prompt

Use quando:
- Desenvolveu nova feature e quer validar contra HAR
- Atualizou HAR e precisa sincronizar código
- Encontrou divergência entre código e integração real
- Quer audit completo de coerência antes de release
- Novo desenvolvedor quer entender como evidência é rastreada
- Precisa escalar mismatch para especialista apropriado

## Saída esperada

### Se tudo está coerente
```
✓ docs/cetesb/ - 5 HARs presentes
✓ Mapeamento em cetesb-source-of-truth.js - sincronizado
✓ OpenAPI - 5 operações cobertas (18/18 total)
✓ Examples - 10 arquivos (5 request + 5 response)
✓ Validadores - manifest-validator cobre campos
✓ Gateway - mapeia headers, body, status codes
✓ Testes - integration + worker cobrem cenários
✓ npm run validate:cetesb-source - passing
✓ npm run test:source-of-truth - 2/2 passing

Conclusão: Implementação está coerente com evidência em docs/cetesb/
```

### Se há divergências
```
⚠ Divergência encontrada:

OpenAPI: 
- Endpoint POST /v1/manifestos espera campo 'responsibleName'
- HAR mostra campo 'responsiblePersonName'

Ação:
→ Escalando para programador-backend-mtr

Validador:
- manifesto-validator rejeita 'optionalField'
- HAR mostra que CETESB aceita 'optionalField'

Ação:
→ Escalando para integrador-cetesb-mtr

[Relatório completo em relatório-coerencia-cetesb-20260308.md]
```

## Próximos passos

Após auditoria:
1. Se nenhuma divergência → apenas confirme coerência
2. Se divergências encontradas → agente escalará para especialista
3. Especialista fará correções necessárias
4. Após correções → re-executar este prompt para confirmar
5. Registrar achados em decision-log

