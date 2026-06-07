# 10 - Documentation Final

## Objetivo

Consolidar um mapa reutilizavel da superficie auditada no SIGOR frente a superficie atual do SICAT, separando o que ja tem boa cobertura, o que foi resolvido por uma UX diferente, o que ainda depende apenas de UI/orquestracao e o que continua bloqueado por ausencia de backend/contrato.

## Escopo e base de evidencia

Escopo desta consolidacao:

- superficie auditada do SIGOR comprovada em runtime para os perfis `Gerador` e `Destinador/Armazenador Temporário`
- superficie atual do frontend SICAT efetivamente exposta em rotas, views, componentes e cliente API
- superficie backend/contrato atualmente publicada no OpenAPI, operations geradas, rotas Express, services, worker e gateway nos fluxos necessarios para classificar os gaps

Fontes usadas nesta fase:

- `docs/handoffs/sigor-sicat-gap-map/00-orchestration.md`
- `docs/handoffs/sigor-sicat-gap-map/06-frontend-ux.md`
- `docs/handoffs/sigor-sicat-gap-map/03-backend-contracts.md`
- `docs/handoffs/cetesb-platform-complete-navigation/10-documentation-final.md`

Regra de leitura aplicada: este documento nao infere cobertura sem evidencia previa em checkpoint, frontend real ou contrato/backend real.

## Leitura executiva

O SICAT ja cobre com boa aderencia o nucleo operacional de manifesto e parte importante de CDF, mas nao busca espelhar o SIGOR tela a tela. O produto reorganiza a jornada em torno de autenticacao propria, selecao de conta CETESB, operacao sobre manifestos, execucao assíncrona e observabilidade. Isso gera duas leituras distintas:

- a paridade ja e boa no nucleo de criacao/listagem/detalhe de manifesto e no CDF padrao
- a paridade ainda e fraca nas areas de DMR, relatorios dedicados, configuracoes CETESB do empreendimento, ajuda/autoatendimento e fluxos especializados observados no portal

## Mapa por categoria

### Coberto no SICAT

| Area/fluxo | Superficie SIGOR auditada | Superficie SICAT atual | Status | Evidencia consolidada |
| --- | --- | --- | --- | --- |
| Criacao de manifesto | `Novo MTR` para gerador | `ManifestCreateView.vue` + `ManifestCreateForm.vue` cobrem criacao guiada com catalogos e submit | Coberto no SICAT | checkpoint 06 classificou como `Representado` |
| Listagem de manifestos | `Meus MTRs` por papel | `ManifestsView.vue` com filtros, sync e acoes operacionais | Coberto no SICAT | checkpoint 06 classificou como `Representado` |
| Consulta de CDF | `Meus CDFs` | `DestinadorCdfWorkspace.vue`, painel operacional e APIs de listagem/download | Coberto no SICAT | checkpoint 06 classificou como `Representado`; checkpoint 03 confirmou contratos de CDF |

### Coberto de forma diferente no SICAT

| Area/fluxo | Superficie SIGOR auditada | Superficie SICAT atual | Status | Leitura |
| --- | --- | --- | --- | --- |
| Entrada e login | home publica, avisos, login browser-first, FAQ/manual/primeiro acesso | login proprio do SICAT seguido de selecao de conta CETESB | Coberto de forma diferente | atende a entrada operacional, mas nao replica a home publica do portal |
| Home autenticada | home-hub de navegacao | dashboard com KPIs, health, workers, DLQ e timeline | Coberto de forma diferente | SICAT substitui hub simples por painel operacional |
| Detalhe do manifesto | acoes distribuidas nas listagens | `ManifestDetailView.vue` centraliza inspeção do espelho local | Coberto de forma diferente | SICAT cria um ponto de detalhe proprio |
| Recebimento de MTR | recebimento aparece como capacidade do papel destinador, inclusive por codigo de barras | recebimento via listagem/painel contextual do manifesto conhecido | Coberto de forma diferente | cobertura existe, mas nao na mesma entrada nem com as mesmas variantes |

