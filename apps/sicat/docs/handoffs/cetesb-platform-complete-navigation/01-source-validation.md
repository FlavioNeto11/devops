# 01 - Source Validation

## Objetivo da fase

Executar navegacao real e auditavel na plataforma externa SIGOR MTR, com o maior alcance seguro possivel antes de qualquer mutacao, registrando telas, requests, payloads, checkpoints humanos e correlacoes com o SICAT.

## Status da execucao

- A retomada atual reutilizou exatamente a sessao/browser ativos, sem refresh nem reload da pagina, conforme instrucao do usuario.
- Fase retomada na sessao Playwright ativa com CAPTCHA previamente liberado pelo usuario.
- O perfil `gerador` foi autenticado com sucesso e permitiu cobertura ampla de menus, listagens, telas de cadastro e download seguro.
- O perfil `destino final` foi autenticado com sucesso em `fast_path_resume` na mesma sessao ativa, sem refresh, sem reload e sem retorno manual para a home.
- Nenhuma credencial de runtime foi persistida.
- Nenhuma mutacao foi executada.
- Houve progresso autenticado relevante com screen map interno, requests autenticados e um download PDF seguro.
- A retomada desta rodada confirmou que a home publica abriu com email e senha ja preenchidos para o perfil `destino final`, mas o campo do empreendimento ainda precisava ser completado.
- Foi corrigido o fluxo do documento do empreendimento do perfil `destino final` para `CNPJ`, com preenchimento do CNPJ informado em runtime e sem submissao.
- O token do reCAPTCHA ja presente na pagina destravou o botao `Entrar`, permitindo o login imediato do segundo perfil com clique unico no ponto critico pendente.
- A cobertura autenticada agora inclui menus, consultas, recebimento, manifesto complementar, declaracoes, CDF e configuracoes do perfil `destino final`.
- O estado operacional desta fase deixa de ser bloqueado por CAPTCHA e passa a ficar apto para handoff de documentacao final.
- A rodada de enriquecimento reutilizou o mapa anterior para ir direto a telas com historico real, filtros ativos e acoes seguras de leitura.
- `Minhas DMRs` confirmou massa historica renderizada em tabela, com seis registros visiveis e acoes seguras de exportacao por linha.
- `Meus CDFs` foi exercitado com ampliacao real do intervalo de datas nas duas secoes, sem retorno de registros para esta conta no periodo pesquisado.
- `Cadastro Certificado de Destinação Final` confirmou um modal de selecao de responsavel tecnico com linha carregada em runtime, sem selecao final nem salvamento.

## Parametros operacionais aplicados

- alvo externo: `https://mtr.cetesb.sp.gov.br/`
- sensitive_flows_allowed: `nao`
- stop_before_mutation: `sim`
- navigation_scope: `login, list, menu discovery, cadastro screens, baixa screens, consulta screens, download screens up to the point before final confirmation/submission`
- perfis de runtime recebidos: `gerador` e `destino final`
- tratamento de segredos: somente em memoria, sem persistencia em artefatos do repositorio

## Arquivos analisados

- `docs/handoffs/cetesb-platform-complete-navigation/00-orchestration.md`
- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `src/gateways/cetesb-gateway.js`
- `src/services/auth-service.ts`
- `src/lib/config.ts`
- `src/lib/cetesb-source-of-truth.ts`
- `frontend/src/views/CetesbAccountSelectionView.vue`
- `frontend/src/components/ManifestCreateForm.vue`
- `frontend/src/composables/useCetesbOperationalFlows.js`

## Navegacao observada

### 1. Entrada publica

- URL carregada com sucesso: `https://mtr.cetesb.sp.gov.br/#/`
- Titulo da pagina observado: `Sistema Estadual de Gerenciamento Online de Resíduos Sólidos - SIGOR - Módulo MTR`
- O frontend externo abriu diretamente na home com formulario de login e bloco de avisos.

### 2. Modal inicial

- Um dialogo `AVISOS` aparece automaticamente sobre a home.
- O dialogo contem comunicados operacionais e instrucoes de suporte, inclusive orientacoes sobre `Fale Conosco` e recuperacao de senha.
- O modal foi fechado apenas para permitir inspecao do formulario publico abaixo dele.

### 3. Estrutura publica comprovada da home

Textos e acoes visiveis antes de login:

- mensagem de boas-vindas ao `SIGOR - Modulo MTR`
- links de ajuda publica:
  - `Manual de Ajuda clicando aqui`
  - `FAQ clicando aqui`
  - `Cadastre-se para primeiro acesso clicando aqui`
- secao `1 - LOGIN E SENHA`
- campo `Email`
- campo `Senha`
- link `Esqueceu sua senha? Clique aqui.`
- secao `2 - DADOS DO EMPREENDIMENTO`
- orientacao: preencher `CNPJ/CPF` e avancar com `ENTER` ou `TAB` para selecionar a unidade desejada
- selecao de documento com opcoes `CNPJ` e `CPF`
- campo observado com placeholder `CPF do Empreendimento`
- botao `Entrar`, inicialmente desabilitado
- rodape com `apoio` e versao `1.0.38`

### 4. Retomada da sessao e estado atual do formulario

- O modal `AVISOS` voltou a abrir automaticamente na retomada e foi fechado novamente apenas para inspecao da tela publica.
- O formulario de login retornou com valores ja preenchidos nos campos de e-mail e senha dentro da sessao do browser.
- Esses valores nao foram persistidos neste handoff, nao foram copiados para artefatos versionados e nao foram reenviados ao sistema externo.
- O campo de documento do empreendimento continuou vazio e o botao `Entrar` permaneceu desabilitado no estado observado.
- O iframe do reCAPTCHA seguiu presente e visivel no formulario, mantendo o checkpoint humano antes de qualquer tentativa de autenticacao.

### 4.1. Correcao aplicada na retomada atual sem reload

