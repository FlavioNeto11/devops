# 10 - Documentation Final

## Objetivo

Consolidar um handoff reutilizavel da navegacao auditada na plataforma SIGOR MTR com base apenas na cobertura comprovada em runtime para os perfis `gerador` e `destino final`, sem persistir segredos, sem manter identificadores operacionais completos em artefatos versionados e sem extrapolar alem dos checkpoints anteriores.

## Escopo efetivamente coberto

- portal publico `https://mtr.cetesb.sp.gov.br/#/`
- autenticacao assistida por checkpoint humano de reCAPTCHA
- area autenticada com os perfis `gerador` e `Destinador/Armazenador Temporário`
- modulos `Manifesto`, `Declaração`, `Certificado`, `Configurações` e `Ajuda`
- requests de bootstrap, consultas autenticadas, filtros com datas reais, listagens historicas e downloads seguros sem mutacao
- comparacao funcional entre os dois perfis ate antes de qualquer mutacao final

## Mapa geral da plataforma

| Area | Superficie confirmada | Observacao operacional |
| --- | --- | --- |
| Publica | home, modal `AVISOS`, login, recuperacao de senha, primeiro acesso, links de ajuda | ponto de entrada unico; reCAPTCHA antecede login browser-first |
| Sessao autenticada | home interna, cabecalho com contexto do empreendimento/unidade, menu lateral | landing interna atua como hub de navegacao, sem dashboard rico observado |
| Manifesto | criacao, listagem, relatorios, provisórios, recebimento e complementar por papel | maior variacao funcional entre perfis |
| Declaração | nova DMR por papel, DMR pendente, listagem historica | papel altera origem dos dados e semantica operacional |
| Certificado | consulta e geracao de CDF em cenarios distintos | `destino final` expande a superficie de geracao |
| Configurações | meus dados, usuarios, alterar senha | telas de administracao local do empreendimento |

## Area publica vs area autenticada

### Area publica confirmada

- modal recorrente `AVISOS` com comunicados operacionais
- formulario com `Email`, `Senha`, seletor `CNPJ/CPF`, documento do empreendimento, campo `Unidade` apos resolucao do documento e botao `Entrar`
- links publicos para manual, FAQ, cadastro inicial e recuperacao de senha
- reCAPTCHA visivel no frontend web com ancora, `g-recaptcha-response` e, em retomadas, desafio visual ativo

### Area autenticada confirmada

- cabecalho com empreendimento/unidade, usuario, perfil ativo e ultimo login
- menu lateral com modulos principais `Home`, `Manifesto`, `Declaração`, `Certificado`, `Configurações` e `Ajuda`
- variacao de submenus e fluxos conforme o papel autenticado
- formularios amplos com forte dependencia de `parCodigo` e consultas auxiliares para bootstrap

## Comparacao de perfis

| Tema | Gerador | Destino final |
| --- | --- | --- |
| Perfil exibido | `Gerador` | `Destinador/Armazenador Temporário` |
| Home interna | mesmo padrrao estrutural | mesmo padrrao estrutural |
| Manifesto | `Novo MTR`, `Cadastrar ou Editar Modelo do MTR`, `Meus MTRs`, `Relatório dos MTRs`, `MTRs Provisórios` | `Meus MTRs`, `Relatório dos MTRs`, `MTR Complementar para Armazenamento Temporário`, `Relatório de MTRs em Armazenamento Temporário` |
| Recebimento | nao observado como fluxo principal | possui recebimento por codigo de barras e recebimento de MTR provisório |
| DMR | `Nova DMR - Gerador` com estrutura vazia para trabalho manual | `Nova DMR - Destinador` com inventario e linhas reais renderizadas |
| CDF | consulta em `Meus CDFs` | consulta em `Meus CDFs` e tres fluxos de geracao |
| Configuracoes | mesmos modulos base | mesmos modulos base; cadastro confirma perfis de destinador e armazenador |

