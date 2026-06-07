# Implementação — Módulo de Perfis e Acessos (RBAC/ABAC)

Data: 2026-03-15  
Responsável de orquestração: `perfis-acessos-admin-mtr`

## Objetivo

Criar um módulo administrativo dedicado para governança de perfis e acessos no SICAT, com controle fino de permissões e uma tela central para administração de usuários, sessões e políticas de segurança.

## Escopo funcional

- gestão de papéis (`roles`) e permissões (`permissions`) por recurso/ação
- vínculo usuário ↔ papéis (múltiplos papéis por usuário)
- políticas adicionais por contexto (ABAC leve), quando necessário
- gestão administrativa de sessões (ativas/inativas) por usuário
- ações operacionais de segurança:
  - revogar/derrubar sessão
  - atualizar/renovar sessão
  - expirar senha
  - resetar senha
- trilha de auditoria para toda ação sensível

## Escopo técnico

### Backend
- rotas administrativas em `src/routes/api-routes.js`
- serviços dedicados em `src/services/` para:
  - gestão de perfis/permissões
  - gestão de sessões administrativas
  - políticas de senha
- repositórios em `src/repositories/` para persistência de:
  - papéis
  - permissões
  - vínculos usuário-papel
  - sessões
  - auditoria de ações administrativas

### Banco de dados
- migrations para tabelas do módulo em `src/db/` e/ou SQL em `src/sql/`
- constraints e índices para consulta rápida de autorização por usuário
- trilha de auditoria com retenção e filtros por período/ator/alvo

### Frontend
- nova tela administrativa em `frontend/src/views/` para:
  - listagem de usuários
  - detalhes de perfil/acessos
  - matriz de permissões por recurso/ação
  - gestão de sessões por usuário
  - ações de senha/sessão com confirmação
- componentes reutilizáveis em `frontend/src/components/`
- integração API em `frontend/src/services/api.js`

### Contrato e documentação
- OpenAPI atualizado em `openapi/`
- exemplos de request/response em `examples/`
- operações regeneradas em `src/generated/operations.js`
- decision-log atualizado em `docs/copilot/13-decision-log.md`

## Modelo de autorização (proposto)

### RBAC base
- `role`: conjunto nomeado de permissões
- `permission`: ação específica em recurso (`resource:action`)
- `user_roles`: relação N:N entre usuário e papel

### ABAC complementar (fino)
- políticas condicionais por contexto (ex.: escopo organizacional, ambiente, tipo de operação)
- usadas apenas onde RBAC não resolve com simplicidade

## Fases de implementação

## Fase 1 — Fundação de domínio
- definir entidades: usuário, papel, permissão, sessão, auditoria
- criar schema inicial + migrations
- criar serviços/repositórios básicos
- expor endpoints de leitura administrativa (consulta)

## Fase 2 — Governança de acesso
- CRUD de papéis e permissões
- associação usuário ↔ papéis
- middleware de autorização por permissão
- bloqueio de rotas administrativas por escopo

## Fase 3 — Gestão de sessões e segurança
- listagem global de sessões ativas/inativas
- ação de revogação/encerramento de sessão
- atualização/renovação de sessão administrativa
- expiração/reset de senha com trilha de auditoria

## Fase 4 — UI administrativa
- tela de usuários/perfis/acessos
- matriz de permissões
- painel de sessões por usuário
- ações críticas com confirmação e feedback

## Fase 5 — Hardening e rollout
- testes de regressão e segurança
- validação de contrato e exemplos
- observabilidade e auditoria operacional
- documentação final e guia de operação

## Segurança e governança

- aplicar menor privilégio por padrão
- separar perfil de operador e administrador
- registrar ator, alvo, data/hora, motivo e correlação em ações sensíveis
- exigir confirmação explícita para ações destrutivas
- evitar exposição de dados sensíveis em payload de UI/log

## Métricas de sucesso

- tempo para localizar e agir sobre sessão de usuário reduzido
- incidentes de permissão indevida reduzidos
- cobertura de auditoria de ações administrativas em 100%
- fluxo de manutenção de acesso executável sem intervenção manual em banco

## Dependências e handoffs

- `programador-backend-mtr`: API e serviços de domínio
- `postgres-queue-mtr`: schema/migrations/consistência
- `frontend-vue-ux-mtr`: UX e componentes da nova tela
- `tester-qa-mtr`: testes de regressão e segurança
- `documentador-mtr`: guias operacionais e decision-log

## Riscos e mitigação

- Complexidade excessiva de política: começar com RBAC simples e evoluir ABAC por necessidade real
- Regressão de autorização: testes automatizados por perfil e por rota
- Acoplamento com sessão CETESB: separar claramente sessão SICAT administrativa de contexto CETESB

## Critério de pronto do módulo

- módulo implantado com tela administrativa funcional
- controle fino de permissões aplicado nas rotas críticas
- ações de sessão/senha operacionais com auditoria
- validações de build/contrato/testes executadas
- documentação e playbook de operação publicados