- A sessao ativa foi reaproveitada exatamente no estado em que o usuario a deixou, sem `navigate`, sem `refresh` e sem retorno a home fora do contexto ja aberto.
- Foi aplicada a correcao operacional informada pelo usuario: selecionar `CNPJ` no formulario de empreendimento do perfil `destino final` antes de preencher o documento.
- O campo mudou do placeholder `CPF do Empreendimento` para `CNPJ do Empreendimento` apos a selecao correta.
- O CNPJ foi preenchido com sucesso e mascarado na tela como `13.***.***/0001-50`.
- O formulario passou a exibir o campo `Unidade`, preenchido automaticamente com o identificador `<parCodigo>` apos o avancar do campo de documento.
- Nao houve submissao do login porque o botao `Entrar` permaneceu desabilitado enquanto o checkpoint humano do reCAPTCHA seguia aberto.

### 5. Autenticacao confirmada do perfil gerador

- A autenticacao do perfil `gerador` ocorreu com sucesso apos o CAPTCHA resolvido pelo usuario na sessao ativa.
- A home autenticada exibiu o contexto do empreendimento/unidade, identificacao do usuario, perfil operacional `Gerador` e ultimo login.
- O portal interno confirmou a seguinte arvore principal de menu para este perfil:
  - `Home`
  - `Manifesto`
  - `Declaração`
  - `Certificado`
  - `Configurações`
  - `Ajuda`

### 6. Superficie autenticada coberta com o perfil gerador

#### Home autenticada do destino final

- A home autenticada expoe o contexto de sessao no cabecalho e mantem o menu lateral como ponto central de navegacao.
- Nao foram observados KPIs ou dashboard operacional rico na landing page interna; a home funciona principalmente como hub de menu.

#### Manifesto no destino final

- `Novo MTR (Manifesto de Transporte de Resíduos)` abriu a tela `Cadastro Manifesto`.
- A tela confirma blocos separados para `Dados do Gerador`, `Dados do Transportador`, `Dados do Destinador`, lista de residuos e `Observações`.
- O gerador veio pre-preenchido a partir do contexto autenticado; transportador, motorista, placa, destinador e residuos permaneceram vazios nesta auditoria.
- O formulario expoe acao final `Enviar`, mas a execucao parou antes de qualquer preenchimento operacional que pudesse levar a submissao.

- `Cadastrar ou Editar Modelo do MTR` abriu a tela `Cadastro Modelo Manifesto`.
- Foram confirmados os campos `Nome do Modelo`, transportador, destinador, lista de residuos e o botao final `Enviar`.
- Tambem existe a acao de busca de modelo e uma acao `Novo Modelo` no mesmo fluxo.

- `Meus MTRs` abriu uma listagem com filtros `Todos`, `MTRs Abertos`, `MTRs com CDF` e `MTRs sem CDF`.
- A listagem tambem expoe filtros por data, empresa e numero de manifesto/CADRI.
- No momento da auditoria, a tabela observada nao trouxe registros renderizados na tela.

- `Relatório dos MTRs` abriu um formulario de consulta com datas, selecao do papel pesquisado (`Gerador`, `Transportador`, `Destinador`) e filtros por transportador e destinador.
- A tela expoe o botao `Gerar Relatório`, mas nenhuma geracao foi disparada nessa etapa.

- `MTRs Provisórios` abriu a tela `Cadastro de MTR provisório`.
- A tela confirma um campo `Quantidade`, a acao `Gerar` para novos provisórios e uma secao de listagem/impressao.
- Sem gerar novos itens, foi executada apenas a acao segura `Imprimir listagem de MTRs Provisórios`, que resultou em download do arquivo `listagemManifestoProvisorio.pdf`.

#### Declaração

- `Nova DMR - Gerador` abriu a tela `Declaração de Movimentação de Resíduos`.
- Foram confirmados os campos de periodo, numero DMR, `Responsável Legal`, lista de residuos, observacao e acoes `Adicionar`, `Atualizar Itens` e `Salvar`.
- O fluxo permaneceu antes de qualquer adicao de item ou gravacao.

- `Cadastrar DMRs Pendente` abriu uma tela curta com `Tipo Declarante`, `Período` e acao `Gerar DMR`.
- Nenhuma geracao foi executada.

- `Minhas DMRs` abriu a listagem de DMRs com filtro textual e colunas `Número`, `Data Inicial`, `Data Final`, `Declarante`, `Situação` e `Ações`.

#### Certificado

- `Meus CDFs` abriu uma tela com duas secoes paralelas: `CDFs como Destinador` e `CDFs como Gerador`.
- Ambas as secoes expoem filtros por data, contraparte e numero do CDF.
- Nenhuma acao de emissao ou download foi executada nesta rodada.

#### Configurações

- `Meus Dados` abriu `Editar Cadastro Acesso` com perfis do empreendimento, campos cadastrais completos e botao final `Salvar`.
- Foi observado um componente Bing Maps embutido com mensagem de erro de credenciais invalidas do provedor de mapa, sem impedir a carga basica do formulario.
- Nenhuma alteracao cadastral foi submetida.

- `Meus Usuários` abriu `Gerenciar Usuários` com tabela de usuarios cadastrados, situacao e acao de edicao.
- A tela confirma a existencia de `Adicionar Usuário`, mas nenhum modal ou formulario de inclusao foi aberto ate o ponto de mutacao.

- `Alterar Senha de Acesso` abriu a tela com os campos `Senha Atual`, `Nova Senha` e `Confirme a sua nova senha`, alem da acao final `Alterar Senha`.
- Nenhuma senha foi enviada.

### 7. Tentativa de trocar para o perfil destino final

- A troca de perfil exigiu retornar a uma tela de login limpa.
- O login do segundo perfil apareceu pre-preenchido na sessao limpa, mas o documento do empreendimento voltou vazio e o reCAPTCHA reapareceu desmarcado.
- Pela politica da fase, a execucao foi interrompida novamente antes de nova autenticacao assistida.

