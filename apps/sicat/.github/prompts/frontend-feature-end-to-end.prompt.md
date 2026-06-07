```prompt
---
name: frontend-feature-end-to-end
description: 'Implementa uma feature completa de frontend Vue com orquestração de backend, testes e documentação em um único fluxo.'
agent: orquestrador-mtr
argument-hint: descreva a feature de ponta a ponta (UX, telas, integrações, regras e critérios)
---

# Frontend Feature End-to-End

**Contexto:** entregar uma feature completa de frontend (Vue.js + UX/CSS) com integração ao backend, validação e documentação.

**Agente principal:** `orquestrador-mtr`

## Tarefa

${input:feature_e2e:Descreva a feature completa (fluxo do usuário, telas, chamadas de API, regras e critérios de aceite)}

Passos:
1. Decompor a feature em frontend, contrato/backend, testes e documentação.
2. Escalar para `frontend-vue-ux-mtr` para arquitetura de UI, navegação e usabilidade.
3. Escalar para backend quando houver ajuste de contrato, endpoints ou validações.
4. Escalar para QA para testes funcionais/contrato e smoke aplicáveis.
5. Escalar para documentação para registrar decisão técnica e operação.
6. Retornar:
   - resumo do que foi implementado
   - arquivos alterados
   - comandos de validação
   - riscos e próximos passos

```
