# 10 - Documentation Final

## Objetivo

Transformar o mapa de paridade SIGOR vs SICAT em backlog priorizado por fatias entregaveis, com foco operacional e somente com base no que os checkpoints anteriores comprovam.

## Base de evidencia

- `docs/handoffs/sigor-parity-backlog/00-orchestration.md`
- `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`
- `docs/handoffs/sigor-sicat-gap-map/06-frontend-ux.md`
- `docs/handoffs/sigor-sicat-gap-map/03-backend-contracts.md`

## Regra de priorizacao aplicada

Ordem recomendada por fatias, nao por modulo amplo:

- primeiro o que fecha gap visivel com contrato ja comprovado ou dependencia dominante limitada
- depois o que exige decisao de produto, mas ainda pode entregar valor sem expandir toda a plataforma
- por ultimo o que depende de contrato/backend/orquestracao nova

## Backlog por fatias entregaveis

### Quick wins

| Slice | Valor | Dependencia dominante | Size | Risco | Prioridade recomendada | Evidencia base |
| --- | --- | --- | --- | --- | --- | --- |
| `manifest-report-workspace` | fecha um gap de paridade visivel com uma experiencia dedicada de consulta de MTRs sem esperar um modulo novo inteiro | frontend/orquestracao sobre `GET /v1/manifestos` e filtros ja publicados | M | Baixo | P1 | checkpoint 03 classificou `Relatorios de MTR` como `Partial support`; checkpoint 06 marcou ausencia de tela dedicada, nao de base de consulta |
| `help-and-guided-access` | cobre FAQ/manual/primeiro acesso e reduz friccao de entrada sem bloquear o nucleo transacional | frontend/conteudo; links e orientacao nao dependem de backend novo | S | Baixo | P3 | checkpoint 03 separou ajuda estatica de autoatendimento integrado; checkpoint 06 marcou a camada de ajuda como ausente no frontend |

### Medium slices

| Slice | Valor | Dependencia dominante | Size | Risco | Prioridade recomendada | Evidencia base |
| --- | --- | --- | --- | --- | --- | --- |
| `enterprise-context-and-routing` | organiza o contexto da conta CETESB no SICAT e explicita o que continua fora do produto, reduzindo ambiguidade sobre `Meus Dados`, `Meus Usuarios` e senha | decisao de produto + uso de `partner-info`, `cadastros`, sessao e contas CETESB ja existentes | M | Medio | P4 | checkpoint 03 mostrou suporte apenas adjacente para onboarding/conta/sessao, sem equivalentes completos de administracao do empreendimento |

### Structural bets

| Slice | Valor | Dependencia dominante | Size | Risco | Prioridade recomendada | Evidencia base |
| --- | --- | --- | --- | --- | --- | --- |
| `dmr-core-vertical` | fecha o maior buraco funcional de paridade observada no SIGOR | backend/contrato novo de ponta a ponta | G | Alto | P2 | checkpoints 03 e 06 convergem para ausencia total de DMR em contrato, rotas, worker e frontend |
| `temporary-storage-specialized-flow` | cobre o fluxo especializado que hoje nao cabe no manifesto comum e melhora aderencia do perfil destino final | backend/orquestracao nova para manifesto complementar e relatorio dedicado de armazenamento temporario | G | Alto | P5 | checkpoint 03 confirmou apenas suporte generico de armazenamento temporario no manifesto comum, sem fluxo dedicado |
| `provisional-mtr-vertical` | recupera um fluxo explicito do SIGOR hoje ausente no SICAT | backend/contrato novo + UX dedicada | G | Alto | P6 | checkpoint 03 confirmou ausencia de rota, operacao e worker para provisorio |
| `cdf-special-cases` | fecha a lacuna entre CDF padrao e as variantes `sem MTR` e `residuos de acidentes sem MTR` | backend/orquestracao nova em CDF | G | Alto | P7 | checkpoint 03 mostrou CDF padrao suportado, mas handler atual exige manifesto recebido elegivel |
| `enterprise-cetesb-management` | internaliza de fato configuracoes do empreendimento dentro do SICAT, se essa for a direcao de produto | decisao de produto + backend novo para administracao CETESB autenticada | G | Alto | P8 | checkpoint 03 mostrou ausencia de endpoints equivalentes a `Meus Dados`, `Meus Usuarios` e `Alterar Senha` |

## Primeira implementacao recomendada

Slice recomendada: `manifest-report-workspace`.

Motivo objetivo:

- entrega um gap de paridade claro e visivel para o usuario
- reaproveita contrato ja comprovado, sem depender primeiro de expansao estrutural de plataforma
- tem fronteira de escopo mais controlada que DMR, CDF especial, provisório ou administracao CETESB

## Proximo work_id recomendado

`manifest-report-workspace`

## Contratos e superficies relevantes para a primeira fatia

- `GET /v1/manifestos` com filtros operacionais ja publicados no OpenAPI e validados no checkpoint 03
- nenhuma prova atual de contrato dedicado de relatorio/exportacao; a primeira fatia deve nascer como workspace sobre a consulta existente

## Decisoes consolidadas

- backlog organizado por slices entregaveis, nao por modulos amplos
- `manifest-report-workspace` e a unica primeira implementacao recomendada
- DMR, provisório, fluxo especializado de armazenamento temporario, CDF especial e administracao CETESB interna permanecem como bets estruturais por dependencia dominante de backend/contrato
- ajuda estatica continua tratada separadamente de autoatendimento CETESB integrado

## Validacoes, comandos e testes

- checkpoints obrigatorios lidos e reconciliados
- nenhum comando de build, teste ou smoke executado nesta fase
- nenhuma alteracao de codigo de produto realizada

## Riscos residuais

- a primeira fatia fecha paridade de experiencia, nao paridade de relatorio dedicado com contrato proprio
- a ordem apos P4 continua sensivel a decisao de produto sobre internalizar ou nao funcoes hoje nativas do portal CETESB

## Arquivos alterados nesta fase

- `docs/handoffs/sigor-parity-backlog/10-documentation-final.md`

## Encerramento

O backlog fica fechado com uma abertura clara: comecar por `manifest-report-workspace`, porque e a melhor combinacao comprovada de valor, dependencia controlada e risco baixo. As demais lacunas relevantes permanecem mapeadas como slices posteriores, com separacao explicita entre quick wins, medias dependencias e bets estruturais.
