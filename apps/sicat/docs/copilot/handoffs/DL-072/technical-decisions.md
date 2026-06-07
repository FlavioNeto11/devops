# Technical Decisions - DL-072

## Fatos
- O dashboard consolidado (DL-071) já estava implementado, mas sem ownership explícito de evolução.
- Demandas de observabilidade cruzam múltiplas camadas e exigem orquestração consistente.

## Decisão 1: criar agente dedicado de dashboard
- **Escolha:** criar `dashboard-observability-mtr`.
- **Motivo:** reduzir dispersão de responsabilidade e acelerar evolução orientada por métricas.
- **Impacto:** trilha mais previsível para alterações backend + frontend + contrato + docs.

## Decisão 2: criar skill especializada
- **Escolha:** criar `skills/dashboard-observability/SKILL.md`.
- **Motivo:** padronizar playbook técnico e validação mínima para mudanças de dashboard.
- **Impacto:** maior consistência nas entregas e menor risco de regressão de contrato.

## Decisão 3: criar prompt operacional específico
- **Escolha:** criar `evoluir-dashboard-observabilidade.prompt.md`.
- **Motivo:** facilitar acionamento direto no VS Code com placeholders práticos.
- **Impacto:** adoção simplificada pela equipe para melhorias contínuas do dashboard.