### Ausente por gap de UI/orquestracao

| Area/fluxo | Superficie SIGOR auditada | Superficie SICAT atual | Status | Evidencia consolidada |
| --- | --- | --- | --- | --- |
| Relatorio dos MTRs como experiencia dedicada | tela propria de relatorio com filtros por periodo/papel/contrapartes | a consulta ficou absorvida pela listagem operacional | Gap de UI/orquestracao | checkpoint 06 marcou `Parcial`; checkpoint 03 confirmou base contratual suficiente para consulta filtrada |
| Ajuda estatica | FAQ, manual, primeiro acesso, links de orientacao | sem view dedicada de ajuda no SICAT | Gap de UI/orquestracao | checkpoint 06 marcou `Ausente`; checkpoint 03 separou ajuda estatica de backend novo |

### Ausente com backend/orquestracao ainda a confirmar

| Area/fluxo | Superficie SIGOR auditada | Superficie SICAT atual | Status | Evidencia consolidada |
| --- | --- | --- | --- | --- |
| Relatorio de MTRs em armazenamento temporario | tela dedicada no perfil destino final | sem evidencia de UI dedicada no SICAT; verificacao de contrato equivalente nao foi registrada como area propria no checkpoint 03 | Gap confirmado de frontend; backend/orquestracao a confirmar | checkpoint 06 marcou `Ausente`; checkpoint 03 validou fluxo complementar de armazenamento temporario, mas nao consolidou este relatorio como recurso independente |

### Ausente por gap de backend/contrato

| Area/fluxo | Superficie SIGOR auditada | Superficie SICAT atual | Status | Evidencia consolidada |
| --- | --- | --- | --- | --- |
| DMR | `Nova DMR`, `DMR pendente`, `Minhas DMRs` | sem views, sem cliente API, sem rotas e sem operacoes publicadas | Gap de backend/contrato | checkpoints 06 e 03 convergem para `No support` |
| MTR provisorio | cadastro, listagem e impressao de provisórios | sem UI dedicada e sem recurso publicado no contrato | Gap de backend/contrato | checkpoint 03 confirmou ausencia de rota/operacao |
| MTR complementar para armazenamento temporario | fluxo dedicado com pesquisa, selecao e formulario complementar | apenas campos genericos de armazenamento temporario no manifesto comum | Gap de backend/contrato | checkpoint 03 classificou como `Partial support`, mas sem fluxo dedicado |
| Configuracoes CETESB do empreendimento | `Meus Dados`, `Meus Usuarios` local ao empreendimento, `Alterar Senha` | contexto de sessao/onboarding parcial e administracao global interna do SICAT, sem recursos equivalentes autenticados do dominio CETESB do empreendimento | Gap de backend/contrato | checkpoint 03 confirmou cobertura apenas adjacente e distinta da administracao local do SIGOR |
| Autoatendimento CETESB | recuperacao/troca de senha integrada | sem operacoes equivalentes no contrato interno | Gap de backend/contrato | checkpoint 03 classificou como `No support` para integracao interna |
| CDF sem MTR ou nao emitido pelo sistema | variante dedicada no menu `Certificado` | geracao generica de CDF sem prova de orquestracao para esse caso | Gap de backend/contrato | checkpoint 03 confirmou bloqueio por orquestracao/backend |
| CDF de residuos de acidentes sem MTR | variante dedicada com dados adicionais | sem UX e sem suporte comprovado no contrato/orquestracao | Gap de backend/contrato | checkpoint 03 classificou como lacuna real |

### Extras que o SICAT adiciona alem do SIGOR

