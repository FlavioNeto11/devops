# 01 - Source Validation

## Objetivo da fase

Validar, a partir das HARs CETESB, o fluxo real do SIGOR para:

- recebimento de MTR pelo destinador/destino final;
- geracao de CDF a partir de MTRs recebidos;
- consulta e baixa de CDF ja emitido.

Esta fase nao implementa mudancas no produto. Ela apenas consolida evidencias, fatos observados e incertezas para a proxima fase.

## Fontes analisadas

- `docs/cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har`
- `docs/handoffs/frontend-destinador-receive-cdf-redesign/00-orchestration.md`

## Achados principais

1. O recebimento de MTR no SIGOR nao acontece no detalhe local do manifesto apenas como exibicao passiva. A HAR mostra um fluxo ativo de abrir manifesto, carregar responsaveis de recebimento e enviar um `POST` de recebimento com data, responsavel selecionado e quantidades recebidas.
2. A geracao de CDF e um fluxo proprio baseado em pesquisa de MTRs recebidos, filtrados por periodo, destinador e gerador, seguido de envio de um payload com `listaManifesto` para criar o certificado.
3. A baixa de CDF ocorre por uma pesquisa/listagem separada de certificados ja emitidos. A HAR de baixa nao mostra a emissao do certificado, mas mostra claramente a consulta de registros de `certificadoDestinacao` do tipo `CDF`.
4. Os MTRs retornados para geracao de CDF ja aparecem com `situacaoManifesto.simDescricao = "Recebido"`, o que reforca que a geracao parte de manifestos previamente recebidos.
5. Nao foi encontrada, nas HARs analisadas, uma evidencia direta da regra "um MTR nao pode estar em mais de um CDF ao mesmo tempo". Essa regra continua plausivel pelo fluxo desejado, mas permanece como inferencia de negocio e precisa ser consolidada na fase de regras operacionais.
6. A baixa efetiva do CDF observado usa um endpoint dedicado de impressao por hash e retorna `application/pdf`, nao apenas uma listagem textual de certificados.

## Evidencias extraidas

### 1. Recebimento de MTR

#### Evidencia explicita do recebimento

- A tela chama funcao frontend `n.receberMtr` e consulta o manifesto por id:
  - `GET /api/mtr/manifesto/22868025`
- Antes do envio, o sistema carrega a lista de responsaveis de recebimento do destinador:
  - `GET /api/mtr/manifesto/listaResponsavelRecebimento/40110`
- A resposta da lista de responsaveis retorna objetos com estrutura de responsavel de recebimento, incluindo:
  - `rrmCodigo`
  - `rrmNome`
  - `rrmCargo`
  - `parCodigo`
  - `rrmAssinatura`
- O envio efetivo do recebimento ocorre via:
  - `POST /api/mtr/manifesto/recebimento/`
- O payload enviado inclui, no minimo:
  - `remDataRecebimento`
  - `remObservacao`
  - `paaCodigo`
  - `rrmCodigo`
  - `manifesto.manCodigo`
  - `manifesto.listaManifestoResiduo[].marQuantidadeRecebida`
- A resposta observada do backend foi:
  - `{"mensagem":"Manifesto recebido com sucesso!","objetoResposta":null,"erro":false}`

#### Fluxo operacional consolidado do recebimento

1. O destinador seleciona um manifesto para receber.
2. O frontend busca os dados completos do manifesto.
3. O frontend carrega a lista de responsaveis de recebimento do parceiro destinador.
4. O usuario informa a data de recebimento, escolhe o responsavel e confirma as quantidades recebidas por residuo.
5. O frontend envia o recebimento para `POST /api/mtr/manifesto/recebimento/`.
6. A operacao retorna sucesso textual e, na pesquisa posterior, o manifesto passa a aparecer como `Recebido`.

#### Evidencia de estado apos recebimento

- Na HAR de geracao de CDF, a pesquisa de manifestos aptos retorna itens com:
  - `situacaoManifesto.simCodigo = 3`
  - `situacaoManifesto.simDescricao = "Recebido"`

### 2. Geracao de CDF

#### Evidencia explicita da geracao

- A HAR mostra carregamento de responsavel do destinador:
  - `GET /api/mtr/responsavel/40110`
- A resposta observada retorna responsaveis com campos como:
  - `cdrCodigo`
  - `cdrNome`
  - `cdrEmail`
  - `cdrCargo`
  - `cdrAtivo`
  - `cdrAssinatura`
- A pesquisa dos MTRs para compor o CDF ocorre via:
  - `POST /api/mtr/pesquisaManifestoRecebidoCertificado/40110/9/17-04-2026/17-04-2026/0`
