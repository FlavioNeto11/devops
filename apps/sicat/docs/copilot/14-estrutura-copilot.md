<!-- markdownlint-disable MD007 MD022 MD031 MD032 MD040 -->

# Estrutura de documentação

## ✅ Localhost isolado sem handoff próprio (2026-04-19 - concluído)
- Refinamento estrutural do roteamento para pedidos puramente operacionais de ambiente local, stack local e disponibilidade de localhost.
- `orquestrador-mtr` passa a tratar esses pedidos como execução direta em `estrutura-vscode-mtr`, sem abrir workstream autônomo por padrão.
- `estrutura-vscode-mtr` permanece como fase intermediária obrigatória apenas quando localhost fizer parte de uma cadeia maior com implementação, QA, documentação ou outro owner adicional.

## ✅ Memória orquestrada opcional com mempalace (2026-04-19 - concluído)
- **DL-095**: integração estrutural de mempalace como memória suplementar da linha de agentes, cobrindo continuidade por `work_id`, memória de repositório/workspace e política explícita de fallback quando o MCP não estiver disponível.
- **Escopo:** instructions globais, skill dedicada, READMEs de discoverability, prompts de entrada e perfil mínimo de tools em agentes de orquestração/documentação/workspace.
- **Decisão estrutural:** a fonte canônica continua sendo o repositório; mempalace entra apenas como camada opcional de memória orquestrada.
- **Limite de ownership:** wiring e configuração concreta de workspace/MCP permanecem como fase própria de `estrutura-vscode-mtr`.
- **Status**: ✅ COMPLETADO ([DL-095](13-decision-log.md#dl-095))

## ✅ Auditoria externa assistida com Playwright (2026-04-19 - concluído)
- **DL-094**: criação de um especialista dedicado para navegação externa auditável com Playwright, com prompt parametrizado, checkpoint humano para CAPTCHA e gates explícitos antes de mutações.
- **Atualização estrutural:** bloqueios humanos e perda acidental da janela passam a manter a mesma fase em espera (`awaiting_user_unblock_in_chat`) em vez de encerrar o fluxo do chat.
- **Status**: ✅ COMPLETADO ([DL-094](13-decision-log.md#dl-094))

## ✅ Migração completa JavaScript → TypeScript do backend SICAT (2026-04-16 - concluído)
- **DL-093**: migração de 60+ arquivos `src/**` de JS para TS com strict mode, tsconfig, runtime tsx, build tsc + correção CORS.
- **Escopo**: todas as camadas (services, repos, workers, middlewares, routes, lib, bootstrap, db), package.json, tsconfig.json.
- **Exceção**: `src/gateways/cetesb-gateway.js` permanece JS (ESM interop estável).
- **Status**: ✅ COMPLETADO ([DL-093](13-decision-log.md#dl-093))

## ✅ Refatoração estrutural do `executor-handoffs` para protocolo de execução por fases (2026-03-23 - concluído)
- **DL-092**: reorganização do executor de handoffs para o padrão de decomposição executável → sequência por dependência → validação por fase → consolidação final, preservando preset coordenado e kit observável.
- **Handoff 1/1 (Refatoração do executor + sincronização meta):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-092](13-decision-log.md#dl-092))

## ✅ Refatoração estrutural do `orquestrador-mtr` para protocolo de classificação e roteamento (2026-03-23 - concluído)
- **DL-091**: reorganização do agente principal para o padrão de classificação → roteamento → validação → refinamento, preservando especialistas, preset operacional coordenado e regra `validador-first`.
- **Handoff 1/1 (Refatoração do agente + sincronização meta):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-091](13-decision-log.md#dl-091))

## ✅ Bootstrap automático do kit observável no preset coordenado (2026-03-16 - concluído)
- **DL-088**: acoplamento do preset `Executar Frente Operacional Coordenada + QA/Docs` ao bootstrap automático de `handoff:front:prepare` no PRÉ-HANDOFF do `executor-handoffs`.
- **Handoff 1/1 (Acoplamento do preset + executor + guia operacional):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-088](13-decision-log.md#dl-088))

## ✅ Kit observável para frente operacional coordenada (2026-03-16 - concluído)
- **DL-087**: criação do kit observável da frente operacional coordenada com scripts `handoff:front:*`, board em Markdown, briefings por especialista e prompt dedicado para abertura da execução.
- **Handoff 1/1 (Scripts + prompt + documentação operacional):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-087](13-decision-log.md#dl-087))

## ✅ Preset operacional coordenado no orquestrador (2026-03-16 - concluído)
- **DL-086**: criação do preset `Executar Frente Operacional Coordenada + QA/Docs` no `orquestrador-mtr`, com frente coordenada por independência de arquivos e fechamento serial em QA/documentação.
- **Handoff 1/1 (Preset no orquestrador + alinhamento do executor + sincronização documental):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-086](13-decision-log.md#dl-086))

## ✅ Reauditoria de consistência estrutural `.github/` (2026-03-16 - concluído)
- **DL-084**: auditoria incremental de consistência entre `.github/agents`, `.github/prompts`, `.github/skills`, `.github/instructions`, `.github/workflows` e `docs/copilot/14-estrutura-copilot.md`.
- **Handoff 1/1 (Auditoria + correções de sincronização):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-084](13-decision-log.md#dl-084))

## ✅ Auditoria de redundâncias entre agentes por entregáveis/telas (2026-03-16 - concluído)
- **DL-085**: revisão de sobreposição entre especialistas de frontend/tela/módulo com refinamento de fronteiras de responsabilidade.
- **Handoff 1/1 (Matriz anti-sobreposição + ajustes de escopo):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-085](13-decision-log.md#dl-085))

## ✅ Especialista de estrutura `.vscode` (2026-03-15 - concluído)
- **DL-083**: criação do agente `estrutura-vscode-mtr` para evolução dedicada da pasta `.vscode` (tasks, launch, settings, extensions) com integração no orquestrador e prompts operacionais.
- **Handoff 1/2 (Agente + prompt + roteamento + docs):** ✅ COMPLETADO
- **Handoff 2/2 (Evolução integrada de tasks/debug/settings/extensions):** ✅ COMPLETADO
- **Guia operacional:** `docs/copilot/handoffs/DL-083/execution/GUIA-OPERACIONAL-VSCODE.md`
- **Status**: ✅ COMPLETADO ([DL-083](13-decision-log.md#dl-083))

## ✅ Backlog executável da Fase 1 (Perfis e Acessos) (2026-03-15 - concluído)
- **DL-082**: backlog executável consolidado para Fase 1 do módulo de Perfis e Acessos, cobrindo migrations, OpenAPI, endpoints admin mínimos e layout inicial da nova tela.
- **Handoff 1/1 (Planejamento executável + consolidação documental):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-082](13-decision-log.md#dl-082))

## ✅ Criação do especialista de Perfis e Acessos (2026-03-15 - concluído)
- **DL-081**: criação do agente `perfis-acessos-admin-mtr`, com prompt dedicado e plano técnico do módulo administrativo de perfis/acessos (RBAC/ABAC) integrado ao sistema.
- **Handoff 1/1 (Agente + prompt + plano + sincronização):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-081](13-decision-log.md#dl-081))

## ✅ Evolução do especialista `jobs-monitoramento-logs-mtr` para operação administrativa global (2026-03-15 - concluído)
- **DL-080**: ampliação de escopo para monitoramento de todos os usuários/sessões (ativos/inativos), auditoria por usuário/sessão e manutenção administrativa (derrubar/atualizar sessão, expirar/resetar senha), mantendo cobertura de Jobs/Logs.
- **Handoff 1/1 (Atualização de contexto + sincronização documental):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-080](13-decision-log.md#dl-080))

## ✅ Auditoria e evolução estrutural `.github/` (2026-03-15 - concluído)
- **DL-077**: auditoria completa de agents/prompts/skills/instructions com correção de 9 gaps: indentação YAML do orquestrador, 3 prompts de tela criados, instructions atualizada, diagrama de 15 agents, métricas corrigidas, duplicata removida.
- **Handoff 1/1 (Auditoria + Correções):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-077](13-decision-log.md#dl-077))

## ✅ Especialização de agentes por tela operacional (2026-03-14 - concluído)
- **DL-076**: criação de três novos especialistas para evolução de telas críticas (`Jobs/Logs`, `Sessão/Conta`, `Manifestos`) com integração no orquestrador.
- **Handoff 1/3 (Criação dos agentes):** ✅ COMPLETADO
- **Handoff 2/3 (Integração no orquestrador):** ✅ COMPLETADO
- **Handoff 3/3 (Sincronização documental):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-076](13-decision-log.md#dl-076))

## ✅ Busca CETESB por range com fallback diário parcial (2026-03-14 - concluído)
- **DL-075**: pesquisa de manifestos por período evoluída para execução dia a dia, preservando dias válidos quando a CETESB falha em datas específicas.
- **Handoff 1/3 (Gateway progressivo por dia):** ✅ COMPLETADO
- **Handoff 2/3 (Teste unitário de range parcial):** ✅ COMPLETADO
- **Handoff 3/3 (Consolidação documental):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-075](13-decision-log.md#dl-075))

## ✅ Topbar fixa + sidebar persistente + scroll no conteúdo (2026-03-14 - concluído)
- **DL-074**: ajuste do shell para manter navegação estrutural sempre visível e rolagem isolada no conteúdo principal.
- **Handoff 1/2 (Layout sticky shell):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-074](13-decision-log.md#dl-074))

## ✅ Evolução frontend: UX responsiva + API resiliente (2026-03-14 - concluído)
- **DL-073**: melhoria de usabilidade/navegação no shell, reforço de acessibilidade e hardening do client HTTP com retry transitório.
- **Handoff 1/3 (API resiliente):** ✅ COMPLETADO
- **Handoff 2/3 (Navegação e layout):** ✅ COMPLETADO
- **Handoff 3/3 (UX do dashboard + validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-073](13-decision-log.md#dl-073))

## ✅ Agente especializado de dashboard/observabilidade (2026-03-14 - concluído)
- **DL-072**: criação de especialista dedicado `dashboard-observability-mtr` para evolução contínua da visão consolidada de métricas.
- **Handoff 1/3 (Agent + skill + prompt):** ✅ COMPLETADO
- **Handoff 2/3 (Integração no orquestrador):** ✅ COMPLETADO
- **Handoff 3/3 (Sincronização documental):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-072](13-decision-log.md#dl-072))

## ✅ Dashboard de observabilidade em 3 fases + endpoint consolidado (2026-03-14 - concluído)
- **DL-071**: evolução do dashboard operacional com cards de saúde da fila, tendência temporal (24h/7d), ranking de latência CETESB e payload consolidado em `GET /v1/dashboard/overview`.
- **Handoff 1/4 (Fase 1 - cards operacionais):** ✅ COMPLETADO
- **Handoff 2/4 (Fase 2 - timeline + latência CETESB):** ✅ COMPLETADO
- **Handoff 3/4 (Fase 3 - overview consolidado + snapshots):** ✅ COMPLETADO
- **Handoff 4/4 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-071](13-decision-log.md#dl-071))

## ✅ Shell com sidebar colapsável + dark mode + menu usuário/CETESB (2026-03-14 - concluído)
- **DL-070**: evolução do shell frontend com colapso da barra lateral em desktop, tema escuro/claro persistente e menu de usuário no topo direito com conta CETESB ativa.
- **Handoff 1/4 (Shell/layout):** ✅ COMPLETADO
- **Handoff 2/4 (Dark mode):** ✅ COMPLETADO
- **Handoff 3/4 (Menu usuário/CETESB):** ✅ COMPLETADO
- **Handoff 4/4 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-070](13-decision-log.md#dl-070))

## ✅ Remoção real de manifesto com falha (2026-03-14 - concluído)
- **DL-069**: correção do botão `Remover` em manifestos com falha, com endpoint backend dedicado e exclusão persistente.
- **Handoff 1/4 (Backend remoção):** ✅ COMPLETADO
- **Handoff 2/4 (Frontend ação Remover):** ✅ COMPLETADO
- **Handoff 3/4 (Contrato/examples):** ✅ COMPLETADO
- **Handoff 4/4 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-069](13-decision-log.md#dl-069))

## ✅ Remoção de conta CETESB e tipo sem fallback (2026-03-14 - concluído)
- **DL-068**: remoção operacional de conta ativa e eliminação de fallback forçado para `gerador` na definição de tipo.
- **Handoff 1/3 (Backend autenticação/contas):** ✅ COMPLETADO
- **Handoff 2/3 (Frontend seleção de conta):** ✅ COMPLETADO
- **Handoff 3/3 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-068](13-decision-log.md#dl-068))

## ✅ Correções de grid, contas CETESB e navegação de datas (2026-03-14 - concluído)
- **DL-067**: ajuste de overflow na grid de manifestos, evolução da tela de contas CETESB (tipo/último uso/remoção/atualização) e acoplamento de intervalo em `Data inicial`/`Data final`.
- **Handoff 1/4 (Manifestos UX):** ✅ COMPLETADO
- **Handoff 2/4 (Contas CETESB backend):** ✅ COMPLETADO
- **Handoff 3/4 (Contas CETESB frontend):** ✅ COMPLETADO
- **Handoff 4/4 (Contrato/Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-067](13-decision-log.md#dl-067))

## ✅ Correção de filtros e UX da listagem de manifestos (2026-03-14 - concluído)
- **DL-066**: correções de aplicação para filtros por `Número MTR`, `Transportador`, `Destinador`, remoção de `Impresso` no status e reorganização completa do layout dos filtros.
- **Handoff 1/3 (Backend filtros):** ✅ COMPLETADO
- **Handoff 2/3 (Frontend UX):** ✅ COMPLETADO
- **Handoff 3/3 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-066](13-decision-log.md#dl-066))

## ✅ Evolução dos filtros da listagem de manifestos (2026-03-14 - concluído)
- **DL-065**: melhoria de layout dos filtros + novos critérios por `Status`, `Número MTR`, `Transportador` e `Destinador`.
- **Handoff 1/4 (Backend filtros):** ✅ COMPLETADO
- **Handoff 2/4 (Frontend UX/estado):** ✅ COMPLETADO
- **Handoff 3/4 (Contrato/examples):** ✅ COMPLETADO
- **Handoff 4/4 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-065](13-decision-log.md#dl-065))

## ✅ Correções de filtros na listagem de manifestos (2026-03-14 - concluído)
- **DL-064**: ocultação de `Integration Account`, reset para data de hoje e persistência de filtros ao navegar detalhe/lista.
- **Handoff 1/2 (Frontend UX/Estado):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-064](13-decision-log.md#dl-064))

## ✅ Regras de ações por status de erro na listagem de manifestos (2026-03-14 - concluído)
- **DL-063**: `Reenviar` apenas em erro, ocultação de `Imprimir/Cancelar` em erro e inclusão de `Remover` nesses casos.
- **Handoff 1/2 (Frontend UX):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-063](13-decision-log.md#dl-063))

## ✅ Tratamento de execuções órfãs de manifesto (2026-03-14 - concluído)
- **DL-062**: reconciliação automática na listagem + ação de `Reenviar` para manifestos sem job gerenciável.
- **Handoff 1/3 (Backend reconciliação):** ✅ COMPLETADO
- **Handoff 2/3 (Frontend recuperação):** ✅ COMPLETADO
- **Handoff 3/3 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-062](13-decision-log.md#dl-062))

## ✅ Calendário e navegação por dia nos filtros de data da listagem (2026-03-14 - concluído)
- **DL-061**: campos `Data inicial` e `Data final` com calendário visual e botões de dia anterior/posterior.
- **Handoff 1/2 (Frontend UX):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-061](13-decision-log.md#dl-061))

## ✅ Nome final do PDF no padrão `mtr_<numeroMTR>` (2026-03-14 - concluído)
- **DL-060**: fix definitivo de nome de download para usar `manifestNumber` no formato `mtr_<numeroMTR>.pdf`.
- **Handoff 1/3 (Backend):** ✅ COMPLETADO
- **Handoff 2/3 (Frontend fallback):** ✅ COMPLETADO
- **Handoff 3/3 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-060](13-decision-log.md#dl-060))

## ✅ Nome do PDF com número do manifesto após integração (2026-03-14 - concluído)
- **DL-059**: ajuste do nome do arquivo de download para priorizar `manifestNumber` quando já resolvido.
- **Handoff 1/2 (Backend):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-059](13-decision-log.md#dl-059))

## ✅ Atualização automática pós-job na listagem de manifestos (2026-03-14 - concluído)
- **DL-058**: retorno da tela de detalhe dispara sincronização automática da listagem quando o job relacionado já finalizou.
- **Handoff 1/2 (Frontend UX/Comportamento):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-058](13-decision-log.md#dl-058))

## ✅ UX dinâmica em Participantes + Caracterização do resíduo (2026-03-14 - concluído)
- **DL-057**: simplificação de seleção no formulário de criação de manifesto com campo único pesquisável e filtro dinâmico.
- **Handoff 1/2 (Frontend UX):** ✅ COMPLETADO
- **Handoff 2/2 (Validação):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-057](13-decision-log.md#dl-057))

## ✅ Auditoria e evolução estrutural completa `.github` (2026-03-14 - concluído)
- **DL-056**: auditoria e evolução de agents, prompts, skills, instructions e workflows com validação automatizada.
- **Handoff 1/3 (Auditoria/Consistência):** ✅ COMPLETADO
- **Handoff 2/3 (Validação estrutural):** ✅ COMPLETADO
- **Handoff 3/3 (Workflows CI):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-056](13-decision-log.md#dl-056))

## ✅ Arquitetura de agentes com delegação em bolsões (2026-03-14 - concluído)
- **DL-055**: normalização de metadados dos agentes, correção de roteamento prompt→agent e modelo de execução síncrona/assíncrona por bolsões.
- **Handoff 1/3 (Arquitetura):** ✅ COMPLETADO
- **Handoff 2/3 (Orquestração/Paralelismo):** ✅ COMPLETADO
- **Handoff 3/3 (Validação automática):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-055](13-decision-log.md#dl-055))

## ✅ Validador estrutural HAR→Gateway (2026-03-14 - concluído)
- **DL-054**: validação estrutural entre evidência HAR (`docs/cetesb`) e implementação do gateway CETESB.
- **Handoff 1/3 (Backend):** ✅ COMPLETADO
- **Handoff 2/3 (QA):** ✅ COMPLETADO
- **Handoff 3/3 (Consolidação/Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-054](13-decision-log.md#dl-054))

## ✅ Hardening de consistência transacional da fila (2026-03-14 - concluído)
- **DL-053**: enqueue atômico manifesto↔job, deduplicação de jobs ativos e transições ownership-safe no worker.
- **Handoff 1/3 (Persistência/Fila):** ✅ COMPLETADO
- **Handoff 2/3 (Worker):** ✅ COMPLETADO
- **Handoff 3/3 (Validação/Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-053](13-decision-log.md#dl-053))

## ✅ Correção de sincronização terminal job → manifesto (2026-03-13 - concluído)
- **DL-052**: manifesto deve refletir falha terminal (failed/dlq/job órfão) e não permanecer eternamente em envio.
- **Handoff 1/3 (Backend/Worker):** ✅ COMPLETADO
- **Handoff 2/3 (Validação):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-052](13-decision-log.md#dl-052))

## ✅ Binding assíncrono jobs → manifesto sem polling (2026-03-13 - concluído)
- **DL-051**: stream NDJSON de eventos de job + frontend reativo sem timer de polling na tela de detalhe.
- **Handoff 1/5 (Backend/Queue):** ✅ COMPLETADO
- **Handoff 2/5 (Frontend):** ✅ COMPLETADO
- **Handoff 3/5 (Contrato):** ✅ COMPLETADO
- **Handoff 4/5 (Validação):** ✅ COMPLETADO
- **Handoff 5/5 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-051](13-decision-log.md#dl-051))

## ✅ Correção de status prematuro e ressincronização de manifestos (2026-03-13 - concluído)
- **DL-050**: manifesto sem referência CETESB não aparece como sucesso; ressync resiliente em 5xx; filtros sem travar no dia atual.
- **Handoff 1/4 (Backend):** ✅ COMPLETADO
- **Handoff 2/4 (Frontend):** ✅ COMPLETADO
- **Handoff 3/4 (Validação):** ✅ COMPLETADO
- **Handoff 4/4 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-050](13-decision-log.md#dl-050))

## ✅ Troca de conta CETESB sem logout SICAT (2026-03-13 - concluído)
- **DL-049**: nova ação para voltar à seleção de contas CETESB sem encerrar sessão SICAT.
- **Handoff 1/3 (Frontend):** ✅ COMPLETADO
- **Handoff 2/3 (Validação):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-049](13-decision-log.md#dl-049))

## ✅ Degradação graciosa em erro 5xx CETESB na listagem (2026-03-13 - concluído)
- **DL-048**: `/v1/manifestos` passa a retornar estado local quando a CETESB falha com 5xx (sem `forceSync`).
- **Handoff 1/3 (Backend):** ✅ COMPLETADO
- **Handoff 2/3 (Testes):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-048](13-decision-log.md#dl-048))

## ✅ Correção de persistência do erro 500 CETESB com conta já salva (2026-03-13 - concluído)
- **DL-047**: Fallback `kind=all -> kind=0` estendido para `lookupManifestByHash`.
- **Handoff 1/3 (Backend):** ✅ COMPLETADO
- **Handoff 2/3 (Testes):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-047](13-decision-log.md#dl-047))

## ✅ Fallback para erro 500 no pesquisaManifesto CETESB (2026-03-13 - concluído)
- **DL-046**: Implementado fallback automático de `kind=all` para `kind=0` na busca de manifestos CETESB.
- **Handoff 1/3 (Backend):** ✅ COMPLETADO
- **Handoff 2/3 (Testes):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-046](13-decision-log.md#dl-046))

## ✅ Correção de auto preenchimento do Código parceiro CETESB (2026-03-13 - concluído)
- **DL-045**: Restabelecido lookup de `partnerCode` por CNPJ/CPF na tela `Selecionar Conta CETESB`.
- **Handoff 1/3 (Frontend):** ✅ COMPLETADO
- **Handoff 2/3 (Testes):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-045](13-decision-log.md#dl-045))

## ✅ Seleção CETESB com layout de login anterior (2026-03-13 - concluído)
- **DL-044**: Tela da etapa CETESB redesenhada para o padrão de login anterior, com escolha de conta salva ou login com conta nova.
- **Handoff 1/3 (Frontend):** ✅ COMPLETADO
- **Handoff 2/3 (Testes):** ✅ COMPLETADO
- **Handoff 3/3 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-044](13-decision-log.md#dl-044))

## ✅ Auto cadastro de usuário no login SICAT (2026-03-13 - concluído)
- **DL-043**: Cadastro de novo usuário diretamente na tela de login SICAT com autenticação imediata.
- **Handoff 1/5 (Contrato):** ✅ COMPLETADO
- **Handoff 2/5 (Backend):** ✅ COMPLETADO
- **Handoff 3/5 (Frontend):** ✅ COMPLETADO
- **Handoff 4/5 (Testes):** ✅ COMPLETADO
- **Handoff 5/5 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-043](13-decision-log.md#dl-043))

## ✅ Dupla camada de login SICAT + contas CETESB (2026-03-13 - concluído)
- **DL-042**: Separação entre login interno SICAT e autenticação operacional CETESB com seleção de múltiplas contas por usuário.
- **Handoff 1/6 (Contrato):** ✅ COMPLETADO
- **Handoff 2/6 (Banco):** ✅ COMPLETADO
- **Handoff 3/6 (Backend):** ✅ COMPLETADO
- **Handoff 4/6 (Frontend):** ✅ COMPLETADO
- **Handoff 5/6 (Testes):** ✅ COMPLETADO
- **Handoff 6/6 (Docs):** ✅ COMPLETADO
- **Status**: ✅ COMPLETADO ([DL-042](13-decision-log.md#dl-042))

## ✅ Refatoração do frontend para layout Stitch (2026-03-12 - concluído)
- **DL-038**: Migração do frontend atual para o design gerado no `frontend/stitch`.
- **Entregas**:
    - shell autenticado novo em `frontend/src/App.vue`
    - rotas novas em `frontend/src/router.js`
    - views dedicadas por tela Stitch em `frontend/src/views/*`
    - helper de jobs em `frontend/src/services/api.js`
    - expansão de estilos globais `sicat-*` em `frontend/src/styles/base.css`
- **Validação**:
    - `cd frontend && npm run build` ✅
- **Status**: ✅ COMPLETADO ([DL-038](13-decision-log.md#dl-038))

## ✅ Fluxo frontend de criação MTR com APIs auxiliares (2026-03-10 - concluído)
- **DL-036**: Implementação do fluxo de criação/submissão de manifesto no frontend, alinhado à sequência HAR `gerar_mtr`
- **Entregas**:
    - novo componente `frontend/src/components/ManifestCreateForm.vue`
    - extensão do client API com `getCatalog`, `searchPartners`, `createManifest`, `submitManifest`
    - integração no `ManifestsView` com refresh e seleção automática após criação
- **Aderência CETESB (HAR)**:
    - sequência funcional mapeada: catálogos → parceiros → persistência de manifesto
    - aplicação da sequência via endpoints internos `/v1/catalogs`, `/v1/partners/search`, `/v1/manifestos`, `/v1/manifestos/{id}/submit`
- **Validações**:
    - `cd frontend && npm run build` ✅
    - checagem de erros dos arquivos alterados ✅
- **Status**: ✅ COMPLETADO ([DL-036](13-decision-log.md#dl-036))

## ✅ Frontend login alinhado ao payload real CETESB (2026-03-10 - concluído)
- **DL-035**: Ajuste do frontend para contexto real de autenticação baseado em evidência HAR
- **Entregas**:
    - `auth store` envia `email/parCodigo` e aliases HAR (`login/senha/recaptcha`)
    - tela de login com campos opcionais de `email` e `código do parceiro`
    - variáveis opcionais de ambiente: `VITE_LOGIN_EMAIL`, `VITE_LOGIN_PARTNER_CODE`
- **Validação E2E**:
    - Playwright MCP: login com credenciais reais levou para `/`, com token persistido
    - rede: `POST /v1/auth/login` retornando `200`
- **Status**: ✅ COMPLETADO ([DL-035](13-decision-log.md#dl-035))

## ✅ Login real com payload HAR CETESB (2026-03-10 - concluído)
- **DL-034**: Compatibilidade de autenticação com payload capturado nos HARs CETESB
- **Entregas**:
    - `auth-service` aceitando aliases `login/senha/recaptcha` além de `document/password/recaptchaToken`
    - Validação `HAR -> endpoint interno` com `POST /v1/auth/login` retornando `200`
    - Consolidação de handoff em `docs/copilot/handoffs/DL-034/`
- **Validações**:
    - `npm run validate:cetesb-source` ✅
    - Teste direto com payload bruto do HAR em `/v1/auth/login` ✅
    - `npm run test -- --runInBand` ⚠️ falhas pré-existentes fora do escopo da alteração
- **Status**: ✅ COMPLETADO ([DL-034](13-decision-log.md#dl-034))

## ✅ Autenticação End-to-End (Login + Token + Guards) (2026-03-09 - concluído)
- **DL-033**: Implementação completa de autenticação
- **Entregas**:
    - Frontend: LoginView, auth store (Pinia), router guards, Authorization header automático, AppHeader com logout
    - Testes: 15 integração + 9 contrato + 6 smoke + 81 checks manuais UI
    - Documentação: ENTREGA-AUTENTICACAO.md, relatórios de testes
- **Validações**: 100% testes passing, build frontend OK, OpenAPI OK
- **Trade-offs**: token em localStorage (vulnerável XSS, mitigado por CSP), logout não sincroniza entre abas, mock não valida credenciais reais
- **Próximos passos**: testes modo real, sincronização entre abas, rotação de token, CSP produção
- Status: ✅ COMPLETADO ([DL-033](13-decision-log.md#dl-033))

## ✅ Ecossistema de agente frontend Vue/UX (2026-03-09 - concluído)
- **DL-032**: Expansão da orquestração Copilot para frontend
- **Entregas**:
    - Novo agente: `frontend-vue-ux-mtr`
    - Novos prompts: `arquitetar-frontend-vue`, `auditar-ux-css`
    - Nova skill: `frontend-vue-ux-orchestration`
    - Nova instruction: `frontend-vue.instructions.md`
    - Orquestrador atualizado com handoff frontend
- **Objetivo**: habilitar criação de frontend Vue.js com CSS avançado, layout responsivo, usabilidade e navegação em sinergia com backend
- **Status**: ✅ COMPLETADO ([DL-032](13-decision-log.md#dl-032))

## ✅ Testes OpenAPI completos + servers otimizado (2026-03-09 - concluído)
- **DL-031**: Validação abrangente de endpoints e saneamento de contrato
- **Resultado de testes**: 30 operações mapeadas, 14/14 testáveis aprovadas (100%), 16 com pré-condições reais marcadas como skip
- **Correções**:
    - Alinhamento de paths de observabilidade no OpenAPI para prefixo `/v1/*`
    - Validação obrigatória em runtime para `GET /v1/partners/search` (`integrationAccountId`, `role`)
    - Validação obrigatória em runtime para `GET /v1/manifestos` (`integrationAccountId`)
- **Servers OpenAPI**:
    - Mantido somente `http://localhost:8080` (funcional e padrão Swagger)
    - Removidos `http://127.0.0.1:8080` (redundante) e `https://mtr-automation.internal` (não resolvível localmente)
- **Validações**:
    - `npm run validate:openapi` ✅
    - `npm run gen:operations` ✅ (25 operações)
    - `node tests/manual/test-all-endpoints-openapi.js` ✅ (14/14 testáveis)
- **Documentação**: `docs/copilot/handoffs/DL-031/`
- Status: ✅ COMPLETADO - contrato e implementação alinhados ([DL-031](13-decision-log.md#dl-031))

## ✅ recaptchaToken opcional na API de autenticação (2026-03-09 - concluído)
- **DL-030**: Handoff multi-camada (contrato + gateway + validators + docs + examples)
- **Descoberta**: Frontend gera recaptcha mas CETESB não valida via API backend
- **HANDOFFs**:
    - Contrato OpenAPI: recaptchaToken removido de required, descrição atualizada
    - Gateway CETESB: comentários explicativos, validação de aceitação vazio/ausente
    - Validators: análise completa (nenhum força obrigatório), comentários adicionados
    - Documentação: README, copilot-instructions, 07-integracao-cetesb, TESTING
    - Examples: recaptcha vazio, README.md explicativo
- **Validações**:
    - OpenAPI: ✅ 188 arquivos, 0 problemas
    - Testes manuais: ✅ recaptcha vazio/ausente aceitos (2/2)
    - CETESB source-of-truth: ✅ HAR validado
    - Breaking changes: ✅ Nenhum
- **Impacto**: Zero breaking changes (recaptcha sempre foi opcional no código, apenas documentação inconsistente)
- **Documentação**: `docs/copilot/handoffs/DL-030/`
- Status: ✅ COMPLETADO - recaptchaToken documentado como opcional em toda codebase ([DL-030](13-decision-log.md#dl-030))

## ✅ Modo real como padrão do sistema (2026-03-09 - concluído)
- **DL-029**: Handoff de configuração e validação
- **Escopo**:
    - Alterar default de `CETESB_GATEWAY_MODE` de 'mock' para 'real'
    - Preservar modo mock opcional via env var
    - Validar ambos os modos funcionam corretamente
    - Atualizar documentação (README + decision-log)
- **HANDOFFs**:
    - Configuração: `src/lib/config.js` (default → 'real')
    - Testes: Validação de ambos os modos
    - Documentação: README.md + decision-log
- **Validações**:
    - Config test (default): ✅ Retorna 'real'
    - Config test (mock): ✅ Retorna 'mock' com env var
    - OpenAPI validation: ✅ PASSOU (182 arquivos, 0 problemas)
- **Impacto**: Zero breaking changes (env var sobrescreve default)
- **Documentação**: `docs/copilot/handoffs/DL-029/`
- Status: ✅ COMPLETADO - Sistema opera em modo real por padrão, mock disponível via `CETESB_GATEWAY_MODE=mock` ([DL-029](13-decision-log.md#dl-029))

## ✅ E2E com stack real (2026-03-09 - concluído)
- **DL-028**: Execução do próximo item do roadmap (curto prazo)
- **Escopo**:
    - Stack real (API + worker + Postgres)
    - Execução de `tests/smoke/manifest-real-integration.test.js`
    - Estabilização de bloqueios reais (TLS externo + listagem CETESB 404 + job legado inconsistente)
- **Resultado**:
    - E2E real final: **5/5 passing**
    - Worker destravado sem erro fatal de constraint
    - Teste de listagem real com fallback resiliente
- **Documentação**: `docs/copilot/handoffs/DL-028/`
- Status: ✅ COMPLETADO - validação real do roadmap concluída ([DL-028](13-decision-log.md#dl-028))

## ✅ Reorganização da estrutura de arquivos (2026-03-09 - concluído)
- **DL-021**: Limpeza organizacional do projeto
- **Mudanças**:
  - 16 arquivos de teste ad-hoc → `tests/manual/`
  - 8 documentos → `docs/`
  - 4 artefatos de handoff → `docs/handoffs/`
  - 4 scripts shell/PowerShell → `scripts/`
  - 4 arquivos temporários/JSONs → `storage/temp/`
  - `.gitignore` atualizado para proteção de dados sensíveis
- **Benefícios**: Raiz limpa, estrutura profissional, segurança aprimorada
- **Documentação**: `ESTRUTURA-REORGANIZADA.md` (guia completo)
- Status: ✅ COMPLETADO - 32 arquivos reorganizados

## ✅ Evolução de persistência e observabilidade (2026-03-09 - concluído)
- **DL-022**: Infraestrutura de health monitoring e consistência
- **Migration 004**: `advanced_locking_consistency.sql` (350 linhas)
- **Componentes**:
  - Locking otimista: campo `version` na tabela `jobs` + trigger `trg_jobs_version_increment`
  - 5 constraints de consistência: `chk_job_submitted_no_external_id`, `chk_job_finished_has_external_id`, `chk_job_running_claimed`, `chk_job_retry_wait_has_next_attempt_at`, `chk_job_attempts_in_range`
  - Tabelas de observabilidade: `worker_health` (heartbeat + stats), `system_events` (audit), `performance_snapshots` (métricas)
  - Funções SQL: `cleanup_old_jobs()`, `detect_unhealthy_workers()`, `calculate_job_performance_metrics()`
  - Views: `v_active_jobs`, `v_system_health`
- **Repositórios**:
  - `health-repo.js`: 10+ funções de observabilidade
  - `job-repo.js`: `updateJobWithOptimisticLock()` para prevenção de lost updates
- **Worker**: Auto-registration, heartbeat (30s), stats tracking, graceful shutdown
- **API**: 7 endpoints REST sob `/health/*` (system, workers, jobs/active, jobs/dlq, metrics/performance, maintenance/cleanup, ping)
- **Benefícios**: Prevenção de race conditions, detecção de workers órfãos, métricas de performance, manutenção automatizada
- **Documentação**: `docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md` (450 linhas)
- Status: ✅ COMPLETADO - Infraestrutura de observabilidade operacional

## ✅ Health Endpoints para Observabilidade (2026-03-09 - concluído)
- **DL-027**: Feature multi-camada - 7 health endpoints REST
- **HANDOFFs**: 6 etapas (Contrato → Validação → Gateway → Banco → Testes → Docs)
- **Endpoints**:
  - `GET /v1/ping` - liveness probe
  - `GET /v1/health/system` - system health overview
  - `GET /v1/health/workers` - worker status
  - `GET /v1/health/jobs/active` - active jobs summary
  - `GET /v1/health/jobs/dlq` - dead letter queue stats
  - `GET /v1/health/metrics/performance` - performance metrics
  - `POST /v1/maintenance/cleanup` - trigger cleanup async
- **Validações**:
  - npm run validate:openapi PASSED (25 operações)
  - npm run validate:cetesb-source PASSED (zero divergências)
  - npm run smoke:health PASSED (7/7 endpoints)
  - npm run test:integration PASSED (35/35 testes)
- **Impacto**: Zero breaking changes, 100% backward compatible
- **Documentação**: `docs/copilot/handoffs/DL-027/` (4 arquivos)
- Status: ✅ COMPLETADO - Health endpoints implementados, testados e documentados ([DL-027](13-decision-log.md#dl-027))

## ✅ Correção de fluxo de cancelamento MTR (2026-03-09 - concluído)
- Handoff 1/4: validação de worker submit (postgres-queue-mtr)
    - Status: ✅ COMPLETADO - Worker correto, CETESB limita response
- Handoff 2/4: validação de gateway cancel com lookup (integrador-cetesb-mtr)
    - Status: ✅ COMPLETADO - Gateway já implementado (DL-019)
- Handoff 3/4: batch cleanup de manifestos travados (postgres-queue-mtr)
    - Status: ✅ COMPLETADO - 19 manifestos requeued, 1 erro
- Handoff 4/4: teste E2E cancelamento (tester-qa-mtr)
    - Status: ✅ COMPLETADO - Bloqueio resolvido (data range CETESB)
- Resolução de bloqueio: lookup CETESB 404
    - Status: ✅ COMPLETADO - Correção de data range (daysBack=7, status=0)
- Consolidação: validações + documentação final (executor-handoffs)
    - Status: ✅ COMPLETADO - 6 arquivos em `handoffs/DL-020/`

## ✅ Validação e teste de cancelamento MTR (2026-03-09 - concluído)
- Handoff 1/4: validação de contrato e fluxo (programador-backend-mtr)
    - Status: ✅ COMPLETADO
- Handoff 2/4: validação de gateway CETESB (integrador-cetesb-mtr)
    - Status: ✅ COMPLETADO
- Handoff 3/4: validação de worker e job processing (postgres-queue-mtr)
    - Status: ✅ COMPLETADO
- Handoff 4/4: teste E2E de cancelamento (tester-qa-mtr)
    - Status: ✅ COMPLETADO
- Consolidação: validações + documentação final (executor-handoffs)
    - Status: ✅ COMPLETADO

## ✅ Correção payload de resíduos por catálogos CETESB (2026-03-09 - concluído)
- Handoff 1/5: validação HAR x payload de submit
    - Status: ✅ COMPLETADO
- Handoff 2/5: enrichment de resíduos no gateway
    - Status: ✅ COMPLETADO
- Handoff 3/5: ajuste e execução de teste real
    - Status: ✅ COMPLETADO
- Handoff 4/5: documentação técnica e decisão final
    - Status: ✅ COMPLETADO
- Handoff 5/5: consolidação e artefatos DL-018
    - Status: ✅ COMPLETADO

## ✅ Evolução integração CETESB e fila transacional (2026-03-09 - concluído)
- Handoff 1/6: CETESB sessão/token/payloads/catálogos
    - Status: ✅ COMPLETADO
- Handoff 2/6: persistência/fila/locking/retries/worker
    - Status: ✅ COMPLETADO
- Handoff 3/6: auditoria HAR x implementação/contrato/examples/validadores
    - Status: ✅ COMPLETADO
- Handoff 4/6: testes/smoke/contrato
    - Status: ✅ COMPLETADO
- Handoff 5/6: documentação técnica/roadmap/decision-log
    - Status: ✅ COMPLETADO
- Handoff 6/6: consolidação e artefatos DL-017
    - Status: ✅ COMPLETADO

## Documentação Copilot

Fonte de evidência raiz para integração CETESB: `docs/cetesb/`.

├── 00-onboarding.md                         # Ponto de entrada para novos desenvolvedores
├── 01-visao-geral.md                        # Contexto do projeto MTR CETESB
├── 02-arquitetura.md                        # Estrutura técnica e decisões
├── 03-mapa-de-codigo.md                     # Localização de componentes
├── 04-fluxos-operacionais.md                # Sequências de execução
├── 05-modelo-de-dados.md                    # Schema e relacionamentos
├── 06-contrato-openapi.md                   # API interna e exemplos
├── 07-integracao-cetesb.md                  # Gateway externo e peculiaridades
├── 08-riscos-e-lacunas.md                   # Limitações conhecidas
├── 09-roadmap.md                            # Planejamento de evolução
├── 10-backlog-executavel.md                 # Itens prioritários (✅ testes implementados)
├── 11-checklist-qa.md                       # Validações de qualidade (✅ atualizado)
├── 12-comandos-uteis.md                     # Comandos operacionais
├── 13-decision-log.md                       # Registro de decisões técnicas (✅ DL-013 adicionado)
├── 14-estrutura-copilot.md                  # Este arquivo
├── 15-testes-automatizados.md               # Suíte de testes e guia (✅ NOVO)
├── validacao-sequencia-mtr.md               # Validação do HAR real (✅ NOVO - 2026-03-08)
├── IMPLEMENTACAO-VALIDACAO-MTR.md           # Resumo técnico da implementação (✅ NOVO)
├── RESUMO-IMPLEMENTACAO-CONSOLIDADA.md      # Resumo executivo (✅ NOVO)
├── IMPLEMENTACAO-QUEUE-IMPROVEMENTS.md      # Retry/DLQ/locking/persistência (✅ NOVO)
└── README.md                                # Índice da documentação
```

## Evidências CETESB (fonte original)

```
docs/cetesb/
├── mtr.cetesb.sp.gov.br_login.har
├── mtr.cetesb.sp.gov.br_gerar_mtr.har
├── mtr.cetesb.sp.gov.br_imprimir_mtr.har
├── mtr.cetesb.sp.gov.br_cancelar_mtr.har
└── mtr.cetesb.sp.gov.br_criar_cadastro.har
```

## ✅ Validação Estrutural DL-084 (2026-03-16)

**Auditoria incremental executada por `meta-evolution-copilot`:**
- ✅ Sincronização 100% entre `.github/` e documentação
- ✅ 17 agentes especializados validados e funcionais (atualizado DL-084)
- ✅ 24 prompts operacionais compatíveis com VS Code (atualizado DL-087)
- ✅ 12 skills padronizadas (estrutura `dominio/SKILL.md`)
- ✅ 11 instructions aplicáveis via globs (instructions atualizada DL-077)
- ✅ 2 workflows CI/CD estáveis
- ✅ Matriz de escalonamento consistente (15 regras — atualizado DL-084)
- ✅ 0 referências quebradas, 0 duplicidades, 0 gaps

**Métricas de Qualidade:**
- Prompts executáveis: 24/24 (100%)
- Skills referenciadas: 12/12 (100%)
- Agentes funcionais: 17/17 (100%)
- Compatibilidade VS Code: 100%

Veja `13-decision-log.md` (DL-084) para detalhes completos da reauditoria incremental.

📌 **Nota de baseline:** seções antigas com contagens (ex.: DL-055/DL-056) representam o estado histórico da data de cada entrega. O baseline vigente é o bloco de validação estrutural mais recente (DL-084+).

### Matriz de fronteiras por tela/módulo (DL-085)
- `frontend-vue-ux-mtr`: camada transversal de frontend (shell/layout/tokens/acessibilidade/componentes base).
- `sessao-conta-mtr`: tela de sessão/conta do usuário atual (self-service operacional).
- `jobs-monitoramento-logs-mtr`: operação administrativa global de usuários/sessões e monitoramento de jobs/logs.
- `perfis-acessos-admin-mtr`: governança de autorização (RBAC/ABAC, papéis/permissões/políticas e trilha administrativa).
- `manifestos-operacional-mtr`: domínio funcional de manifestos (lista/detalhe/criação/ações).
- `dashboard-observability-mtr`: domínio funcional de observabilidade/dashboard consolidado.

### Tabela de roteamento rápido (uso diário)

| Demanda | Agente primário | Agentes de apoio (quando necessário) |
|---|---|---|
| Shell/layout global, tokens, acessibilidade transversal | `frontend-vue-ux-mtr` | `tester-qa-mtr`, `documentador-mtr` |
| Sessão e conta CETESB do usuário atual (`SessionAccount`, troca de conta, expiração) | `sessao-conta-mtr` | `integrador-cetesb-mtr`, `programador-backend-mtr`, `tester-qa-mtr` |
| Monitoramento global de jobs/logs e operação admin de usuários/sessões | `jobs-monitoramento-logs-mtr` | `postgres-queue-mtr`, `integrador-cetesb-mtr`, `tester-qa-mtr` |
| Governança de acesso (RBAC/ABAC, papéis, permissões, políticas) | `perfis-acessos-admin-mtr` | `programador-backend-mtr`, `postgres-queue-mtr`, `tester-qa-mtr` |
| Fluxos de manifestos (listagem, detalhe, criação, envio, impressão, cancelamento) | `manifestos-operacional-mtr` | `integrador-cetesb-mtr`, `postgres-queue-mtr`, `tester-qa-mtr` |
| Navegação externa auditável com Playwright (CETESB/SIGOR, CAPTCHA assistido, payload audit, espera por desbloqueio humano) | `auditor-navegacao-externa-mtr` | `integrador-cetesb-mtr`, `tester-qa-mtr` |
| Dashboard/observabilidade (overview, timeline, latência, snapshots) | `dashboard-observability-mtr` | `programador-backend-mtr`, `postgres-queue-mtr`, `tester-qa-mtr` |
| Estrutura de workspace VS Code (`.vscode`) | `estrutura-vscode-mtr` | `ci-cd-github-mtr`, `documentador-mtr` |
| Mudança ampla multi-camada sem dono evidente | `orquestrador-mtr` | Delega sequencialmente para especialistas conforme impacto |

---

## Estrutura de orquestração (✅ VALIDADO - 2026-03-16)

### Agentes especializados
```
.github/agents/
├── orquestrador-mtr.agent.md                # Agente principal (escalonamento automático + preset operacional coordenado DL-086)
├── programador-backend-mtr.agent.md         # Backend Node.js (rotas, services, repos)
├── integrador-cetesb-mtr.agent.md           # Integração CETESB real (gateway, session)
├── postgres-queue-mtr.agent.md              # Banco/migrations/fila/worker
├── tester-qa-mtr.agent.md                   # Testes/smoke/contrato
├── frontend-vue-ux-mtr.agent.md             # ✅ NOVO (2026-03-09) - Frontend Vue.js, CSS avançado, layout e usabilidade
├── auditor-navegacao-externa-mtr.agent.md   # ✅ NOVO (2026-04-19) - Navegação externa auditável com Playwright, checkpoints humanos e retomada da mesma fase
├── dashboard-observability-mtr.agent.md     # ✅ NOVO (2026-03-14) - Dashboard operacional com métricas consolidadas
├── jobs-monitoramento-logs-mtr.agent.md     # ✅ ATUALIZADO (2026-03-15) - Operação admin global (usuários/sessões) + Jobs/Logs
├── sessao-conta-mtr.agent.md                # ✅ NOVO (2026-03-14) - Tela de Sessão e Conta CETESB
├── manifestos-operacional-mtr.agent.md      # ✅ NOVO (2026-03-14) - Tela de Manifestos (lista/detalhe/criação/ações)
├── perfis-acessos-admin-mtr.agent.md        # ✅ NOVO (2026-03-15) - Módulo administrativo de Perfis e Acessos (RBAC/ABAC)
├── estrutura-vscode-mtr.agent.md            # ✅ NOVO (2026-03-15) - Estrutura da pasta .vscode (tasks/debug/settings)
├── validador-cetesb-mtr.agent.md            # ✅ NOVO (2026-03-08) - Auditoria de coerência com docs/cetesb/
├── executor-handoffs.agent.md               # ✅ NOVO (2026-03-08) - Orquestração automática de handoffs multi-camada + preset operacional coordenado DL-086
├── ci-cd-github-mtr.agent.md                # ✅ NOVO (2026-03-09) - Orquestração de CI/CD via GitHub Actions
├── documentador-mtr.agent.md                # Documentação/decision-log/roadmap
└── meta-evolution-copilot.agent.md          # Evolução da estrutura Copilot
```

### Prompts operacionais
```
.github/prompts/
├── escalar-demanda-completa.prompt.md       # Master orchestration (6 passos)
├── arquitetar-frontend-vue.prompt.md        # ✅ NOVO (2026-03-09) - Frontend Vue integrado ao backend
├── auditar-ux-css.prompt.md                 # ✅ NOVO (2026-03-09) - Auditoria UX/CSS/responsividade
├── handoff.prompt.md                        # ✅ ATUALIZADO (2026-03-08) - Planejamento flexível (2-N HANDOFFs)
├── handoff-execute.prompt.md                # ✅ ATUALIZADO (2026-03-08) - Executar handoffs adaptativos
├── handoff-plan.prompt.md                   # ✅ NOVO (2026-03-08) - Planejar decomposição de feature (avançado)
├── handoff-track.prompt.md                  # ✅ NOVO (2026-03-08) - Acompanhar progresso de handoff (avançado)
├── implementar-proximo-passo.prompt.md      # Backlog incremental
├── criar-ou-ajustar-testes.prompt.md        # QA especializado
├── revisar-contrato-openapi.prompt.md       # Contract-first flow
├── validar-fluxo-cetesb.prompt.md           # Integração real
├── auditar-navegacao-cetesb-playwright.prompt.md  # ✅ NOVO (2026-04-19) - Navegação externa com Playwright, CAPTCHA assistido, espera por desbloqueio e gates de mutação
├── iniciar-frente-operacional-coordenada.prompt.md  # ✅ NOVO (2026-03-16) - Kit observável para frente operacional coordenada
├── auditar-coerencia-cetesb.prompt.md       # ✅ NOVO (2026-03-08) - Validação contra HARs reais
├── validar-ci-cd.prompt.md                  # ✅ NOVO (2026-03-09) - Validar mudanças localmente (simular CI)
├── desenvolver-feature-completa.prompt.md   # Feature end-to-end
├── resolver-bug-critico.prompt.md           # Bug em produção
├── hardening-producao.prompt.md             # Resiliência e observabilidade
├── frontend-feature-end-to-end.prompt.md    # Feature completa frontend + backend + testes + docs
├── evoluir-dashboard-observabilidade.prompt.md  # ✅ NOVO (2026-03-14) - Dashboard observabilidade
├── evoluir-estrutura-vscode.prompt.md        # ✅ NOVO (2026-03-15) - Estrutura da pasta .vscode
├── evoluir-jobs-logs.prompt.md              # ✅ ATUALIZADO (2026-03-15) - Operação admin global + Jobs/Logs
├── evoluir-sessao-conta.prompt.md           # ✅ NOVO (2026-03-15) - Tela de Sessão e Conta CETESB
├── evoluir-manifestos.prompt.md             # ✅ NOVO (2026-03-15) - Tela de Manifestos
└── evoluir-perfis-acessos.prompt.md         # ✅ NOVO (2026-03-15) - Módulo e tela admin de Perfis/Acessos
```

### Skills por domínio
```
.github/skills/
├── contract-first-openapi/SKILL.md          # OpenAPI → code → tests → examples
├── handoff-automation.md                    # ✅ NOVO (2026-03-08) - Orquestração automática de handoffs
├── handoff-executor-continuous.md           # ✅ ATUALIZADO (2026-03-08) - Execução contínua flexível
├── dashboard-observability/
│   └── SKILL.md                             # ✅ NOVO (2026-03-14) - Playbook de dashboard e observabilidade
├── frontend-vue-ux-orchestration/
│   └── SKILL.md                             # ✅ NOVO (2026-03-09) - Arquitetura frontend Vue/CSS/UX/navegação
├── cetesb-gateway-real/
│   ├── SKILL.md                             # Integração portal real
│   ├── payload-checklist.md                 # Checklist de validação de payloads
│   └── notes.md                             # Notas técnicas de integração
├── cetesb-evidence-validation/
│   └── SKILL.md                             # ✅ NOVO (2026-03-08) - Validação contra HARs em docs/cetesb/
├── ci-cd-validation/
│   └── SKILL.md                             # ✅ NOVO (2026-03-09) - Validação CI/CD e GitHub Actions
├── postgres-job-queue/
│   ├── SKILL.md                             # Fila transacional + DLQ
│   └── state-machine.md                     # Diagrama de estados de jobs
├── qa-smoke-flows/SKILL.md                  # Testes de sucesso/falha
├── agent-orchestration/SKILL.md             # Matriz de escalonamento
└── copilot-structure-evolution/SKILL.md     # Meta-evolução
```

### Instructions por categoria
```
.github/instructions/
├── agent-orchestration.instructions.md      # Regras de delegação
├── api-contract.instructions.md             # OpenAPI/examples/schemas
├── backend-node.instructions.md             # Node.js/Express/services
├── cetesb-source-of-truth.instructions.md   # ✅ NOVO (2026-03-08) - Fonte de verdade CETESB
├── documentation.instructions.md            # docs/copilot/
├── executor-handoffs.instructions.md        # ✅ ATUALIZADO (2026-03-08) - Sequência adaptativa flexível
├── frontend-vue.instructions.md             # ✅ NOVO (2026-03-09) - Regras para frontend Vue/CSS/UX
├── gateway-cetesb.instructions.md           # Integração CETESB
├── postgres.instructions.md                 # Banco/migrations/repositories
├── testing.instructions.md                  # tests/smoke/contrato
└── worker.instructions.md                   # Fila/jobs/retry/DLQ
```

### Workflows CI/CD (✅ VALIDADOS 2026-03-16)
```
.github/workflows/
├── ci-contract-queue.yml                    # Contract + queue validations
│   ├─ Migrations (4 arquivos SQL)
│   ├─ Contract checks (OpenAPI + examples)
│   ├─ CETESB source-of-truth (HAR validation)
│   ├─ Markdown links (docs)
│   └─ Smoke queue retry/DLQ
│
│   Status: ✅ ESTÁVEL (Run #22868009646)
│   Duração: 54s
│   Cobertura: 5 steps, 100% sucesso
└── copilot-structure.yml                    # Validação de arquitetura Copilot
    ├─ Validate agent architecture (`npm run validate:agents`)
    ├─ Validate markdown links (`npm run validate:md-links`)
    └─ Run source-of-truth checks (`npm run test:source-of-truth`)
```

**Falhas corrigidas**:
1. ✅ Migration 004: Index IMMUTABLE (commit 9a37aa6)
2. ✅ Markdown links: Path relativo (commit cf0d34a)
3. ✅ Worker health: Type inference (commit 811b2ed)
4. ✅ Constraint: retry_wait simplificada (commit 811b2ed)

### Documentação meta
```
.github/
└── README.md                                # Estrutura e uso (✅ NOVO)
    └── agents/README.md                     # Guia de agentes (✅ NOVO)
```

## Validação e Melhorias (✅ implementados 2026-03-08)

### Documentação de Validação
- **validacao-sequencia-mtr.md**: Análise completa do HAR real, comparação campo a campo, riscos identificados
- **IMPLEMENTACAO-VALIDACAO-MTR.md**: Detalhes técnicos da implementação, cobertura de testes, benefícios
- **RESUMO-IMPLEMENTACAO-CONSOLIDADA.md**: Resumo executivo com status e resultados

### Implementação
```
src/lib/validators/
└── manifest-validator.js           # Validador de payload (125 linhas, ✅ NOVO)
    ├── validateManifestPayload()   # Valida campos obrigatórios
    └── normalizeExpeditionDate()   # Previne duplicação de timestamp
```

### Testes
```
tests/unit/
└── manifest-validator.test.js      # 26 testes unitários (370 linhas, ✅ NOVO)
    ├── validateManifestPayload     # 20 testes (100% aprovados)
    └── normalizeExpeditionDate     # 6 testes (100% aprovados)
```

## Testes (✅ implementados)

Ver `docs/copilot/15-testes-automatizados.md` para detalhes completos.

```
tests/
├── fixtures/                 # Dados reutilizáveis
├── api/                      # Testes de rotas HTTP (9 testes)
├── integration/              # Testes de serviços (10 testes)
├── worker/                   # Testes de processamento (8 testes)
├── unit/                     # Testes unitários (26 testes ✅ NOVO)
└── *.md                      # Documentação e guias
```

## Fila transacional e persistência (✅ implementados 2026-03-08)

### Implementação
```
src/lib/
└── retry.js                           # Estratégias de retry e prioridade (✅ NOVO)

src/sql/
└── 002_queue_improvements.sql         # Evolução da fila/jobs/DLQ/métricas (✅ NOVO)

src/repositories/
└── job-repo.js                        # DLQ e claim por prioridade (atualizado)

src/workers/
└── job-runner.js                      # Backoff + DLQ + métricas (atualizado)
```

### Testes
```
tests/unit/
└── retry.test.js                      # 15 testes unitários (✅ NOVO)

tests/integration/
└── job-queue-improvements.test.js     # 6 testes de integração (✅ NOVO)
```

**Total atual**: 89 testes | 88 aprovados | 1 falha pré-existente