### 8. Retomada posterior com o perfil destino final ainda bloqueado

- A rodada atual retomou a mesma home publica do portal `https://mtr.cetesb.sp.gov.br/#/`.
- O modal `AVISOS` voltou a aparecer na abertura da pagina, confirmando o comportamento recorrente do portal em sessoes novas.
- Os campos de `Email` e `Senha` permaneceram preenchidos na sessao com o perfil `destino final`, sem persistencia desses valores em artefatos do repositório.
- O documento do empreendimento do perfil `destino final` foi preenchido apenas para deixar o formulario pronto para o desbloqueio humano.
- O botao `Entrar` permaneceu desabilitado mesmo com credenciais e documento preenchidos.
- O iframe do reCAPTCHA deixou de mostrar apenas a caixa `I'm not a robot` e abriu um desafio visual ativo com a instrucao `Select all images with crosswalks` e botao `Verify`.
- Esse estado confirma que o desbloqueio anterior nao permaneceu valido para a nova tentativa de autenticacao do perfil `destino final`.
- Nenhum clique em `Entrar`, nenhuma confirmacao e nenhuma mutacao operacional foram executados.

### 9. Estado exato da sessao apos a correcao para CNPJ

- O reuso da sessao atual confirmou que email e senha seguiram preenchidos para o perfil `destino final` sem necessidade de reentrada manual.
- A correcao de fluxo para `CNPJ` foi aplicada com sucesso e eliminou o preenchimento incorreto anterior em modo `CPF`.
- O preenchimento do CNPJ destravou apenas a exibicao da `Unidade`, com valor `<parCodigo>`, mas nao concluiu a validacao anti-bot.
- O snapshot desta retomada mostrou a ancora do reCAPTCHA novamente sem validacao concluida e o iframe de desafio visual ainda aberto ao mesmo tempo.
- O desafio visivel manteve a instrucao `Select all images with crosswalks` e a acao `Verify`, caracterizando checkpoint humano ainda pendente.
- Nenhum request adicional de autenticacao foi disparado nesta etapa controlada; nao houve tentativa de `Entrar` enquanto o reCAPTCHA permanecia pendente.

### 10. Fast path resume concluido com autenticacao do perfil destino final

- Sem qualquer `refresh`, `reload` ou nova navegacao externa, a mesma pagina ativa foi reaproveitada para o passo critico pendente.
- Uma verificacao minima confirmou botao `Entrar` habilitado, campo `Unidade` visivel e valor presente em `g-recaptcha-response`.
- O clique unico em `Entrar` concluiu a autenticacao e levou diretamente para `#/navegacao/home`.
- A home autenticada exibiu o contexto do empreendimento/unidade, identificacao do usuario operacional e o perfil `Destinador/Armazenador Temporário`.
- A autenticação desta conta confirmou que o login remoto continuou aceitando o contrato observado anteriormente com `sistema`, `login`, `email`, `senha`, `parCodigo` e `recaptcha`.

### 11. Superficie autenticada coberta com o perfil destino final

#### Home autenticada

- O cabecalho interno confirmou `Empreendimento/Unidade`, usuario autenticado, perfil `Destinador/Armazenador Temporário` e `Último login`.
- A arvore principal de menu permaneceu com os mesmos modulos de primeiro nivel do perfil `gerador`: `Home`, `Manifesto`, `Declaração`, `Certificado`, `Configurações` e `Ajuda`.

#### Diferencas estruturais imediatas versus perfil gerador

- `Manifesto`: o perfil `destino final` nao exibiu `Novo MTR`, `Cadastrar ou Editar Modelo do MTR` nem `MTRs Provisórios`; em vez disso, exibiu `Meus MTRs`, `Relatório dos MTRs`, `MTR Complementar para Armazenamento Temporário` e `Relatório de MTRs em Armazenamento Temporário`.
- `Declaração`: o fluxo principal mudou de `Nova DMR - Gerador` para `Nova DMR - Destinador (Declaração de Movimentação de Resíduos - Inventário)`.
- `Certificado`: o perfil `destino final` adicionou tres fluxos de geracao de CDF (`emitidos pelo SIGOR MTR`, `sem MTR ou não emitidos pelo sistema`, `resíduos oriundos de acidentes e sem MTR`) alem de `Meus CDFs`; no perfil `gerador`, a cobertura anterior mostrou apenas a consulta em `Meus CDFs`.
- `Configurações` e `Ajuda` mantiveram a mesma composicao funcional observada no perfil `gerador`.

#### Manifesto

- `Meus MTRs` abriu duas secoes operacionais distintas: `Meus MTRs como Destinador` e `Meus MTRs como Armazenador Temporário`.
- A tela confirmou dois pontos de recebimento sensiveis sem execucao final: `Receber MTR utilizando código de barras` e `Receber MTR Provisório`, ambos com botoes `saveReceber` deliberadamente nao acionados ate a mutacao.
- As duas listagens renderizaram filtros por periodo, empresa, numero MTR e numero CADRI/coletivo/parecer; no momento da auditoria, ambas ficaram sem registros.
- `Relatório dos MTRs` manteve a geracao de consulta por datas e pelo papel pesquisado (`Gerador`, `Transportador`, `Destinador`), sem disparar `Gerar Relatório`.
- `MTR Complementar para Armazenamento Temporário` abriu um fluxo proprio com pesquisa de MTR, tabela de selecao e formulario complementar contendo `Transportador`, `Motorista`, `Placa`, `Observação` e `Salvar`; a navegacao parou antes de qualquer selecao ou gravacao.
- `Relatório de MTRs em Armazenamento Temporário` confirmou um fluxo de consulta separado por datas, tambem interrompido antes da geracao.

#### Declaracao no destino final