- O payload observado nessa pesquisa foi uma lista de geradores selecionados. No trecho capturado, havia um gerador especifico dentro de um array JSON.
- A resposta da pesquisa retorna manifestos com:
  - `manCodigo`
  - `manNumero`
  - `parceiroGerador`
  - `parceiroDestinador`
  - `situacaoManifesto.simDescricao = "Recebido"`
  - `cdfEmitidoNumero = null`
- A criacao do certificado ocorre via:
  - `POST /api/mtr/certificadoDestinacao/`
- O payload observado para criacao inclui, no minimo:
  - `cerData`
  - `cerDataInicial`
  - `cerDataFinal`
  - `cerObservacao`
  - `parceiroAcessoResponsavel`
  - `parceiroDestinador.parCodigo = 40110`
  - `parceiroAcesso`
  - `tipoCertificadoDestinacao = 1`
  - `listaManifesto` com os MTRs selecionados
  - `responsavel` com dados do responsavel selecionado
- A resposta observada da criacao foi:
  - `{"mensagem":"Certificado criado com sucesso","objetoResposta":null,"erro":false}`

#### Fluxo operacional consolidado da geracao

1. O destinador acessa uma tela propria de geracao de certificado.
2. O frontend carrega os responsaveis disponiveis do parceiro destinador.
3. O usuario filtra por periodo e, adicionalmente, por gerador selecionado.
4. O frontend pesquisa manifestos recebidos aptos a compor certificado.
5. O usuario seleciona um ou mais MTRs da lista retornada.
6. O frontend envia um `POST /api/mtr/certificadoDestinacao/` com metadados do certificado, responsavel e `listaManifesto` selecionada.
7. O backend retorna sucesso textual de criacao do certificado.

### 3. Consulta e baixa de CDF

#### Evidencia explicita

- A HAR de baixa mostra uma funcao frontend dedicada:
  - `n.pesquisaCdfDestinador`
- A consulta observada ocorre via:
  - `GET /api/mtr/certificadoDestinacao/9/40110/0/all/17-04-2026/17-04-2026`
- A resposta observada retorna registros de certificado com estrutura contendo, no minimo:
  - `cerCodigo`
  - `cerData`
  - `cerDataInicial`
  - `cerDataFinal`
  - `cerObservacao`
  - `cerHashCode`
  - `parceiroDestinador`
  - `parceiroGerador`
  - `parceiroAcesso`
  - `tipoCertificadoDestinacao.tcdCodigo = 1`
  - `tipoCertificadoDestinacao.tcdDescricao = "CDF"`
  - `responsavel` com identificacao do responsavel associado ao certificado
- A baixa/impressao efetiva observada ocorre via:
  - `GET /api/mtr/imprimir/imprimeCertificado/{cerHashCode}`
- A resposta dessa chamada retorna:
  - `200`
  - `Content-Type: application/pdf`

#### Fluxo operacional consolidado

1. O destinador acessa uma tela separada de pesquisa de certificados.
2. O frontend envia consulta por periodo e demais filtros codificados na rota de `certificadoDestinacao`.
3. O backend retorna uma lista de certificados emitidos do tipo `CDF`.
4. O frontend usa o `cerHashCode` retornado na listagem para chamar o endpoint de impressao do certificado.
5. O resultado observado dessa chamada e um PDF do CDF ja emitido.

#### Limite da evidencia

- A HAR de baixa comprova pesquisa/listagem e download PDF por hash.
- O trecho analisado nao esclarece o significado semantico dos segmentos posicionais `9`, `0` e `all` presentes na rota de listagem.

## Contratos e interfaces relevantes

- `GET /api/mtr/manifesto/listaResponsavelRecebimento/{parCodigo}`
  - finalidade: listar responsaveis de recebimento do destinador
- `GET /api/mtr/manifesto/{manCodigo}`
  - finalidade: carregar manifesto para recebimento
- `POST /api/mtr/manifesto/recebimento/`
  - finalidade: confirmar recebimento do MTR
- `GET /api/mtr/responsavel/{parCodigo}`
  - finalidade: listar responsaveis usados na geracao de CDF
- `POST /api/mtr/pesquisaManifestoRecebidoCertificado/{parCodigo}/{...}`
  - finalidade: listar MTRs recebidos aptos para compor o certificado
- `POST /api/mtr/certificadoDestinacao/`
  - finalidade: criar certificado de destinacao
- `GET /api/mtr/certificadoDestinacao/{...}`
  - finalidade: listar certificados emitidos para consulta/baixa

## Payloads estruturais relevantes

### Recebimento