Leitura operacional: o `gerador` concentra criacao e preparacao do manifesto; o `destino final` concentra recebimento, complementar de armazenamento temporario, inventario e emissao de CDF.

## Menus, telas, componentes e acoes confirmadas

| Fluxo | Componentes centrais confirmados | Acoes seguras executadas |
| --- | --- | --- |
| Home publica | modal, login, seletor `CNPJ/CPF`, reCAPTCHA, links de ajuda | fechar avisos, inspecionar formulario |
| Login do segundo perfil | radio `CNPJ`, documento mascarado, `Unidade`, botao `Entrar` | preparar e concluir login somente apos habilitacao do botao |
| Home autenticada | cabecalho contextual e menu lateral | validar perfil, menus e contexto |
| Cadastro Manifesto | blocos de gerador, transportador, destinador, residuos e observacoes | abrir e inspecionar pre-preenchimento |
| Cadastro Modelo Manifesto | nome do modelo, contrapartes, residuos | abrir e localizar acoes de busca e novo modelo |
| Meus MTRs | filtros, tabelas e, no destino final, recebimento sensivel | abrir listagens e validar secoes por papel |
| Relatorios de MTR | datas, papel pesquisado e filtros de contraparte | abrir ate antes de gerar |
| MTRs Provisorios | quantidade, listagem e impressao | imprimir listagem com download seguro de PDF |
| DMR | periodo, responsavel legal, tabela de residuos, listagens | abrir criacao, pendencia e historico sem salvar |
| CDF | filtros, pesquisa de gerador, pesquisa de MTR, responsavel tecnico | abrir consultas e geracoes ate antes de salvar |
| Configuracoes | cadastro, tabela de usuarios, formulario de senha | abrir telas sem editar nem gravar |

## Enriquecimento confirmado nesta rodada

### Filtros e intervalos realmente exercitados

- `Meus CDFs` foi executado nas duas grades, `CDFs como Destinador` e `CDFs como Gerador`.
- O intervalo padrao curto foi ampliado manualmente para `01/01/2021` ate `19/04/2026` nas duas secoes.
- Os dois botoes `Pesquisa` foram acionados sem filtros textuais adicionais.
- O resultado permaneceu `Nenhum registro encontrado` nas duas grades; a evidência valida a interacao de filtro, nao a existencia de massa para CDF nessa conta.
- Em `Meus MTRs`, a rodada adicional nao produziu nova massa acima do estado vazio ja comprovado; o handoff preserva apenas esse limite como cobertura valida.

### Listas e historico com dados reais

- `Minhas DMRs` deixou de ser apenas tela estrutural e passou a ter massa historica confirmada.
- A tabela `Lista de DMRs` renderizou seis linhas visiveis nesta rodada.
- Todas as linhas visiveis estavam com situacao `Declaração Enviada`.
- O periodo observado nas linhas visiveis ficou entre `2021` e `2022`.
- As colunas efetivamente exercitadas foram `Número`, `Data Inicial`, `Data Final`, `Declarante`, `Situação` e `Ações`.

### Downloads e exportacoes seguras efetivamente executados

- `MTRs Provisórios`: download seguro do PDF `listagemManifestoProvisorio.pdf` ja confirmado na rodada anterior.
- `Minhas DMRs`: a acao por linha `Imprimir DMR` gerou download local do PDF `decaracao_manifesto.pdf`.
- `Minhas DMRs`: a acao por linha `Imprimir DMR em planilha` gerou download local do arquivo `declaracao_manifesto.xlsx`.
- Essas exportacoes foram observadas como nao mutaveis: sem popup de confirmacao irreversivel, sem alteracao de dados e sem novo checkpoint humano.

### Popup, modal e fluxo de detalhe observados

- `Cadastro Certificado de Destinação Final` foi revisitado como fluxo rico de leitura.
- O botao `Selecionar Responsável Técnico` abriu o dialogo real `Selecionar Responsável`.
- O modal carregou uma grade `Lista de Responsáveis` com uma linha visivel em runtime.
- As colunas observadas no modal foram `Responsável`, `Cargo`, `Registro` e `Ações`.
- As acoes visiveis nessa linha foram `Editar` e `Selecionar`, mas nenhuma foi executada.
- O botao `Salvar` do formulario principal permaneceu desabilitado durante a observacao, mantendo o gate de nao mutacao.