- `Nova DMR - Destinador` abriu uma tela de inventario com periodo, numero DMR, `Responsável Legal`, tabela de residuos e acoes `Adicionar`, `Atualizar Itens` e `Salvar`.
- Diferentemente do perfil `gerador`, a lista de residuos apareceu pre-carregada com linhas reais de geradores e tratamentos, evidenciando que o papel `destino final` trabalha sobre residuos recebidos e destinados.
- `Cadastrar DMRs Pendente` permaneceu como fluxo curto com `Tipo Declarante`, `Período` e acao `Gerar DMR`, sem execucao.
- `Minhas DMRs` trouxe historico real de declaracoes enviadas, com colunas `Número`, `Data Inicial`, `Data Final`, `Declarante`, `Situação` e `Ações`, incluindo icones de impressao e listagem sem clique final.

#### Certificado no destino final

- `Gerar CDF ... de MTRs emitidos pelo SIGOR MTR` abriu um fluxo com periodo de recebimento, selecao de responsavel tecnico, observacao, pesquisa de gerador, pesquisa de MTR e lista de itens selecionados; a execucao parou antes de `Salvar`.
- `Gerar CDF ... sem MTR ou não emitido pelo sistema` abriu um fluxo alternativo com lista de residuos, opcao de `Utilizar gerador não cadastrado no sistema`, pesquisa de gerador e `Salvar` nao executado.
- `Gerar CDF ... para residuos oriundos de acidentes e sem MTR` confirmou variacao adicional com identificacao do acidente, proprietario da carga, responsavel pelo atendimento e transportador acidentado, todos com seletores `CNPJ/CPF`.
- `Meus CDFs` manteve duas secoes de consulta, `CDFs como Destinador` e `CDFs como Gerador`, ambas sem registros renderizados nesta conta.

#### Configuracoes no destino final

- `Meus Dados` confirmou os perfis `Destinador` e `Armazenador temporário` habilitados no cadastro do empreendimento, alem das classes de residuos e dos blocos de licenca.
- O widget Bing Maps continuou exibindo erro de credenciais invalidas, o mesmo risco tecnico ja observado no perfil `gerador`.
- `Meus Usuários` listou ao menos um usuario administrativo ativo e exibiu a acao `Adicionar Usuário`, sem abrir modal de inclusao.
- `Alterar Senha de Acesso` manteve o formulario padrao de troca de senha, sem envio.

### 12. Enriquecimento desta rodada com filtros, dados reais, modais e exportacoes

#### Minhas DMRs com historico real

- A tela `Minhas DMRs` foi revisitadas diretamente por hash para priorizar uma superficie com massa historica confirmada.
- A tabela `Lista de DMRs` renderizou seis linhas visiveis nesta rodada, todas com `Declaração Enviada` e periodo entre `2021` e `2022`.
- As colunas efetivamente vistas foram `Número`, `Data Inicial`, `Data Final`, `Declarante`, `Situação` e `Ações`.
- Foram confirmadas as acoes por linha `Imprimir DMR` e `Imprimir DMR em planilha`.

#### Downloads seguros efetivamente exercitados

- O clique seguro em `Imprimir DMR` na primeira linha gerou download local do arquivo `decaracao_manifesto.pdf`.
- O clique seguro em `Imprimir DMR em planilha` na mesma linha gerou download local do arquivo `declaracao_manifesto.xlsx`.
- Nenhuma dessas acoes alterou dados de negocio, nao abriu confirmacao irreversivel e nao exigiu novo checkpoint humano.

#### Meus CDFs com filtro por data ampliado

- A tela `Meus CDFs` foi exercitada nas duas secoes: `CDFs como Destinador` e `CDFs como Gerador`.
- O intervalo padrao de `20/03/2026` a `19/04/2026` foi ampliado manualmente para `01/01/2021` a `19/04/2026` nas duas secoes.
- Os dois botoes `Pesquisa` foram acionados com esse periodo longo e sem filtros textuais adicionais.
- O resultado permaneceu `Nenhum registro encontrado` em ambas as grades, mas a interacao confirmou os endpoints de consulta, o contrato de datas `dd-mm-aaaa` e a segmentacao distinta por papel consultado.

#### Modal real na geracao de CDF

- A rota `Cadastro Certificado de Destinação Final` foi reaberta como fluxo rico nao mutavel.
- O botao `Selecionar Responsável Técnico` abriu um dialogo real `Selecionar Responsável`.
- O modal carregou uma tabela `Lista de Responsáveis` com uma linha visivel em runtime, incluindo colunas `Responsável`, `Cargo`, `Registro` e `Ações`.
- As acoes visiveis nessa linha incluiram `Editar` e `Selecionar`, mas nenhuma foi executada.
- O botao `Salvar` do formulario principal permaneceu desabilitado durante a observacao.

#### Limite desta rodada no dominio Manifesto

- `Meus MTRs` permaneceu sem linhas renderizadas nas secoes de `Destinador` e `Armazenador Temporário` durante as verificacoes desta rodada.
- Houve tentativa adicional de retorno a filtros combinados nessa rota, mas sem novo resultado conclusivo acima do que ja estava comprovado no mapa anterior; por rigor, o handoff preserva como validado apenas o estado vazio das grades e os controles de filtro ja descritos.

## Checkpoint humano encontrado

### CAPTCHA

- O formulario inicial carrega um iframe Google reCAPTCHA antes de qualquer tentativa de login.
- Evidencia DOM observada:
  - iframe com `title: reCAPTCHA`
  - `src` apontando para `https://www.google.com/recaptcha/api2/anchor`
  - textarea `g-recaptcha-response`
  - iframe adicional de desafio com `title: recaptcha challenge expires in two minutes`
- O usuario liberou esse checkpoint na sessao ativa e isso permitiu a autenticacao do perfil `gerador`.
- Um novo checkpoint equivalente reapareceu quando a sessao foi levada de volta a uma tela de login limpa para tentativa do perfil `destino final`.
- Na retomada posterior, o checkpoint evoluiu para desafio visual ativo dentro do iframe, com prompt para selecionar imagens e acao `Verify`.
- Na retomada atual, mesmo reutilizando a mesma pagina sem reload e corrigindo o documento para `CNPJ`, o desafio visual permaneceu aberto e a ancora `I'm not a robot` apareceu novamente sem validacao concluida.
- Pela politica desta fase, a execucao foi interrompida novamente nesse segundo aparecimento do checkpoint humano, agora em forma de desafio visual ativo.

