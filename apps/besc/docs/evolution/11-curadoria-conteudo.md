---
title: "11 — Curadoria de conteúdo do portal público"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 11 — Curadoria de conteúdo do portal público

> Decisão registrada em [ADR-009](./adr/ADR-009-curadoria-conteudo.md). Posição no plano:
> **Fase 0-C — Curadoria** do [roadmap](./09-roadmap.md) — imediata, urgente e **independente do
> marketplace**. A execução envolve remoção de dados e por isso **requer aprovação explícita do
> operador**; este documento descreve o quê, o porquê e a mecânica exata.

## 1. Contexto e motivação

Em **2026-07-10** o operador anexou um PDF de 1 página ("Alterações na plataforma de tokenização")
com **sete pedidos** de remoção/ajuste no conteúdo ATUAL do portal público. O portal (`/besc`) é
servido **sem login** e está exposto na internet (`dev.nvit.com.br/besc`); tudo que a Biblioteca e a
Jurisprudência publicam é, na prática, publicação aberta.

Duas motivações, ambas independentes do marketplace:

1. **Risco jurídico** — o acervo contém documentos de **terceiros** publicados sem autorização:
   materiais da **Maxxii** (consultoria/ex-empregador do operador, com risco concreto de ação
   judicial) e um contrato particular envolvendo a **Cooperativa Holambra**. Enquanto estiverem no
   ar, o risco corre.
2. **Adequação editorial** — textos informais/opinativos do próprio operador, tabelas de custas
   datadas (2024, SP) que variam por Estado e ano, e vídeos comerciais informais (um deles sobre uma
   operação com o Corinthians que não se concretizou) não condizem com o posicionamento
   institucional que a evolução para marketplace ([00-visao-geral](./00-visao-geral.md)) exigirá.

Manter esse conteúdo "com disclaimer" foi considerado e rejeitado — não elimina o risco jurídico nem
o desalinhamento editorial (alternativas na [ADR-009](./adr/ADR-009-curadoria-conteudo.md)).

## 2. Baseline do acervo (estado atual verificado)

| Coleção | Fonte | Volume |
|---|---|---|
| Biblioteca | `api/seed/library.json` | **18 itens** (IDs `lib_` + sha1(pasta+arquivo).slice(0,12), gerados offline por `api/seed/gen-catalog.mjs`) |
| Jurisprudência | `api/seed/jurisprudence.json` | **100 decisões** (IDs `jur_...`) |
| Enums de conteúdo | `api/src/domain-content.js:8-18` (`library_kind`) | 9 kinds, servidos via `/meta.contentEnums` |
| Referência estática | `api/src/reference/*`, agregada em `api/src/reference/index.js:6-15` e servida em `/meta.reference` (`api/src/server.js:138`) | inclui `notaryFees` (tabela de custas 2024) |
| Binários | PVC `besc-data` (1Gi), `/data/{library,jurisprudence}/<id><ext>` | ~275 MB (PDFs + 4 vídeos) |

O seed é carregado no boot por `seedCatalog()` (`api/src/store.js:174-225`), **version-gated** por
`api/seed/catalog-version.json` (hoje `version: 4`) e **upsert-only** — detalhe decisivo para a
mecânica do §5.

## 3. Os sete pedidos — tabela completa

Legenda de status: **certo** = ação definida, pronta para executar mediante aprovação;
**⚠ aguarda confirmação** = depende de resposta do operador (detalhe no §4).