## Cobertura segura atingida vs gates de mutacao

### Cobertura segura atingida

- autenticacao real dos dois perfis
- abertura e inspeção das telas principais por dominio
- comparacao de menus e restricoes por papel
- captura de requests autenticados de bootstrap e consulta
- downloads seguros nao mutaveis ja comprovados em PDF e planilha, incluindo provisórios e historico de DMR

### Intencionalmente nao executado

- `Enviar`, `Salvar`, `Gerar`, `Alterar Senha` e acoes equivalentes de confirmacao final
- recebimento efetivo de MTR por codigo de barras ou provisório
- selecao real de MTR para manifesto complementar
- emissao final de CDF em qualquer variante
- alteracoes cadastrais, usuarios ou senha
- geracoes finais de relatorio dependentes de clique sensivel ou de registros reais

Motivo: a auditoria foi conduzida com `stop_before_mutation: sim` e sem autorizacao para operacoes irreversiveis ou sensiveis.

## Requests e padroes de payload confirmados

### Bootstrap publico

- `GET /api/cadastro/pesquisaPainelAvisos`

### Login autenticado confirmado em runtime

- `POST /api/mtr/carregaDadosLogin`
- contrato confirmado no browser-first e coerente com o SICAT:

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

### Padroes de consulta autenticada observados

- parceiro e resolucao de contexto: `GET /api/mtr/consultaParceiro/J/<documento>`, `GET /api/mtr/pesquisaParceiroByCodigo/<parCodigo>`, `GET /api/unidades`
- bootstrap de formularios: `GET /api/classes`, `GET /api/residuo/*`, `GET /api/estados`, `GET /api/parceiroTipoParceiros`, `GET /api/orgaoEmissor`
- manifesto e recebimento: `GET /api/mtr/manifesto/provisorio/<parCodigo>/...`, `GET /api/mtr/manifesto/listaResponsavelRecebimento/<parCodigo>`
- declaracao: `GET /api/mtr/declaracao/carrega/<cadastroCodigo>/<parCodigo>/<papel>/0`, `GET /api/mtr/declaracao/<parCodigo>`
- cadastro/acesso: `GET /api/mtr/editaCadastro/<cadastroCodigo>`, `GET /api/mtr/acesso/parceiro/<parCodigo>`
- download comprovado: `POST /api/relatorio/download/6`

### Padroes adicionais confirmados na rodada enriquecida

- exportacao por linha em `Minhas DMRs`: `GET /api/mtr/imprimir/imprimeDmr/<dmrCodigo>/2` para PDF e `GET /api/mtr/geraDmrXls/<dmrCodigo>` para planilha
- consulta de CDF serializa papel e periodo no proprio path: `GET /api/mtr/certificadoDestinacao/9/<parCodigo>/0/all/01-01-2021/19-04-2026` para `Destinador` e `GET /api/mtr/certificadoDestinacao/8/<parCodigo>/0/all/01-01-2021/19-04-2026` para `Gerador`
- o contrato de datas observado nessas consultas ficou em `dd-mm-aaaa`, mesmo quando o preenchimento visivel na tela estava em formato local com barras
- a selecao de responsavel tecnico usa consulta dedicada previa ao clique mutavel: `GET /api/mtr/responsavel/<parCodigo>`
- a pesquisa segura de manifesto a partir do formulario de CDF acionou `GET /api/mtr/pesquisaManifesto/<parCodigo>/26/9/01-01-2025/19-04-2026/0/all` com retorno `404 Not Found`; isso confirma que o frontend tenta resolver massa elegivel antes de qualquer salvamento e que ausencia de registros retorna erro de negocio, nao mutacao parcial