## Requests observados antes do bloqueio

### Tráfego de negocio observado

- `GET https://mtrr.cetesb.sp.gov.br/api/cadastro/pesquisaPainelAvisos` -> `200 OK`

### Tráfego observado na retomada atual controlada

- Nenhum request novo de autenticacao foi disparado durante a correcao do fluxo para `CNPJ`.
- A inspeção de rede apos o preenchimento do CNPJ nao capturou chamada adicional para login, parceiro ou unidade nesta etapa.
- Isso e coerente com o estado do formulario: a unidade ficou visivel, mas o portal permaneceu aguardando a conclusao humana do reCAPTCHA antes de habilitar o envio.

### Tráfego autenticado observado com o perfil gerador

- `POST https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/listaDocumentoVersaoPorTipo/27` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/listaDocumentoVersaoPorTipo/28` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/pesquisaParceiroByCodigo/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/unidades` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/classes` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/residuo/grupoEmbalagem` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/residuo/tipoEstado` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/residuo/tratamento` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/residuo/abnt` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/residuo/residuoClasse` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/residuo/pesquisaAbntGerador/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/provisorio/<parCodigo>/true` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/provisorio/<parCodigo>/false` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/listaResponsavelRecebimento/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/declaracao/carrega/<declaracaoCodigo>/<parCodigo>/1/0` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/tipoParceiroDmrPendente/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/declaracao/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/estados` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/parceiroTipoParceiros` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/orgaoEmissor` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/editaCadastro/<cadastroCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/acesso/parceiro/<parCodigo>` -> `200 OK`
- `POST https://mtrr.cetesb.sp.gov.br/api/relatorio/download/6` -> `200 OK`

### Tráfego autenticado observado com o perfil destino final

- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/consultaParceiro/J/<cnpj-destino-final>` -> `200 OK`
- `POST https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/listaDocumentoVersaoPorTipo/27` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/listaDocumentoVersaoPorTipo/28` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/listaResponsavelRecebimento/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/declaracao/carrega/<cadastroCodigo>/<parCodigo>/2/0` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/declaracao/<parCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/editaCadastro/<cadastroCodigo>` -> `200 OK`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/acesso/parceiro/<parCodigo>` -> `200 OK`

### Tráfego adicional confirmado na rodada de enriquecimento

- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/declaracao/<parCodigo>` -> carga da lista historica de `Minhas DMRs`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/imprimir/imprimeDmr/<dmrCodigo>/2` -> exportacao PDF segura por linha em `Minhas DMRs`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/geraDmrXls/<dmrCodigo>` -> exportacao XLS segura por linha em `Minhas DMRs`
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/certificadoDestinacao/9/<parCodigo>/0/all/01-01-2021/19-04-2026` -> consulta `CDFs como Destinador` com periodo ampliado
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/certificadoDestinacao/8/<parCodigo>/0/all/01-01-2021/19-04-2026` -> consulta `CDFs como Gerador` com periodo ampliado
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/responsavel/<parCodigo>` -> carga do modal `Selecionar Responsável` na geracao de CDF
- `GET https://mtrr.cetesb.sp.gov.br/api/mtr/pesquisaManifesto/<parCodigo>/26/9/01-01-2025/19-04-2026/0/all` -> tentativa segura de pesquisa de MTR no formulario de CDF com retorno `404 Not Found`

### Inferencias seguras a partir do bootstrap publico

- A pagina publica do portal `mtr.cetesb.sp.gov.br` consome dados iniciais do backend/API em `mtrr.cetesb.sp.gov.br`.
- O carregamento dos avisos ocorre sem autenticacao previa.
- O checkpoint anti-bot esta no frontend web e antecede qualquer autenticacao assistida por browser.

## Payloads e estruturas comprovadas nesta fase

### Estrutura publica do formulario externo

Campos/controles comprovados no DOM antes do login:

- input `Email`
- input `Senha`
- radio `CNPJ`
- radio `CPF`
- input do empreendimento com placeholder observado `CPF do Empreendimento`
- iframe `reCAPTCHA`
- textarea `g-recaptcha-response`
- botao `Entrar`
- iframe de desafio do reCAPTCHA com instrucao visual e botao `Verify`

### Correlacao com payload de autenticacao tratado pelo SICAT

Mesmo sem submeter login no portal externo, o repositório do SICAT confirma que o payload de autenticacao remoto trabalha com a estrutura abaixo:

```json
{
  "sistema": 0,
  "login": "<documento-normalizado>",
  "senha": "<senha>",
  "email": "<email-resolvido>",
  "parCodigo": "<codigo-parceiro>",
  "recaptcha": "<token-ou-vazio>"
}
```

### Payload autenticado confirmado por observacao direta no portal

- A autenticacao browser-first confirmou na pratica o mesmo contrato de login observado no SICAT.
- O request capturado para `/api/mtr/carregaDadosLogin` enviou `sistema`, `login`, `email`, `senha`, `parCodigo` e `recaptcha`.
- Neste handoff, todos os valores sensiveis permanecem mascarados; apenas a estrutura foi preservada.

### Estruturas de consulta e download confirmadas

- O carregamento das telas de manifesto reutiliza o `parCodigo` autenticado para consultas de parceiro, residuos e provisórios.
- A listagem/impressao de provisórios resultou em `POST /api/relatorio/download/6`, evidenciando que a geracao de PDF usa endpoint dedicado de download no backend remoto.
- A lista historica de DMRs usa consulta direta por `parCodigo` e expoe exportacoes dedicadas por `dmrCodigo`, separando PDF (`imprimeDmr`) e planilha (`geraDmrXls`).
- A busca de CDFs codifica o papel consultado no proprio path (`8` vs `9`) e serializa o periodo no formato `dd-mm-aaaa`.
- A geracao de CDF carrega responsaveis tecnicos em consulta propria antes de qualquer selecao, permitindo modal de escolha sem mutacao do certificado.