| # | Pedido do anexo (parafraseado) | Item(ns) de seed | Ação proposta | Status |
|---|---|---|---|---|
| 1 | O "Histórico da incorporação" é um texto informal do próprio operador, com opinião pessoal — não deve seguir publicado | `lib_b963c1cf5cc8` — "Incorporação do BESC pelo Banco do Brasil — histórico" (`INCORPORAÇÃO BESC.pdf`, kind `historia`) | **Remover.** O outro item de kind `historia` — `lib_0390897258c1`, "Aquisição societária do BESC pela União" — aparenta ser documento oficial (Contrato nº 012/98/STN/COAFI entre União e Estado de SC) e **ficaria** | Remoção **certa**; permanência do outro item **⚠ aguarda confirmação** (§4.1) |
| 2 | O documento "Base legal parecer" é da Maxxii (ex-empregador); publicá-lo sem autorização traz risco de ação judicial | `lib_1434a16598e8` — "Considerações e pareceres sobre as ações do BESC" (`Considerações e pareceres sobre BESCs.pdf`, kind `base_legal`; o próprio summary do seed o descreve como "documento da Maxxii Jurídica... material de caráter promocional e argumentativo do escritório") | **Remover** (só voltaria com autorização por escrito da Maxxii) | **Certo**; verificar ainda se `lib_3164299ba869` também é da Maxxii — **⚠ aguarda confirmação** (§4.3) |
| 3 | Custos e honorários de cartório variam por Estado e por ano — inviável manter atualizado; remover | `lib_6d3e54a037f8` — "Honorários do Cartório" + `lib_a2eabef394c7` — "Tabela de custos de cartório 2024" (ambos kind `custos`); **mais** a aba "Custas de cartório" da página Referência (`frontend/src/pages/Referencia.jsx:11` e bloco `:91-107`, dados em `api/src/reference/notary-fees-2024.js`) e a menção na fase C do Roadmap (`frontend/src/pages/Roadmap.jsx:16`) | **Remover os 2 itens da biblioteca E a aba de Referência** (mudança de código, pequena — §6); **ajustar o texto da fase C** do Roadmap | **Certo** |
| 4 | O "Modelo de Petição" mistura documento da Maxxii e contrato particular (Holambra); o laudo deve virar tópico próprio; a petição pode estar incompleta | `lib_50ddd5611b1c` — "Ação BESC de Conversão e Compensação" **e/ou** `lib_cb3e8c6fe5dc` — "Petição inicial com oferecimento de BESCs em caução" (kind `modelo`); `lib_1e83d699fa42` — "Acordo condicional — Central Agrícola e Cooperativa Holambra" (kind `modelo`); `lib_b3a134a8ef9e` — "Laudo de atualização monetária — ações BESC (Airton, 2022, 51.516 ações)" (kind `modelo`) | **Remover o modelo que for da Maxxii** (qual dos dois: §4.2); **remover** o acordo Holambra (contrato particular de terceiros); **reclassificar** o laudo para o novo kind `atualizacao_monetaria` (§6); **verificar a integridade do PDF** da petição restante antes de mantê-la (§7) | Holambra e reclassificação **certos**; identificação do modelo Maxxii **⚠ aguarda confirmação** (§4.2) |
| 5 | Os "Comunicados ao mercado" (Bescval) só interessam aos ~10% de acionistas que aceitaram a troca — remover o tópico | `lib_0bcc663272d6`, `lib_799937c687a3`, `lib_9605c47fefbf` — os 3 itens de kind `comunicado_bacen` (venda das frações, homologação Bacen, prazo de transferência) | **Remover o tópico inteiro** (os 3 itens; o kind `comunicado_bacen` fica vazio — a remoção da chave do enum não foi pedida e não é necessária) | **Certo** |
| 6 | Os "Vídeos explicativos" são comerciais/informais; o vídeo do Corinthians é inconveniente (operação não concretizada) — remover todos | `lib_220fd1b8b1f8`, `lib_2b10a640f1f1`, `lib_4fdc8fc9dcbb`, `lib_c5495adc7443` — todos os 4 itens de kind `video` (MP4, sem transcrição) | **Remover todos** (reprodução profissional fica para o futuro); libera ~208 MB do PVC (§8) | **Certo** |
| 7 | O 1º tópico da Jurisprudência é sobre um carro Onix recebido em permuta — documento salvo no local errado, não é jurisprudência | `jur_fa9d9076166a` — "Documento não jurisprudencial — Certificado de Registro e Licenciamento de Veículo (CRLV)" (`jurisprudencia/Banco do Brasil/CMW0528-1.pdf`; o próprio seed já o marca como não jurisprudencial) | **Remover** | **Certo** |