| Extra SICAT | Superficie atual | Valor pratico |
| --- | --- | --- |
| Autenticacao propria do produto | login e registro SICAT desacoplados da credencial CETESB | separa identidade do produto da identidade do portal |
| Selecao e persistencia de multiplas contas CETESB | fluxo de conta ativa e contas vinculadas | melhora operacao multi-conta |
| Dashboard operacional | health, workers, DLQ, metricas e timeline | adiciona observabilidade inexistente no SIGOR auditado |
| Monitor de jobs | fila ativa, DLQ, requeue e exclusao | torna explicita a camada assíncrona do produto |
| Acoes em lote sobre manifestos | submissao e cancelamento em lote | acelera operacao recorrente |
| RBAC e administracao global interna | usuarios, roles, permissoes e sessoes do SICAT | acrescenta governanca propria do produto, distinta de `Meus Usuarios` local ao empreendimento no SIGOR |

## Conclusao pratica de paridade

Paridade ja boa:

- criacao de manifesto
- listagem operacional de manifestos
- detalhe operacional do manifesto, mesmo que em UX diferente
- consulta e operacao basica de CDF no caso padrao
- autenticacao operacional com conta CETESB integrada

Paridade ainda insuficiente:

- dominio de DMR inteiro
- relatorios dedicados equivalentes ao portal
- relatorio de MTRs em armazenamento temporario, que segue sem UI equivalente e com necessidade de confirmacao especifica de backend/orquestracao
- configuracoes CETESB do empreendimento e autoatendimento
- fluxos especializados de manifesto, especialmente provisório e complementar de armazenamento temporario
- variantes especializadas de CDF alem do caso padrao por manifesto recebido

Leitura final: o SICAT ja substitui com qualidade o miolo operacional de manifesto e acrescenta capacidades de produto que o SIGOR nao oferece, mas ainda nao cobre a largura funcional do portal nos modulos administrativos, declaratorios e variantes especializadas por papel.

## Backlog recomendado por prioridade

### Prioridade 1

| Slice | Motivo | Tipo dominante |
| --- | --- | --- |
| Fechar estrategia para DMR | maior buraco de paridade funcional; hoje sem UI nem contrato | backend/contrato + UX |
| Definir posicao de produto para configuracoes CETESB | decidir se SICAT vai internalizar `Meus Dados`, `Meus Usuarios` local ao empreendimento e `Alterar Senha`, ou assumir redirecionamento explicito | decisao de produto + backend |
| Fechar variante de CDF padrao versus variantes especiais | hoje o CDF comum existe, mas casos `sem MTR` e `acidentes sem MTR` seguem sem suporte comprovado | backend/orquestracao |

### Prioridade 2

| Slice | Motivo | Tipo dominante |
| --- | --- | --- |
| Criar experiencia dedicada de relatorio dos MTRs | contrato atual ja permite consulta filtrada; falta produto equivalente ao relatorio do portal | UI/orquestracao |
| Enderecar MTR provisorio | fluxo explicitamente presente no SIGOR e ausente no SICAT | backend/contrato + UX |
| Enderecar manifesto complementar de armazenamento temporario | existem campos adjacentes, mas nao o fluxo operacional dedicado | backend/orquestracao + UX |

### Prioridade 3

| Slice | Motivo | Tipo dominante |
| --- | --- | --- |
| Publicar camada de ajuda reutilizavel | gap relevante de experiencia, mas nao bloqueia o nucleo transacional | UI/conteudo |
| Revisar recebimento por codigo de barras e variantes do destinador | pode elevar a aderencia do fluxo do perfil destino final | UX + eventual backend |
| Formalizar mapa permanente SIGOR vs SICAT como artefato de produto | evita reabrir descoberta funcional a cada ciclo | documentacao/governanca |

## Arquivos alterados nesta fase

- `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`

## Validacoes desta fase

- checkpoints `00`, `06` e `03` lidos e reconciliados
- handoff final da auditoria SIGOR lido como base de superficie auditada
- nenhuma alteracao de codigo de produto realizada

## Encerramento

Este work item deixa um mapa final reutilizavel para tomada de decisao: o SICAT ja tem boa aderencia no nucleo operacional e claros diferenciais de produto, mas a paridade ampla com o SIGOR ainda depende de decisoes e entregas especificas em DMR, configuracoes CETESB, relatorios dedicados e variantes especializadas de manifesto/CDF.