## Correlacao com SICAT

### Integracao backend

- `src/services/auth-service.ts` constroi o corpo de login CETESB com `login`, `senha`, `email`, `parCodigo` e `recaptcha`.
- `src/gateways/cetesb-gateway.js` encaminha `recaptcha` como string opcional no backend, inclusive com fallback para vazio.
- `src/lib/config.ts` confirma a separacao entre portal web `https://mtr.cetesb.sp.gov.br` e API remota `https://mtrr.cetesb.sp.gov.br`.
- `src/gateways/cetesb-gateway.js` tambem centraliza o bootstrap de autenticacao real em `/api/mtr/carregaDadosLogin` e o uso recorrente de `parCodigo` nas consultas operacionais posteriores.

### Frontend SICAT

- `frontend/src/views/CetesbAccountSelectionView.vue` expoe um campo `reCAPTCHA token (opcional)` para contas CETESB no fluxo do SICAT.
- Isso sugere que o SICAT trata o `recaptcha` como parametro operacional do backend/API, enquanto a navegacao browser-first no portal oficial encontra o reCAPTCHA visual antes do login.
- O mesmo componente do SICAT resolve `partnerCode` a partir do login CETESB e permite informar `email`, `partnerCode` e `recaptchaToken`, alinhando com o payload autenticado realmente observado no portal externo.
- `frontend/src/components/ManifestCreateForm.vue` e `frontend/src/composables/useCetesbOperationalFlows.js` reforcam o uso de `parCodigo/partnerCode` nos fluxos de manifesto e CDF, coerente com os endpoints autenticados vistos nesta auditoria.
- A retomada do perfil `destino final` reforcou outra divergencia operacional importante: no browser-first do portal oficial, o reCAPTCHA continua sendo um checkpoint humano impeditivo antes do login, enquanto o SICAT trata `recaptchaToken` apenas como campo opcional de suporte no fluxo de conta CETESB.

### Evidencia historica local

- `src/lib/cetesb-source-of-truth.ts` mapeia HARs canônicos para `auth.login`, `manifest.receive`, `cdf.generate`, `cdf.download` e `cadastro.submit`.
- Os HARs continuam sendo fonte de verdade complementar para comparar os payloads dos fluxos internos que nesta rodada foram apenas abertos ate antes da mutacao final.

## Mapa de telas obtido nesta rodada

### Confirmado

- home publica do SIGOR MTR
- modal de avisos operacionais
- formulario de login
- bloco publico de ajuda, cadastro inicial e recuperacao de senha
- home autenticada do perfil `gerador`
- `Cadastro Manifesto`
- `Cadastro Modelo Manifesto`
- `Meus MTRs`
- `Relatório dos MTRs`
- `Cadastro de MTR provisório`
- `Declaração de Movimentação de Resíduos`
- `Cadastrar DMRs Pendente`
- `Minhas DMRs`
- `Meus CDFs`
- `Editar Cadastro Acesso`
- `Gerenciar Usuários`
- `Alterar senha`

### Cobertura autenticada adicional do perfil destino final

- home autenticada do perfil `destino final`
- `Meus MTRs` com secoes `Destinador` e `Armazenador Temporário`
- `Relatório dos MTRs`
- `MTR Complementar para Armazenamento Temporário`
- `Relatório de MTRs em Armazenamento Temporário`
- `Nova DMR - Destinador`
- `Cadastrar DMRs Pendente`
- `Minhas DMRs` com historico renderizado
- `Gerar CDF` para MTR emitido pelo SIGOR MTR
- `Gerar CDF` sem MTR ou nao emitido pelo sistema
- `Gerar CDF` para residuos oriundos de acidentes e sem MTR
- `Meus CDFs`
- modal `Selecionar Responsável` dentro de `Gerar CDF`
- `Meus Dados` do perfil `destino final`
- `Meus Usuários` do perfil `destino final`
- `Alterar senha` do perfil `destino final`

### Nao acessado por ausencia de registros ou por limite operacional

- acao final de `Receber MTR` por codigo de barras
- acao final de `Receber MTR Provisório`
- selecao real de MTR para `Manifesto Complementar para Armazenamento Temporário`
- geracao final de relatorios
- emissao final de CDF
- downloads e impressoes do perfil `destino final` dependentes de registros disponiveis ou de clique em acao sensivel

## Mapa preliminar da superficie da plataforma por dominio

| Dominio/modulo | Superficie observada | Componentes centrais | Estado |
| --- | --- | --- | --- |
| Acesso publico | home, avisos, login, ajuda, recuperacao, primeiro acesso | modal `AVISOS`, formulario de login, seletor `CNPJ/CPF`, reCAPTCHA, links de ajuda | coberto |
| Sessao autenticada | home interna e cabecalho contextual | identificacao do usuario, perfil ativo, empreendimento/unidade, menu lateral | coberto com `gerador` e `destino final` |
| Manifesto | criacao gerador, recebimento destinador, relatorios e armazenamento temporario | formularios de cadastro e complementar, filtros, tabelas, recebimento, relatorios | coberto em ambos os perfis ate antes da mutacao |
| Declaracao | nova DMR por papel, DMR pendente, minhas DMRs | periodo, responsavel legal, residuos, tabela/listagem, botoes de geracao/salvamento | coberto em ambos os perfis ate antes da mutacao |
| Certificado | consulta e geracao de CDF por cenarios distintos | secoes por papel, filtros, pesquisa de gerador, pesquisa de MTR, responsavel tecnico | coberto com `gerador` e `destino final` ate antes da mutacao |
| Configuracoes | meus dados, usuarios, alterar senha | formulario cadastral, tabela de usuarios, widget de mapa, campos de senha | coberto em ambos os perfis |
| Operacoes dependentes de papel | baixa, recebimento, complementar, CDF, restricoes por role | menus efetivos, telas exclusivas, acoes sensiveis por perfil | coberto estruturalmente; mutacoes finais nao executadas |
| Login do perfil destino final | email, senha, documento do empreendimento, reCAPTCHA visual | autenticar via `fast_path_resume` sem recarregar | concluido |