```json
{
  "remDataRecebimento": "...",
  "remObservacao": "",
  "paaCodigo": 57380,
  "rrmCodigo": 3960,
  "manifesto": {
    "manCodigo": 22868025,
    "listaManifestoResiduo": [
      {
        "marCodigo": 26707757,
        "marQuantidadeRecebida": 11.48
      }
    ]
  }
}
```

### Pesquisa de MTRs para CDF

```json
[
  {
    "parCodigo": 179808,
    "parDescricao": "<gerador selecionado>"
  }
]
```

### Criacao de CDF

```json
{
  "cerData": "...",
  "cerDataInicial": "...",
  "cerDataFinal": "...",
  "cerObservacao": "",
  "parceiroDestinador": {
    "parCodigo": 40110
  },
  "parceiroAcesso": {
    "paaCodigo": 57380
  },
  "tipoCertificadoDestinacao": 1,
  "listaManifesto": [
    {
      "manCodigo": 22867921
    },
    {
      "manCodigo": 22868025
    }
  ],
  "responsavel": {
    "cdrCodigo": 3209
  }
}
```

## Respostas observadas

- Recebimento:
  - `Manifesto recebido com sucesso!`
- Criacao de certificado:
  - `Certificado criado com sucesso`
- Pesquisa de manifestos recebidos para certificado:
  - retorna lista de MTRs em situacao `Recebido`
- Pesquisa de certificados:
  - retorna lista de certificados com `tipoCertificadoDestinacao = CDF`

## Fatos vs inferencias

### Fatos sustentados diretamente pelas HARs

- Existe carregamento de responsavel de recebimento antes do `POST` de recebimento.
- Existe recebimento formalizado por `POST /api/mtr/manifesto/recebimento/`.
- Existe pesquisa de MTR recebido para gerar certificado, separada do endpoint de criacao.
- Existe criacao de certificado por `POST /api/mtr/certificadoDestinacao/` com `listaManifesto`.
- Existe pesquisa separada de certificados emitidos do tipo `CDF` para consulta/baixa.
- Os MTRs usados na geracao capturada estavam em situacao `Recebido`.

### Inferencias que ainda precisam de consolidacao

- Que o frontend deve obrigatoriamente permitir recebimento em lote em um unico envio. As HARs aqui comprovam o recebimento individual com estrutura compativel com itens de residuo, mas nao mostram um `POST` unico contendo varios manifestos ao mesmo tempo.
- Que um mesmo MTR nao pode pertencer a mais de um CDF simultaneamente. A ausencia de `cdfEmitidoNumero` nos registros pesquisados sugere criterio de elegibilidade, mas nao prova sozinha a regra completa de exclusividade.

## Dados sensiveis a sanitizar

- nomes de pessoas fisicas retornados nas HARs
- e-mails de responsaveis
- assinaturas em base64/imagem (`rrmAssinatura`, `cdrAssinatura`)
- identificadores e hashcodes de manifesto/certificado quando nao forem necessarios para regra de negocio

## Decisoes da fase

- Usar as HARs como fonte primaria de verdade para o fluxo operacional.
- Tratar os prints mencionados na orquestracao apenas como contexto visual, porque os arquivos de imagem do SIGOR nao estavam disponiveis no workspace desta fase.
- Separar explicitamente listagem/pesquisa, acao de recebimento e acao de geracao de CDF como fluxos distintos.
- Levar para a fase seguinte a validacao da regra de exclusividade de MTR em CDF e da extensao real de recebimento em lote.

## Incertezas abertas

- comportamento exato para recebimento em lote no SIGOR real
- regra definitiva de exclusividade de MTR em CDF no dominio

## Handoff para a proxima fase

Proximo agente recomendado: `manifestos-operacional-mtr`

Objetivo do proximo agente:

- transformar estes achados em regras operacionais fechadas para frontend;
- decidir o que e garantido para recebimento individual vs lote;
- consolidar a regra de elegibilidade/exclusividade de MTR para CDF;
- definir quais restricoes devem aparecer na UX sem inventar comportamento nao comprovado.

Prompt sugerido para continuidade:

```text
work_id: frontend-destinador-receive-cdf-redesign

Considere o checkpoint docs/handoffs/frontend-destinador-receive-cdf-redesign/01-source-validation.md como fonte atual da fase 01.

Objetivo da fase 05-domain-rules:
- consolidar regras operacionais para o frontend do destinador/destino final;
- fechar a diferenca entre fatos comprovados nas HARs e inferencias ainda abertas;
- decidir a regra de elegibilidade de MTR para CDF, incluindo exclusividade em CDF e impacto na UX;
- definir se recebimento em lote e obrigatorio, opcional ou apenas desejado pela UX local.

Nao implemente codigo ainda. Produza o checkpoint 05-domain-rules.md com regras fechadas, restricoes, riscos e orientacoes para a fase frontend.
```
