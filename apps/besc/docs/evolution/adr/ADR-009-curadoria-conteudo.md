# ADR-009 — Curadoria de conteúdo do portal público

Status: **DECISÃO — revisar**

## Contexto

O portal BESC é público (sem login, exposto em `dev.nvit.com.br/besc`) e sua Biblioteca
(18 itens em `api/seed/library.json`) publica: material informal/opinativo do próprio operador,
documentos de terceiros sem autorização (**Maxxii** — `lib_1434a16598e8` e um dos modelos de
petição; **Cooperativa Holambra** — `lib_1e83d699fa42`), tabelas de custas de cartório datadas
(2024/SP — `lib_6d3e54a037f8`, `lib_a2eabef394c7`, mais a aba de Referência em
`frontend/src/pages/Referencia.jsx:11`), 3 comunicados Bescval (kind `comunicado_bacen`), 4 vídeos
comerciais informais (~208 MB) e 1 documento não jurisprudencial na Jurisprudência
(`jur_fa9d9076166a`, um CRLV). Pedido formal do operador em PDF anexado de 2026-07-10
("Alterações na plataforma de tokenização"). O seed é upsert-only (`api/src/store.js:174-225`),
o que exige remoção casada em 3 passos (vivo + seed + bump), detalhada no
[doc 11](../11-curadoria-conteudo.md).

## Decisão

Remover do portal público: (a) o conteúdo informal/opinativo do operador (`lib_b963c1cf5cc8`);
(b) os documentos de terceiros publicados sem autorização — Maxxii (`lib_1434a16598e8` + o modelo
de petição que for confirmado como dela) e Holambra (`lib_1e83d699fa42`); (c) as tabelas de custas
datadas (2 itens da biblioteca + aba "Custas de cartório" e `api/src/reference/notary-fees-2024.js`,
com ajuste da fase C de `frontend/src/pages/Roadmap.jsx:16`); (d) os 3 comunicados Bescval;
(e) os 4 vídeos; (f) o item não jurisprudencial `jur_fa9d9076166a`. Reclassificar o laudo
`lib_b3a134a8ef9e` para um **novo kind `atualizacao_monetaria`** no enum `library_kind`
(`api/src/domain-content.js:8-18`), tornando a atualização monetária um tópico próprio. Executar
pela mecânica de 3 passos casados do doc 11, mediante aprovação do operador, com changelog em git.

## Alternativas rejeitadas

- **Manter tudo com disclaimer** — não elimina o risco jurídico (a publicação não autorizada de
  material de terceiros persiste) nem o desalinhamento editorial (opinião pessoal e material
  comercial num portal que precisa se tornar institucional).
- **Manter os documentos da Maxxii sem autorização formal** — rejeitado; só voltam ao ar com
  autorização por escrito da Maxxii.
- **Despublicar só via DELETE na API, sem tocar os seeds** — rejeitado; qualquer bump futuro de
  `catalog-version.json` (ou um store vazio em PVC novo — gate em `api/src/store.js:184`)
  ressuscitaria os itens, pois o seed reaplica tudo que estiver no JSON.
- **Reusar o kind existente `laudo`** (`api/src/domain-content.js:15`) para o laudo do Airton —
  rejeitado; o pedido é um tópico temático próprio ("atualização monetária"), não a natureza
  documental "laudo pericial".

## Consequências

- Biblioteca menor (de 18 para ~5 itens, podendo chegar a 2–4 conforme as confirmações) porém
  **defensável juridicamente** e alinhada ao posicionamento institucional do futuro marketplace.
- Surge o tópico novo **"Atualização monetária"** (kind `atualizacao_monetaria`), que a evolução
  do produto tende a expandir (laudos e metodologia são centrais à precificação de títulos).
- Libera ~215–220 MB do PVC `besc-data` (a maior parte dos ~275 MB de binários), aliviando o PVC
  1Gi subdimensionado até o hardening da Fase 0.
- O kind `comunicado_bacen` fica sem itens (a chave permanece no enum — remoção não pedida).
- A página Referência perde a aba de custas (código removido, não apenas oculto).
- Cria o precedente de **curadoria editorial documentada**: sem trilha de auditoria antes da
  Fase 0, o registro oficial é o changelog do doc 11 + histórico do git; após a Fase 0, operações
  equivalentes geram `audit_event` ([07-trilha-auditoria](../07-trilha-auditoria.md)).

## Revisão pendente

1. Operador confirmar se `lib_0390897258c1` ("Aquisição societária do BESC pela União",
   Contrato nº 012/98/STN/COAFI) é documento oficial e permanece ([doc 11 §4.1](../11-curadoria-conteudo.md)).
2. Operador confirmar **qual** dos dois modelos de petição é da Maxxii — o metadado do seed indica
   `lib_50ddd5611b1c`, mas a palavra final é dele ([doc 11 §4.2](../11-curadoria-conteudo.md)).
3. Operador confirmar se `lib_3164299ba869` (consolidado de jurisprudência, `.docx`) também é da
   Maxxii ([doc 11 §4.3](../11-curadoria-conteudo.md)).
4. Verificar a integridade do PDF da petição restante antes de mantê-la
   ([doc 11 §7](../11-curadoria-conteudo.md)).
5. Eventual **autorização por escrito da Maxxii**, caso o operador queira manter algum material do
   escritório no ar.