## Matriz preliminar de tela componente acao

| Tela/fluxo | Componentes observados | Acoes observadas com seguranca | Situacao |
| --- | --- | --- | --- |
| Home publica | modal, login, documento do empreendimento, reCAPTCHA | fechar avisos, inspecionar formulario e links | coberto |
| Home autenticada | cabecalho contextual, menu lateral | validar perfil, menus e contexto da unidade | coberto com `gerador` e `destino final` |
| Cadastro Manifesto | blocos gerador, transportador, destinador, residuos, observacoes | abrir tela e inspecionar pre-preenchimento | coberto sem mutacao |
| Cadastro Modelo Manifesto | nome do modelo, contrapartes, residuos | abrir tela, localizar busca e `Novo Modelo` | coberto sem mutacao |
| Meus MTRs | filtros por status e periodo, recebimento por codigo de barras/provisorio, tabelas por papel | abrir listagem e validar filtros disponiveis sem executar recebimento | coberto |
| Relatorio dos MTRs | datas, papel pesquisado, filtros de contrapartes | abrir consulta ate antes de `Gerar Relatório` | coberto sem geracao |
| MTRs Provisorios | quantidade, listagem, impressao | executar impressao segura e validar download PDF | coberto |
| Declaracoes DMR | formulario, lista de residuos, tabela de DMRs | abrir criacao, pendencias e listagem; validar historico real; baixar PDF e XLS por linha | coberto sem mutacao |
| Meus CDFs | secoes como destinador e como gerador, filtros | abrir consulta, ampliar datas e pesquisar nas duas grades | coberto |
| MTR Complementar para Armazenamento Temporário | pesquisa de MTR, tabela de selecao, transportador, motorista, placa, observacao | abrir fluxo ate antes de selecionar MTR e salvar | coberto sem mutacao |
| Relatório de MTRs em Armazenamento Temporário | datas e geracao de consulta | abrir fluxo ate antes de `Gerar Relatório` | coberto sem geracao |
| Gerar CDF com MTR | periodo, responsavel tecnico, gerador, MTRs selecionados, modal de responsavel | abrir fluxo, carregar modal `Selecionar Responsável` e parar antes de `Salvar` | coberto sem mutacao |
| Gerar CDF sem MTR | periodo, residuos, gerador cadastrado ou nao cadastrado | abrir fluxo ate antes de `Salvar` | coberto sem mutacao |
| Gerar CDF por acidente | periodo, residuos, identificacao do acidente e das partes envolvidas | abrir fluxo ate antes de `Salvar` | coberto sem mutacao |
| Configuracoes | cadastro, usuarios, alterar senha | abrir formularios e tabelas sem salvar/alterar | coberto sem mutacao |
| Login segundo perfil | login limpo com reCAPTCHA | preparar troca de perfil ate checkpoint humano | historico de bloqueio superado |
| Login segundo perfil em retomada posterior | email e senha pre-preenchidos, documento do empreendimento, desafio visual do reCAPTCHA | preencher documento e parar antes do login | historico de bloqueio superado |
| Login segundo perfil com correcao de CNPJ | radio `CNPJ`, documento mascarado, campo `Unidade` com valor `<parCodigo>`, desafio visual do reCAPTCHA | corrigir tipo de documento, preencher CNPJ e concluir login no `fast_path_resume` | concluido |

## Roadmap preliminar de exploracao

### Coberto nesta rodada com perfil gerador

- topologia publica de acesso, avisos e checkpoint anti-bot
- menu autenticado principal e modulos `Manifesto`, `Declaração`, `Certificado` e `Configurações`
- telas de cadastro e consulta abertas ate o ponto anterior a mutacao
- endpoints autenticados de bootstrap, consultas auxiliares e download PDF

### Coberto nesta rodada com perfil destino final

- autenticacao do segundo perfil em `fast_path_resume` usando a mesma sessao ativa
- mapeamento da home autenticada, menus efetivos e restricoes especificas do papel `Destinador/Armazenador Temporário`
- abertura segura dos fluxos de recebimento, manifesto complementar, declaracoes, CDF e configuracoes ate o ponto anterior a mutacao final
- comparacao direta entre a superficie do `destino final` e a cobertura previa do `gerador`
- consolidacao da matriz de dominios por perfil com diferencas funcionais claras

### Residual apos a fase 01

- confirmar fluxos finais dependentes de registros reais no ambiente, como recebimento efetivo, selecao de MTR para complementar, emissao final de CDF e impressoes desta conta
- usar os HARs e a cobertura browser-first desta fase como base para a documentacao final e para qualquer investigacao posterior de payload mutavel

## Checkpoints de risco operacional

- risco anti-bot: reCAPTCHA presente antes do login e efetivamente exigido no browser-first, embora resolvido nesta sessao ativa
- risco de estado parcial do formulario: mitigado no `fast_path_resume` com reaproveitamento da mesma pagina ate o clique unico em `Entrar`
- risco de credenciais: nao persistir e nao copiar segredos para artefatos
- risco de mutacao: fase configurada para parar antes de qualquer envio ou confirmacao
- risco de navegacao ampla: a amostra autenticada do segundo perfil foi concluida, mas varias acoes finais continuam dependentes de registros disponiveis e autorizacao operacional explicita
- risco de acao sensivel: botoes `Enviar`, `Salvar`, `Gerar`, `Alterar Senha` e edicoes de usuario/cadastro foram identificados e deliberadamente nao executados
- risco de integracao de mapa: a tela `Meus Dados` exibiu erro de credenciais do Bing Maps no widget embutido, o que merece acompanhamento tecnico se afetar usuarios do portal

