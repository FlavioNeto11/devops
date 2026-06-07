---
applyTo: "docs/copilot/**/*.md,README.md,tests/**/*.md,.github/skills/**/*.md,.github/prompts/**/*.md"
---
## Instruções para documentação

- documente com foco operacional e reutilizável
- registre fatos observados, decisões e pendências separadamente
- não repita o que já está óbvio no código
- sempre citar arquivos, fluxos e componentes impactados
- manter consistência com `openapi/`, `examples/` e `src/`
- diferencie claramente comportamento implementado, hipótese e backlog

### Estrutura obrigatória de destino (anti-arquivo solto)

- Não criar arquivos `HANDOFF-*` soltos na raiz de `docs/copilot/`.
- Guias gerais de handoff devem ficar em `docs/copilot/handoffs/guias/`.
- Artefatos por decisão devem ficar em `docs/copilot/handoffs/DL-XXX/`.
- Materiais operacionais de execução devem ficar em `docs/copilot/handoffs/DL-XXX/execution/`.
- Documentos de validação CETESB devem ficar em `docs/copilot/validadores/cetesb/`.
- Documentos de implementação técnica devem ficar em `docs/copilot/implementacoes/`.
- Evitar duplicidade por case/idioma para o mesmo conteúdo; manter um arquivo canônico.