Cobertura: os 7 pedidos do anexo estão mapeados; nenhum item do anexo ficou sem correspondência no
seed. Resultado projetado: a Biblioteca cai de **18 para 5 itens** (podendo chegar a 2–4, conforme
§4 e §7); a Jurisprudência cai de 100 para 99 decisões.

## 4. Confirmações pendentes do operador (3)

As três confirmações abaixo **não bloqueiam o restante**: os itens certos são removidos desde já; os
incertos permanecem no ar até a resposta. Cada uma está registrada como revisão pendente na
[ADR-009](./adr/ADR-009-curadoria-conteudo.md).

### 4.1 `lib_0390897258c1` ("Aquisição societária do BESC pela União") é oficial e fica?

**DECISÃO — revisar** ([ADR-009](./adr/ADR-009-curadoria-conteudo.md)). Evidência disponível: o
summary/body do seed descreve o Contrato nº 012/98/STN/COAFI de confissão, assunção, consolidação e
refinanciamento de dívidas entre a União e o Estado de Santa Catarina, com interveniência do BESC e
do Banco do Brasil (PDF de 5,4 MB) — tudo indica documento **oficial**, que permaneceria como o
único item do kind `historia` após a remoção do pedido 1. Falta o operador confirmar que é de fato o
contrato oficial (e não outro material informal com título parecido).

### 4.2 Qual dos dois modelos de petição é da Maxxii?

