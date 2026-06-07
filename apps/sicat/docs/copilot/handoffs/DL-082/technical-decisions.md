# Technical Decisions - DL-082

## Fatos
- O módulo de Perfis e Acessos já possui plano macro, mas faltava backlog de execução da Fase 1 com granularidade operacional.
- A Fase 1 precisa entregar fundação mínima sem acoplamento excessivo com features avançadas (ABAC completo e ações destrutivas).

## Decisão 1: começar por leitura administrativa
- **Escolha:** priorizar endpoints `GET` de administração (usuários, papéis, permissões e sessões).
- **Motivo:** habilitar visibilidade operacional antes de ações mutáveis de segurança.
- **Impacto:** reduz risco de breaking change e acelera validação de dados reais.

## Decisão 2: schema mínimo com trilha de auditoria já na Fase 1
- **Escolha:** incluir tabela de auditoria administrativa desde a primeira migration.
- **Motivo:** manter rastreabilidade desde o início e evitar dívida técnica de compliance.
- **Impacto:** custo pequeno de implementação com ganho alto de governança.

## Decisão 3: contrato-first para endpoints admin
- **Escolha:** OpenAPI e examples entram no backlog da Fase 1 antes de consolidar endpoints.
- **Motivo:** garantir alinhamento entre frontend/backend e reduzir retrabalho.
- **Impacto:** fluxo previsível para geração de operations e validação automática.

## Decisão 4: layout inicial sem ações destrutivas
- **Escolha:** primeira tela focada em leitura/filtros/estado operacional.
- **Motivo:** diminuir risco de operação indevida enquanto regras finas de permissão amadurecem.
- **Impacto:** entrega incremental segura, pronta para expandir em Fase 2.

## Decisão 5: Fase 2 com escrita incremental e auditável
- **Escolha:** implementar escrita em duas ondas: (1) grant/revoke/reset/expire, (2) CRUD completo de roles/permissions.
- **Motivo:** reduzir risco de regressão de segurança e permitir validação progressiva por contrato e backend.
- **Impacto:** governança administrativa completa com trilha de auditoria preservada e rollout controlado.

## Pendências para Fase 2
- revogação explícita de sessões ativas por comando administrativo dedicado
- enforcement avançado de autorização por política (ABAC/escopos finos)
