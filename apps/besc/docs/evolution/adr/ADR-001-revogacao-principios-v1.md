# ADR-001 — Revogação dos princípios P2–P5 do ESCOPO-FUNCIONAL v1

Status: proposta

Contexto: o `ESCOPO-FUNCIONAL.md` v1 (baseline do produto, 1586 linhas) declara em §1.2 quatro
princípios estruturais que definem o BESC como ferramenta de levantamento: **P2 — Sem login**,
**P3 — Sem pagamento**, **P4 — Sem blockchain** e **P5 — Não tokeniza de verdade**
(`ESCOPO-FUNCIONAL.md:33-36`). O código atual é fiel a eles: nenhum middleware de auth e CORS `*`
(`api/src/server.js:31-37`), nenhuma primitiva monetária ou de token em qualquer camada, e o
checklist de tokenização é formulário de diligência, não configuração executável
(`api/src/domain.js:172-195`). A evolução para marketplace de ações tokenizadas
([00-visao-geral](../00-visao-geral.md)) é incompatível com os quatro. O próprio v1 já previa a
superação: o §10.4 lista auth/SSO + RBAC, tokenização real, custódia e trilha de auditoria fina
como roadmap pós-MVP (`ESCOPO-FUNCIONAL.md:1570`), e a tela de roadmap declara a fase F
(governança/login) *diferida* e a fase G (trilho on-chain) *fora do escopo atual*
(`frontend/src/pages/Roadmap.jsx:19-20`).

Decisão: **revogar deliberadamente os princípios P2, P3, P4 e P5 do ESCOPO-FUNCIONAL.md v1 para o
escopo da evolução marketplace.** P2 cede a identidade OIDC + RBAC em dados
([ADR-004](./ADR-004-identidade-realm-besc-oidc-kit.md), [01-rbac-permissoes](../01-rbac-permissoes.md));
P3 cede ao modelo de receita fee + aluguel sem gateway ([ADR-006](./ADR-006-receita.md),
[06-modelo-receita](../06-modelo-receita.md)); P4 cede à camada de ledger abstraída — simulada
primeiro, Besu permissionado depois ([ADR-005](./ADR-005-ledger-port-besu-erc3643.md),
[05-camada-ledger-blockchain](../05-camada-ledger-blockchain.md)); P5 cede à tokenização real de
títulos — condicionada ao gate regulatório ([ADR-007](./ADR-007-gate-regulatorio-bloqueante.md),
[10-gate-regulatorio](../10-gate-regulatorio.md)). A revogação vale para o produto-marketplace; o
**v1 permanece vigente como especificação do módulo de levantamento**, que continua operando como
fonte dos títulos, e `ESCOPO-FUNCIONAL.md` não é editado — permanece como baseline histórica e
referenciada. Os princípios P1, P6, P7 e P8 do v1 **não** são revogados; P8 ("não conclui
juridicamente") é inclusive promovido a trava de plataforma pelo gate regulatório.

Alternativas rejeitadas:
- **Manter o v1 intacto e criar um produto/app separado para o marketplace** — duplicaria o dossiê
  de levantamento (a origem dos títulos é o case) e o acervo público, criando dois deploys e duas
  fontes de verdade para o mesmo domínio.
- **Emendar o ESCOPO-FUNCIONAL.md in-place (editar P2–P5)** — apagaria a história do escopo do
  levantamento, que continua sendo a especificação vigente daquele módulo; a revogação explícita em
  ADR preserva a rastreabilidade de por que e quando cada princípio caiu.
- **Revogar também P6–P8** — sem necessidade: evidência por afirmação, saída acionável e "não
  conclui juridicamente" continuam corretos e são reforçados pela evolução (evidência obrigatória
  nas transições jurídicas; pareceres externos no gate).
- **Revogação implícita (só ir construindo por cima)** — deixaria todo doc novo em contradição
  silenciosa com a baseline; a regra do plano é que nenhum doc contradiz o v1 sem citar esta ADR.

Consequências:
- Fica fácil: qualquer documento da evolução pode assumir login, receita, ledger e tokenização sem
  re-justificar caso a caso — basta citar esta ADR. A verificação do entregável ("nenhum doc
  contradiz o v1 sem citar ADR-001") vira um grep.
- Fica explícito o custo de compatibilidade: a única quebra para o operador atual é `/casos` (e
  toda escrita da API) passar a exigir login de Gestor; o portal de conhecimento permanece público
  em leitura.
- O módulo de levantamento ganha um consumidor novo (o gate de elegibilidade case→título) mas seu
  motor de pendências/risco/status não muda — invariante de convivência registrada em
  [ADR-002](./ADR-002-postgres-e-convivencia-json.md).
- Cria a obrigação do gate regulatório: revogar P3/P4/P5 **não** autoriza operação real — emissão,
  investidor apto e fatura fora de piloto continuam recusados em código enquanto
  `go_live_enabled=false` ([ADR-007](./ADR-007-gate-regulatorio-bloqueante.md)).

Revisão pendente: aprovação formal do plano de evolução pelo operador (Flavio) — esta ADR não tem
alternativa em aberto, mas só passa a `aceita` junto com a aprovação do conjunto
([00-visao-geral](../00-visao-geral.md)); a assessoria jurídica valida, no gate, as consequências
regulatórias de cada revogação (P3/P4/P5).