**DECISÃO — revisar** ([ADR-009](./adr/ADR-009-curadoria-conteudo.md)). Evidência disponível: o
summary do seed de `lib_50ddd5611b1c` diz textualmente "Material de consultoria (**Maxxii
Consultoria**)" e o body cita o endereço do escritório (Av. Paulista, 1439, São Paulo) — indício
forte de que **este** é o item a remover. Já `lib_cb3e8c6fe5dc` ("Petição inicial com oferecimento
de BESCs em caução") não menciona a Maxxii no metadado. A decisão final é do operador, que conhece a
origem dos arquivos; a petição que ficar passa pela checagem de integridade do §7.

### 4.3 `lib_3164299ba869` (consolidado de jurisprudência) também é da Maxxii?

**DECISÃO — revisar** ([ADR-009](./adr/ADR-009-curadoria-conteudo.md)). Evidência disponível: é um
`.docx` de síntese (9,7 KB, kind `base_legal`) com tabela de precedentes cuja própria nota interna
admite que "algumas entradas podem ser ilustrativas; conferir". A autoria não está identificada no
metadado do seed. Se for material da Maxxii, segue o destino do pedido 2 (remoção, salvo autorização
por escrito); se for produção própria verificável, pode ficar após conferência das entradas da
tabela contra a aba Jurisprudência (100 decisões reais).

## 5. Mecânica de execução — 3 passos casados

**Por que 3 passos:** `seedCatalog()` só faz **upsert, nunca deleta**
(`api/src/store.js:174-225`; o laço de `upsertColl` em `store.js:187-199` apenas grava
`state[coll][s.id] = {...}` para cada item presente no arquivo de seed). Disso decorrem duas
armadilhas que os passos neutralizam:

- **Deletar só o item vivo não basta**: qualquer bump futuro de versão reaplicaria o seed e
  **ressuscitaria** os itens removidos (tudo que estiver no JSON volta). Além disso, um store vazio
  (PVC novo/recriado) reaplica o seed **mesmo sem bump** — o gate `if (currentVer >= ver.version &&
  hasData) return` (`store.js:184`) só segura quando já há dados.
- **Editar só o seed não basta**: sem o DELETE, o item vivo (e o binário no PVC) continua servido; e
  sem o bump, o seed remanescente não é reprocessado e `catalogMeta` fica dessincronizado do arquivo.

Os três passos, na ordem:

1. **DELETE via API nos itens vivos.** `DELETE /library/:id` (`api/src/server.js:469-473`) e
   `DELETE /jurisprudence/:id` (`api/src/server.js:547-551`). Ambos removem o metadado do store
   **e** o binário do PVC: `deleteLibrary` chama `removeLibraryFile`
   (`api/src/store.js:118-127`) e `deleteJurisprudence` chama `removeJurisFile`
   (`store.js:135-144`). Nota: hoje esses endpoints são **anônimos** (não há auth —
   `api/src/server.js:31-37`); a curadoria usa esse mecanismo por ser o disponível, e a Fase 0 do
   [roadmap](./09-roadmap.md) fecha essa porta.
2. **Remover os itens de `api/seed/library.json` / `jurisprudence.json` + bump de
   `api/seed/catalog-version.json`** (hoje `version: 4` → `5`). A limpeza do seed impede a
   ressurreição (em bump futuro ou store vazio); o bump imediato força o reprocessamento do seed
   remanescente — inofensivo por ser upsert — e deixa `catalogMeta` convergente com o novo estado,
   documentado no git.
3. **Mudanças de código** (Referência, Roadmap, enum — detalhadas no §6), no mesmo PR dos seeds.

A execução é **uma remoção de dados públicos**: pelo [AGENTS.md](../../../../AGENTS.md) da
plataforma, opera-se **com aprovação** do operador, item a item conforme a tabela do §3.

## 6. Mudanças de código associadas

| Mudança | Onde | Detalhe |
|---|---|---|
| Remover a aba "Custas de cartório" | `frontend/src/pages/Referencia.jsx:11` (entrada `custas` no array `TABS`) e o bloco de render `Referencia.jsx:91-107` | A página Referência mantém as demais abas (mecanismos, base legal, histórico, padrão jurisprudencial) |
| Remover a fonte de dados das custas | `api/src/reference/notary-fees-2024.js` (arquivo inteiro) + chave `notaryFees` em `api/src/reference/index.js:4` e `:14` | Deixa de ser servida em `/meta.reference` |
| Ajustar o texto da fase C do Roadmap | `frontend/src/pages/Roadmap.jsx:16` | Hoje diz "Tabela de custas 2024 transcrita como referência" com link para `/referencia` — o texto passa a refletir que custas variam por Estado/ano e que a plataforma não publica tabela estática; o link cai. Na mesma passada, revisar a menção a "custos" no texto da fase A (`Roadmap.jsx:14`), que cita o conteúdo removido |
| Novo kind `atualizacao_monetaria` | `api/src/domain-content.js:8-18` (enum `library_kind`) | Novo par `atualizacao_monetaria: 'Atualização monetária'`; o kind existente `laudo` (`domain-content.js:15`) não atende — o pedido é um **tópico próprio de atualização monetária** (tema), não a natureza documental "laudo pericial" (alternativa registrada na [ADR-009](./adr/ADR-009-curadoria-conteudo.md)) |
| Reclassificar o laudo | `PUT /library/lib_b3a134a8ef9e` com `kind: "atualizacao_monetaria"` (`api/src/server.js:461-467`) **+** mesmo ajuste no `api/seed/library.json` | O PUT grava `editedAt` (`server.js:465`), o que torna o item "propriedade do operador" e faz o seed **ignorá-lo para sempre** (`store.js:190`) — por isso o seed também precisa ser alinhado, senão divergem num rebuild de store |
| Atualizar a descrição do acervo | `apps/besc/CLAUDE.md` (seção "O que é") | Hoje descreve a Biblioteca com "18 docs: ... comunicados Bacen, custos de cartório, petições-modelo, vídeos" — fica defasada após a curadoria |

## 7. Verificação de integridade do PDF da petição restante

O anexo alerta que a petição pode estar **incompleta**. O próprio seed corrobora:
`lib_cb3e8c6fe5dc` é descrito como "**Trecho** de petição inicial" (PDF de 399.228 bytes). Antes de
manter a petição que sobrar do pedido 4 (seja ela `lib_cb3e8c6fe5dc` ou `lib_50ddd5611b1c`, PDF de
3.212.496 bytes), o operador deve abrir o PDF servido em `GET /library/:id/file`
(`api/src/server.js:444-452`) e conferir se o documento está íntegro e completo (todas as páginas,
sem cortes). Se estiver incompleto, **remover também** — um modelo truncado publicado num portal
público é pior do que nenhum.

## 8. Efeito colateral positivo — espaço no PVC

Os 4 vídeos somam **~208 MB** (67.608.706 + 24.669.791 + 70.148.440 + 45.463.930 bytes, conforme
`fileRef.sizeBytes` do seed) — a maior parte dos **~275 MB** de binários do acervo. Somando os PDFs
das remoções certas (~8,5 MB) e a petição da Maxxii, a curadoria libera na ordem de **215–220 MB**
do PVC `besc-data` (1Gi), hoje apontado como subdimensionado no hardening da Fase 0
([09-roadmap](./09-roadmap.md)). A curadoria não substitui o redimensionamento, mas tira a pressão
imediata.

## 9. Posição no roadmap

**Fase 0-C — Curadoria**: executável **imediatamente**, antes mesmo da Fase 0 (fundação), porque é
independente de identidade, Postgres e marketplace — e porque o risco jurídico dos documentos de
terceiros expostos corre **enquanto o conteúdo estiver no ar**. As 3 confirmações do §4 não travam a
fase: o certo remove-se já, o incerto aguarda. Ver [09-roadmap](./09-roadmap.md).

## 10. Changelog de execução (a preencher na execução)

Cada ação executada entra aqui, com evidência (hash do commit dos seeds/código e resposta da API nos
DELETEs). Enquanto não existir trilha de auditoria ([07-trilha-auditoria](./07-trilha-auditoria.md)
— pós-Fase 0), **este changelog + o histórico do git são o registro oficial** da curadoria.

| Data | Passo | Item / arquivo | Ação executada | Evidência |
|---|---|---|---|---|
| _(pendente)_ | 1 | `lib_b963c1cf5cc8` | — | — |
| _(pendente)_ | 1 | `lib_1434a16598e8` | — | — |
| _(pendente)_ | 1 | `lib_6d3e54a037f8`, `lib_a2eabef394c7` | — | — |
| _(pendente)_ | 1 | `lib_1e83d699fa42` | — | — |
| _(pendente)_ | 1 | modelo Maxxii (após §4.2) | — | — |
| _(pendente)_ | 1 | `lib_0bcc663272d6`, `lib_799937c687a3`, `lib_9605c47fefbf` | — | — |
| _(pendente)_ | 1 | `lib_220fd1b8b1f8`, `lib_2b10a640f1f1`, `lib_4fdc8fc9dcbb`, `lib_c5495adc7443` | — | — |
| _(pendente)_ | 1 | `jur_fa9d9076166a` | — | — |
| _(pendente)_ | 2 | `api/seed/{library,jurisprudence}.json` + `catalog-version.json` v4→v5 | — | — |
| _(pendente)_ | 3 | `Referencia.jsx` / `notary-fees-2024.js` / `reference/index.js` / `Roadmap.jsx` / `domain-content.js` | — | — |
| _(pendente)_ | 3 | `PUT /library/lib_b3a134a8ef9e` (kind → `atualizacao_monetaria`) + seed | — | — |
| _(pendente)_ | — | Confirmações §4.1–4.3 respondidas pelo operador | — | — |
| _(pendente)_ | — | Integridade do PDF da petição restante (§7) | — | — |

---
_Decisão e alternativas: [ADR-009](./adr/ADR-009-curadoria-conteudo.md) · Roadmap:
[09-roadmap](./09-roadmap.md) · Trilha futura: [07-trilha-auditoria](./07-trilha-auditoria.md)._
