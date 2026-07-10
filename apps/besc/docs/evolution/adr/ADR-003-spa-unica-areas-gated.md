# ADR-003 — SPA única com áreas gated

Status: DECISÃO — revisar

Contexto: o frontend atual é uma única SPA React 18 + Vite com 13 rotas, todas públicas
(`frontend/src/App.jsx:51-66`), servida em `/besc/` por nginx com SPA fallback e um único deploy
sob Argo CD. O marketplace acrescenta três áreas restritas (investidor, auditoria, gestão) sem
poder tirar do ar o portal público de conhecimento — que é a base de confiança do produto. É
preciso decidir a topologia do frontend, quanto do catálogo fica visível sem login e o que o
dossiê de um título pode expor do caso interno (que hoje carrega PII do titular —
`api/src/server.js:76-82`).

Decisão: adotar três sub-decisões solidárias.
(a) **SPA única com áreas gated por papel** — manter o `besc-frontend` atual como única SPA, com
as áreas `/investidor`, `/auditoria` e `/gestao` gated por papel e `/casos`+`/cases/*` migrando de
público para gated `manager`; guards de rota no React são apenas UX — **a autoridade é a API**
(middleware RBAC por endpoint, deny por padrão), com auth no app via oidc-kit
([ADR-004](./ADR-004-identidade-realm-besc-oidc-kit.md)).
(b) **Catálogo em dois níveis** — lista pública teaser em `/marketplace` (títulos listados, classe,
nível de risco; sem valores contratuais nem dossiê; CTA de login) e **dossiê gated** exigindo
`investor` aprovado (`user.status = active`).
(c) **Dossiê como projeção allowlist** — o dossiê é uma projeção curada (`title_listing`) publicada
explicitamente pelo Gestor, com campos expostos **enumerados** (identificação e classe do título,
`computeRisk().level`, estado jurídico atual + histórico de eventos sem os autos, lista de tipos de
documento validados sem binários, resumo do laudo pericial, jurisprudência vinculada, parâmetros de
tokenização); **PII nunca** (`holder_name`, `holder_tax_id`, `contact`), nem notas internas,
pendências, `estimated_value` ou anexos. Campo fora da lista não existe no payload.

Alternativas rejeitadas:
- **SPAs separadas por perfil** — duplicaria shell/`ui.jsx`/pipeline/deploy sem ganho e fragmentaria
  o base path `/besc/`.
- **ForwardAuth/oauth2-proxy na borda (padrão Console)** — gatearia o path inteiro `/besc`, matando
  as rotas públicas de conhecimento.
- **Catálogo todo atrás de login** — mata a aquisição de investidores e a função pública do portal.
- **Dossiê público (sem gate)** — expõe demais antes do gate regulatório e enfraquece o controle de
  quem consome informação de oferta.
- **Projeção por denylist (esconder campos sensíveis)** — um campo novo no caso vazaria por padrão;
  allowlist falha fechado.

Consequências: um único deploy/Application no Argo; reuso integral do design system e do padrão de
abas do `CaseDetail.jsx`; o portal público permanece intacto; a matriz rota×papel do
[Apêndice C](../apendices/C-matriz-rbac.md) passa a ser o contrato testável de acesso (critério de
pronto da Fase 2 — [09-roadmap](../09-roadmap.md)). Invariantes criados: nenhuma rota nova nasce
fora da matriz; nenhum campo entra no dossiê sem constar da allowlist desta ADR; a única quebra
para o operador atual é `/casos` exigir login `manager`. Fica mais difícil: evoluir bundle/rotas
exige disciplina para não vazar código de gestão no chunk público (mitigável com code-splitting
por área).

Revisão pendente: validar com **jurídico** os textos e campos do dossiê público antes do gate
regulatório (risco de caracterizar oferta — [10-gate-regulatorio](../10-gate-regulatorio.md));
confirmar com o operador a quebra de fluxo de `/casos` passar a exigir login; calibrar o conteúdo
exato do teaser `/marketplace` (quanto risco/classe mostrar sem login).