Leitura operacional: a plataforma autentica uma vez e passa a derivar a maior parte dos fluxos com `parCodigo`, variando o papel e o formulario carregado por endpoint.

## Pontos de correlacao ja evidenciados no SICAT

- `src/services/auth-service.ts` monta e envia o contrato de login CETESB com `login`, `senha`, `email`, `parCodigo` e `recaptcha`.
- `src/gateways/cetesb-gateway.js` centraliza `/api/mtr/carregaDadosLogin`, reutiliza `parCodigo` nas consultas operacionais e aceita `recaptcha` como string opcional.
- `src/lib/config.ts` separa explicitamente portal web e API remota CETESB.
- `frontend/src/views/CetesbAccountSelectionView.vue` expõe `email`, `partnerCode` e `reCAPTCHA token (opcional)` no fluxo do SICAT.
- `frontend/src/components/ManifestCreateForm.vue` e `frontend/src/composables/useCetesbOperationalFlows.js` reforcam a dependencia de `partnerCode/parCodigo` em manifesto e fluxos operacionais.
- `src/lib/cetesb-source-of-truth.ts` ja referencia HARs canonicos para login, recebimento de manifesto, geracao/download de CDF e envio cadastral.

Leitura operacional: a auditoria browser-first confirmou que o contrato modelado no SICAT esta alinhado ao portal remoto, mas o portal oficial continua impondo checkpoint humano visual de reCAPTCHA antes do login interativo.

## Riscos, checkpoints humanos e issues do portal

- reCAPTCHA e checkpoint humano real antes do login; pode reaparecer na troca de perfil e evoluir para desafio visual.
- cobertura mutavel continua dependente de autorizacao explicita e, em varios casos, de registros reais disponiveis na conta.
- o widget Bing Maps em `Meus Dados` exibiu erro de credenciais invalidas em ambos os perfis, sem bloquear a tela, mas com risco de UX e de dependencia externa degradada.
- varias telas renderizaram listagens vazias; isso limita validacao de acoes finais sem massa de dados apropriada.
- o reaproveitamento da mesma sessao sem reload foi importante para concluir o login do segundo perfil com menor atrito operacional.

## Checkpoints humanos recomendados para futuras rodadas

- validar disponibilidade de massa real antes de testar recebimento, complementar ou emissao final
- confirmar explicitamente permissao do operador antes de qualquer clique mutavel
- preservar a mesma sessao quando houver checkpoint de reCAPTCHA ja resolvido
- tratar downloads, impressoes e acoes com efeito externo como verificacoes separadas
- separar validacao de filtros com resposta vazia da validacao de fluxos com massa historica, porque o portal aceita o request completo mesmo sem registros retornados

## Roadmap opcional de exploracao residual

1. Priorizar uma conta ou periodo com massa real em `Meus MTRs` e `Meus CDFs`, porque os filtros e endpoints ja ficaram comprovados, mas a cobertura funcional continua limitada pela ausencia de registros.
2. Validar fluxos finais de recebimento de MTR e MTR provisório com autorizacao explicita e registros reais.
3. Cobrir a selecao completa de manifesto complementar para armazenamento temporario, agora com foco no encadeamento entre pesquisa de manifesto elegivel e lista resultante.
4. Exercitar as tres variantes de emissao de CDF ate o ponto imediatamente anterior ao envio final ou, se autorizado, ate conclusao auditada, incluindo o modal de responsavel tecnico ja confirmado.
5. Cruzar os HARs canonicos com os endpoints agora observados em historico, exportacao por linha e consulta de CDF por papel para fechar payloads mutaveis ainda nao executados em browser-first.

## Conclusao operacional

A plataforma ficou mapeada com cobertura autenticada suficiente para dois papeis operacionais centrais. A fronteira funcional esta clara: `gerador` cria e prepara; `destino final` recebe, inventaria, complementa e emite certificados. O SICAT ja reflete os principais contratos de autenticacao e correlacao por `parCodigo`, enquanto o principal limitador de automacao browser-first continua sendo o reCAPTCHA e os gates deliberados de nao mutacao.
