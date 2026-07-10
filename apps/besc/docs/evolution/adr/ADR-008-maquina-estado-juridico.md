# ADR-008 — Máquina de estado jurídico do título (7 estados, transição exclusiva do Gestor)

Status: DECISÃO — revisar

Contexto: o marketplace precisa que a disponibilidade de cada título para contratação seja
governada pela situação **jurídica** do direito subjacente — algo que a máquina de status atual
do levantamento não faz nem deve fazer (ela mede completude documental e declara explicitamente
que "nenhuma transição afirma mérito jurídico"; status em `api/src/domain.js:392-393`, guard
decisório 409 em `api/src/server.js:373-375`). É preciso um ciclo de vida próprio do ativo, com
efeitos em cascata sobre contratos/aluguéis/treasury e um fluxo definido para o caso extremo em
que o título "cai" em definitivo. Detalhamento completo em
[04-maquina-estado-juridico](../04-maquina-estado-juridico.md).

Decisão: adotar uma máquina de **7 estados** em `security_title.legal_status` — `unjudged`,
`ruled_favorable`, `ruled_against`, `under_appeal`, `reinstated`, `defeated`, `archived` — com
matriz de transições fechada em código (fora da matriz → 409) e verdade no histórico append-only
`legal_status_history` (a coluna no título é denormalização mantida na mesma transação).
**Somente o Gestor transiciona** (`legal_status:transition`, permissão sensível), com `reason` e
`evidence_ref` obrigatórios; integrações futuras (tribunal) apenas **propõem** transição
(`source='court_integration'`), nunca aplicam. A **disponibilidade é derivada, nunca coluna
editável**: `available = legal_status ∈ {unjudged, ruled_favorable, reinstated} AND
listing_status='listed'`. Estado inicial é sempre `unjudged`; situações pré-existentes entram
por transição registrada com evidência. `defeated` dispara o fluxo de resolução por contrato
(substituição preservando o montante travado, sem nova fee; ou write-off "nada além do já
devido"), conforme [04 §5](../04-maquina-estado-juridico.md).

Alternativas rejeitadas:

- **Modelo simplificado `active`/`suspended`/`revoked` (design C)** — colapsa distinções
  jurídicas operacionalmente relevantes (recurso pendente ≠ decisão desfavorável sem recurso;
  reativação ≠ nunca julgado), empobrecendo o catálogo, o disclosure de risco e a trilha.
  **Mapeamento registrado** para preservar os invariantes de receita I1–I7 do design C:
  `suspended ≙ {ruled_against, under_appeal}` e `revoked ≙ defeated` — os invariantes
  permanecem válidos sob essa tradução ([06-modelo-receita](../06-modelo-receita.md)).
- **Transição automática por regressão do case ou por integração externa** — daria poder
  decisório a um motor organizacional/sistema externo sobre estado jurídico sensível; regressão
  do case gera apenas alerta ao Gestor (`case_regressed_after_listing`), nunca transição.
- **Coluna de disponibilidade editável** — um botão "disponibilizar/indisponibilizar" contorna a
  máquina e quebra a auditabilidade; disponibilidade é sempre função derivada do estado jurídico
  + `listing_status`.
- **Reusar a máquina de `case_status` do levantamento** — domínio errado: ela mede completude de
  dossiê e tem transições automáticas por pendência; os dois mundos ficam desacoplados, ligados
  só pelo gate de elegibilidade e pelo alerta de regressão
  ([04 §6](../04-maquina-estado-juridico.md)).

Consequências: fica mais fácil — auditar por que um título estava (in)disponível em qualquer
instante (histórico append-only + disponibilidade derivada); aplicar cascatas consistentes na
mesma transação (suspensão congela obrigações, reativação retoma sem cobrar o intervalo,
`defeated` abre resolução); e provar em perícia quem decidiu o quê com qual evidência. Fica mais
difícil — operar sem Gestor disponível (toda transição é manual por desenho) e evoluir a matriz
de transições (mudança de código + ADR, deliberadamente). Invariantes criados: disponibilidade
derivada; histórico como verdade; transição fora da matriz → 409; evidência obrigatória;
substituição preserva montante sem nova fee; write-off não gera crédito nem devolve pagos.

Revisão pendente: confirmar com o jurídico (1) o **default do prazo de resolução**
(`system_parameters.resolution_window_days`, ex.: 30 dias) e o comportamento no silêncio do
titular (default = write-off, parametrizável); e (2) a **extensão do prazo do lease pelo tempo
suspenso na reativação** (recomendada) versus renegociação caso a caso
([04 §4](../04-maquina-estado-juridico.md)).
