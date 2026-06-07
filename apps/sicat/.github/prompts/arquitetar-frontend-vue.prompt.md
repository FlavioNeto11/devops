```prompt
---
name: arquitetar-frontend-vue
description: 'Planeja e implementa frontend Vue.js para orquestrar fluxos do backend MTR com foco em usabilidade, navegação e integração API.'
agent: orquestrador-mtr
argument-hint: descreva o módulo ou fluxo frontend a implementar
---

# Arquitetar Frontend Vue para o SICAT

**Contexto:** criar ou evoluir frontend em Vue.js com CSS avançado, navegação clara e integração robusta com o backend.

**Agente principal:** `orquestrador-mtr` (com escalonamento para `frontend-vue-ux-mtr` quando apropriado)

**Leitura obrigatória:**
- `README.md`
- `docs/copilot/02-arquitetura.md`
- `docs/copilot/06-contrato-openapi.md`
- `docs/copilot/14-estrutura-copilot.md`

## Tarefa

${input:escopo_frontend:Descreva o fluxo frontend alvo (ex.: autenticação, listagem e detalhamento de manifestos)}

Passos:
1. Defina arquitetura de páginas, componentes, estado e serviços HTTP.
2. Estruture design tokens e padrões de layout responsivo.
3. Implemente UX de sucesso, loading, erro e estado vazio.
4. Integre com endpoints reais do OpenAPI e preserve rastreabilidade.
5. Crie validações e checklist de qualidade visual/funcional.
6. Retorne:
   - resumo da solução
   - arquivos alterados
   - como validar localmente
   - riscos e próximos passos

```
