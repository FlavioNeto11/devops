# Skill: Frontend Vue UX Orchestration

## Quando usar
Use esta skill para projetar, implementar ou evoluir frontend Vue.js com foco em UX, navegação, CSS avançado e integração com o backend MTR.

## Objetivo
Padronizar entregas frontend com arquitetura escalável, experiência consistente e integração confiável com endpoints definidos no OpenAPI.

## Matriz de atuação
- **Arquitetura de frontend (Vue, componentes, rotas, estado)** → `frontend-vue-ux-mtr`
- **Mudanças de contrato/endpoint para suportar UI** → `programador-backend-mtr`
- **Validação de cenários críticos e smoke de fluxo** → `tester-qa-mtr`
- **Atualização de decisão técnica e documentação operacional** → `documentador-mtr`

## Padrões de implementação
1. Separar página, componente, composição, estado e cliente HTTP.
2. Definir design tokens e regras de responsividade antes de escalar componentes.
3. Garantir estados de loading, erro, vazio e sucesso em cada fluxo crítico.
4. Tratar acessibilidade básica: contraste, foco visível, navegação por teclado e rótulos semânticos.
5. Evitar acoplamento da UI com detalhes de transporte HTTP.

## Referências de contexto
- `README.md`
- `docs/copilot/02-arquitetura.md`
- `docs/copilot/06-contrato-openapi.md`
- `docs/copilot/14-estrutura-copilot.md`

## Checklist de completude
1. arquitetura e navegação definidas
2. componentes e estilos consistentes
3. integração com backend validada
4. testes/checklist de UX executados
5. documentação atualizada quando necessário
