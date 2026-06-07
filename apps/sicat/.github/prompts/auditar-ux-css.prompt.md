```prompt
---
name: auditar-ux-css
description: 'Audita frontend Vue com foco em UX, acessibilidade, CSS avançado, responsividade e consistência de navegação.'
agent: frontend-vue-ux-mtr
argument-hint: informe tela, fluxo ou diretório frontend para auditoria
---

# Auditoria de UX e CSS Avançado

**Contexto:** analisar interface e propor melhorias práticas de layout, usabilidade, acessibilidade e navegação.

**Agente:** `frontend-vue-ux-mtr`

## Escopo

${input:alvo_ux:Informe arquivo, pasta ou fluxo de navegação para auditoria}

Critérios mínimos:
1. Hierarquia visual e legibilidade.
2. Responsividade (mobile, tablet, desktop).
3. Acessibilidade (contraste, foco, teclado, rótulos).
4. Coerência de componentes, espaçamento e estados visuais.
5. Navegação e feedback de ações do usuário.

Retornar:
- problemas priorizados por impacto
- recomendações com implementação objetiva
- plano incremental de correção
- comandos para validação final

```
