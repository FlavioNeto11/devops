# Fonte de verdade — backlog CTO/produto SICAT

> Visão consolidada de produto/CTO. Reúne pilares, KPIs, gaps SIGOR x
> SICAT e próximas frentes estratégicas. Este documento é a referência
> única para priorização da plataforma e alimenta tanto o `work_id`
> `centro-operacional-sicat` quanto entregas posteriores.

## 1. Posicionamento de produto

SICAT não é um clone do SIGOR. É uma plataforma operacional que:

- abstrai o portal CETESB com identidade própria de produto e múltiplas
  contas CETESB por usuário;
- expõe a operação assíncrona como cidadã de primeira classe (jobs,
  retry, DLQ, audit);
- entrega observabilidade e governança que o portal não oferece;
- prepara base para automação assistida (Command Center) sem reescrever
  o núcleo.

A demanda original do CTO/usuário é evoluir o SICAT do estágio "núcleo
operacional CETESB/MTR/CDF estável" para um **Centro Operacional SICAT**:
camada consolidada de operação, observabilidade, diagnóstico e
relatórios, preparando o solo estrutural para um futuro chat
orquestrador.

## 2. Pilares estratégicos

1. **Operação consciente**: todo comando crítico é assíncrono,
   correlacionado e auditável.
2. **Observabilidade nativa**: jobs, métricas, auditoria, saúde de
   contas/sessões CETESB visíveis em UI dedicada.
3. **Governança e RBAC**: identidade SICAT separada da identidade
   CETESB, com perfis e permissões internos.
4. **Paridade pragmática com SIGOR**: cobrir o que é operacionalmente
   relevante, com UX SICAT, sem replicar tela a tela.
5. **Evolução incremental para automação assistida**: registry +
   palette de comandos como solo do Command Center; IA generativa
   acoplada só quando contratos e segurança estiverem prontos.

## 3. KPIs propostos (baseline para o Centro Operacional)

KPIs operacionais que devem ser expostos em
`/v1/operations/overview` e renderizados no `operations-dashboard`:

| KPI | Definição | Fonte |
| --- | --- | --- |
| Jobs por status (24h/7d) | contagem de `jobs` agrupada por `status` | `jobs` + `performance_snapshots` |
| Tempo médio por operação | média de `finished_at - claimed_at` por `operation_type` | `jobs` |
| Taxa de erro CETESB | proporção de `failed`/`dlq` sobre total terminado | `jobs` + `system_events` |
| DLQ ativa | total de jobs em `dlq` por operação | `jobs` |
| Contas CETESB ativas | contas SICAT com sessão válida nas últimas 24h | `sicat_cetesb_accounts` + `session_contexts` |
| Sessões CETESB próximas do vencimento | tokens com expiração < 30 min | `session_contexts` |
| Workers saudáveis | workers com `last_heartbeat_at` < 60s | `worker_health` |
| MTRs emitidos no período | manifestos com `status = submitted/printed` | `manifests` |
| CDFs emitidos no período | certificados com geração concluída | `manifests` + jobs `cdf.generate` |

Os nomes de campos podem ser refinados durante a fase 02
(`programador-backend-mtr`); a fonte primária é sempre Postgres.

## 4. Mapa de gaps SIGOR x SICAT (resumo)

Resumo consolidado de
`docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`:

### 4.1 Coberto no SICAT

- criação, listagem e detalhe de manifesto;
- consulta e operação básica de CDF (caso padrão);
- autenticação operacional via conta CETESB integrada.

### 4.2 Coberto de forma diferente

- entrada/login (SICAT tem login próprio + seleção de conta);
- home (SICAT entrega dashboard operacional, não hub estático);
- recebimento de MTR (existe, mas com UX diferente do portal).

### 4.3 Gap de UI/orquestração

- relatório dedicado de MTRs equivalente ao portal (rota existe, UX é
  parcial);
- camada estática de ajuda (FAQ, manual, primeiro acesso).

### 4.4 Gap de backend/contrato