## Decisoes

- Retomar a fase com o CAPTCHA ja liberado pelo usuario e priorizar cobertura ampla sem mutacao do perfil `gerador`.
- Navegar pelas rotas autenticadas por hash/menus apenas ate o ponto anterior a qualquer envio ou confirmacao final.
- Executar somente uma acao de download seguro (`Imprimir listagem de MTRs Provisórios`) por nao representar mutacao irreversivel.
- Interromper novamente a rodada no reaparecimento do reCAPTCHA ao preparar a troca para o perfil `destino final`.
- Reaproveitar a sessao atual sem reload e corrigir o documento do perfil `destino final` para `CNPJ` antes de qualquer nova tentativa de login.
- Nao clicar em `Entrar` enquanto o reCAPTCHA permanecer com ancora nao validada ou desafio visual aberto.
- Acionar o login do perfil `destino final` assim que o botao `Entrar` ficasse habilitado, sem qualquer reinspecao ampla intermediaria.
- Usar navegacao interna por hash para ampliar a cobertura autenticada do segundo perfil sem recarregar a aplicacao.
- Manter os HARs locais como fonte complementar para comparacoes posteriores de payloads finais nao executados nesta rodada.
- Na rodada de enriquecimento, priorizar telas com historico real e acoes seguras de leitura em vez de repetir a navegacao ampla ja consolidada.
- Executar exportacoes seguras em `Minhas DMRs` por serem nao mutaveis e confirmarem endpoints utilitarios adicionais do portal.
- Ampliar o periodo em `Meus CDFs` para validar o comportamento de busca historica mesmo sem retorno de linhas para esta conta.
- Abrir o modal `Selecionar Responsável` na geracao de CDF apenas para confirmar a sobreposicao, a tabela carregada e o endpoint auxiliar, sem selecionar nem salvar.

## Validacoes executadas

- leitura do checkpoint de orquestracao concluida
- leitura do agente desta fase concluida
- acesso real ao portal externo concluido
- inspecao do DOM publico concluida
- inspecao do request inicial de avisos concluida
- correlacao com backend e frontend do SICAT concluida
- retomada da sessao Playwright concluida
- reinspecao da home publica apos fechamento do modal concluida
- confirmacao de autenticacao do perfil `gerador` concluida
- mapeamento de menus autenticados do perfil `gerador` concluido
- cobertura segura das rotas `Manifesto`, `Declaração`, `Certificado` e `Configurações` concluida
- captura de requests autenticados por tela concluida
- download seguro de PDF de listagem de MTR provisório concluido
- tentativa controlada de trocar para o perfil `destino final` concluida
- confirmacao de novo bloqueio por reCAPTCHA para o segundo perfil concluida
- preenchimento seguro do documento do empreendimento do perfil `destino final` concluido
- confirmacao de desafio visual ativo do reCAPTCHA na tentativa do segundo perfil concluida
- correcao do seletor para `CNPJ` no login do perfil `destino final` concluida
- confirmacao de mascara `13.***.***/0001-50` e exibicao da unidade `<parCodigo>` concluida
- confirmacao de ausencia de request de autenticacao adicional enquanto o desafio visual permaneceu aberto concluida
- verificacao minima do estado pronto para login do perfil `destino final` concluida
- autenticacao do perfil `destino final` em `fast_path_resume` concluida
- mapeamento de menus autenticados do perfil `destino final` concluido
- cobertura segura das rotas `Manifesto`, `Declaração`, `Certificado` e `Configurações` do perfil `destino final` concluida
- comparacao estrutural entre `gerador` e `destino final` concluida
- captura de requests autenticados do segundo perfil concluida
- revisitacao de `Minhas DMRs` com historico real concluida
- download seguro de PDF por linha em `Minhas DMRs` concluido
- download seguro de XLS por linha em `Minhas DMRs` concluido
- pesquisa de `Meus CDFs` com periodo ampliado nas duas secoes concluida
- validacao de modal `Selecionar Responsável` na geracao de CDF concluida

## Arquivos alterados

- `docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md`

## Proximo passo requerido do usuario

- Nenhum novo desbloqueio humano e requerido para concluir a fase 01.
- Se o usuario desejar validacao adicional, os proximos passos naturais seriam apenas verificacoes focadas em registros reais ou mutacoes explicitamente autorizadas, fora do escopo desta fase.

## Handoff para a proxima fase

- estado atual: `source_validation_completed`
- proximo agente recomendado: `documentador-mtr`
- motivo: a fase 01 concluiu cobertura autenticada dos perfis `gerador` e `destino final`, consolidou diferencas por papel, mapeou requests e identificou os pontos de parada antes de mutacao.
- observacao operacional: o runtime desta sessao nao expõe chamada direta para `agent/runSubagent`, entao o handoff segue pronto em texto.
- prompt sugerido para a proxima fase:

```text
CONTINUE_DOCUMENTATION. Leia docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md e docs/handoffs/cetesb-platform-complete-navigation/00-orchestration.md. Consolide a documentacao final da navegacao da plataforma CETESB/SIGOR MTR com foco em: cobertura alcançada por perfil (`gerador` vs `destino final`), mapa de menus e telas, fluxos seguros observados ate antes de mutacao, requests/payloads autenticados confirmados, checkpoints humanos encontrados e diferencas funcionais por papel. Registre conclusoes em docs/handoffs/cetesb-platform-complete-navigation/10-documentation-final.md sem persistir segredos.

Considere tambem a rodada adicional de enriquecimento desta fase: filtros por periodo exercitados em `Meus CDFs`, historico real e exportacoes seguras em `Minhas DMRs`, modal `Selecionar Responsável` no fluxo de `Gerar CDF` e a anomalia observada na tentativa segura de `pesquisaManifesto` dentro do formulario de CDF.
```