- **DMR** (Declaração de Movimentação de Resíduos): inexistente em
  rotas, services, OpenAPI e UI;
- **MTR provisório**: cadastro/listagem/impressão sem suporte;
- **MTR complementar para armazenamento temporário**: fluxo dedicado
  ausente (apenas campos genéricos no manifesto comum);
- **CDF sem MTR / CDF de acidentes sem MTR**: variantes especiais sem
  orquestração;
- **Configurações CETESB do empreendimento** (Meus Dados, Meus Usuários
  locais, Alterar Senha): sem recursos equivalentes;
- **Autoatendimento CETESB** (recuperação/troca de senha): sem
  integração interna.

### 4.5 Extras que o SICAT já adiciona

- autenticação SICAT própria;
- multi-conta CETESB com persistência;
- dashboard operacional;
- monitor de jobs (active + DLQ);
- ações em lote sobre manifestos;
- RBAC interno e administração de acessos.

## 5. Próximas frentes estratégicas

Cada frente é um candidato a `work_id` próprio. A frente 1 é o foco
imediato (`centro-operacional-sicat`); as demais ficam priorizadas em
backlog e serão acionadas em ondas posteriores.

### Frente 1 — Centro Operacional SICAT (atual)

Consolidação de operação, observabilidade, governança e relatórios em
módulos dedicados. Detalhamento técnico em
`docs/04-arquitetura/centro-operacional-sicat.md`.

Endpoints-alvo (a serem implementados na fase 02):

- `GET /v1/operations/overview`
- `GET /v1/jobs/search`
- `GET /v1/jobs/:id/events` (já existe; consolidar contrato)
- `POST /v1/jobs/:id/retry`
- `GET /v1/audit/search`
- `GET /v1/audit/:correlationId` (já existe; consolidar contrato)
- `GET /v1/cetesb/accounts/health`
- `GET /v1/cetesb/sessions/health`
- `GET /v1/reports/mtrs`
- `GET /v1/reports/mtrs/export`

### Frente 2 — DMR (Declaração de Movimentação de Resíduos)

Fluxo declaratório completo: criação, pendentes, listagem, integração
com CETESB. Maior buraco de paridade funcional.

### Frente 3 — MTR provisório

Cadastro, listagem e impressão de manifestos provisórios.

### Frente 4 — CDF especializado

Variantes `sem MTR` e `acidentes sem MTR`, além de revisão do CDF
padrão para casos não cobertos.

### Frente 5 — Armazenamento temporário

MTR complementar dedicado e relatório próprio para armazenamento
temporário (perfil destino final).

### Frente 6 — Configurações e autoatendimento CETESB

Decidir posição de produto: internalizar `Meus Dados`, `Meus Usuários`
local, troca de senha e recuperação, ou redirecionar explicitamente
para o portal.

### Frente 7 — Chat orquestrador (Command Center)

Camada generativa sobre o registry + palette estabelecidos na frente
1. Acoplamento de IA só após contratos, segurança e telemetria
maduros. Detalhamento em
`docs/04-arquitetura/command-center-sicat.md`.

## 6. Critérios de priorização

- **Risco operacional/regulatório**: gaps que impedem o usuário de
  cumprir obrigação CETESB (DMR, provisório) sobem.
- **Densidade de uso**: telas/rotas com tráfego operacional alto
  (manifestos, CDF, jobs) ganham hardening primeiro.
- **Dívida de governança**: ausência de RBAC, audit, observabilidade
  bloqueia rollout enterprise — endereçada pela frente 1.
- **Risco de IA prematura**: nenhum backend generativo é introduzido
  sem contratos estáveis e telemetria pronta.

## 7. Como manter este documento vivo

- Cada nova frente vira `work_id` próprio, com checkpoints em
  `docs/handoffs/<work_id>/`.
- A documentação final de cada frente atualiza este arquivo (seção 5)
  com status real (concluída, em progresso, descartada).
- `docs/10-estado-atual/estado-atual.md` é o snapshot operacional;
  este arquivo é o snapshot estratégico.
