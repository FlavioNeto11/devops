# Próximo prompt — orquestrador SICAT

> Gerado pela fase 7 (`09-contrato-qa-final`) da cadeia `whatsapp-channel-sicat` — 2026-08-08.
> Este arquivo é o ponto de entrada para a próxima cadeia. Atualize-o sempre que uma cadeia for
> concluída e a próxima for definida.
>
> ⚠️ O conteúdo anterior deste arquivo apontava para `mtr-provisorio-wizard-smoke-cleanup`
> (2026-04-25). **Aquela cadeia nunca rodou** — os itens seguem abertos em
> [estado-atual.md §3.7](estado-atual.md) e foram rebaixados a follow-up, não a próxima frente.

## 1. O que ficou pronto na cadeia anterior

A cadeia `whatsapp-channel-sicat` (8 commits, fases 0–7) entregou um **canal conversacional externo
por WhatsApp**, endurecido e **desligado por default**. Detalhe em
[CHANGELOG-WHATSAPP-CHANNEL.md](../CHANGELOG-WHATSAPP-CHANNEL.md) e nos checkpoints em
[docs/handoffs/whatsapp-channel-sicat/](../handoffs/whatsapp-channel-sicat/).

O que **não** está entregue, dito sem maquiagem:

- **o canal não emite MTR** — N2 fechado por constante de código, sem env que abra;
- **o canal está inerte no cluster** — provider `disabled`, manifesto k8s retido, migration `020`
  nunca aplicada, seed de RBAC nunca executado;
- **as ações só existem em N1** (2ª via, réplica local) e dependem de liberação por chave no AI
  Control Center.

## 2. Próxima frente recomendada

### 🔴 Opção A — `sicat-rest-authz-p0` (RECOMENDADA)

**Escopo**: fechar a autorização das rotas REST. Hoje `middlewares/auth.ts` só verifica a **presença**
de um header `Bearer`, e `GET /v1/jobs/search`, `GET /v1/jobs/:jobId`, a DLQ (incluindo `requeue` e
`delete`, que **mutam**) e as rotas de ação de manifesto **não têm** `sicatAuthMiddleware` nem
checagem de permissão.

**Por que é a nº 1**: a fase 4.5 fechou o RBAC do chat e, com isso, **o chat virou a superfície mais
restrita do SICAT**. A propriedade entregue foi *"a IA não eleva permissão"* — verdadeira. A
propriedade *"o usuário não conseguiria pela tela"* continua **falsa**, por outro motivo, e é uma
issue P0 própria, registrada desde o
[runbook de RBAC §7](../05-operacao/runbook-rbac-conversacional.md).

**Não depende de ação humana externa** e não toca cluster.

**Cuidados de escopo**: é mudança de superfície HTTP (rotas que hoje respondem 200 passarão a
responder 401/403), logo exige **lockstep contract-first** — e o ferramental do lockstep está
quebrado (Opção B). Ou a cadeia começa pela Opção B, ou incorpora o conserto dela.

### 🟡 Opção B — `sicat-lockstep-gate` (curta, pré-requisito prático)

**Escopo**: consertar o ferramental que deveria proteger a regra contract-first, tudo achado na
fase 7 e registrado em [estado-atual.md §3.6](estado-atual.md):

1. **`gen:operations` não sincroniza o `.ts`** — `scripts/generate-operations.js` escreve
   `operations.js`; quem escreve `operations.ts` é `scripts/sync-operations-ts.mjs`, que **não está
   em nenhum script do `package.json`**. Criar `gen:operations:all` encadeando os dois, **ou** um
   teste que compare `operations.ts` com o YAML.
2. **`validate:md-links` varre 8 arquivos, não 817** — o script usa `process.cwd()` e é exposto pelo
   `package.json` do `backend/`, então enxerga `backend/docs/` e **não** `apps/sicat/docs/`. Com
   `cwd = apps/sicat` o resultado hoje é **410 links quebrados** (fora `node_modules`), quase todos
   `../../src/...` — resíduo do refactor de monorepo `266849cd`. Mesma causa-raiz do `examplesDir`
   que a fase 7 consertou no `test:contract`.
3. **Nenhum gate de CI cobre nada disso** — `.github/workflows/ci-apps.yml` roda para sicat só
   `lint test:unit:frontend build:frontend`. Sem `typecheck`, sem `npm test` do backend, sem
   `validate:openapi`, sem `test:contract`.
4. (Opcional, maior) publicar as ~40 rotas `/v1/ai-control/*` no OpenAPI.

**Justificativa**: barato, isolado, sem efeito no cluster — e é o que impede a próxima quebra
silenciosa. As três quebras acima **existiram por meses sem ninguém ver**.

### 🟢 Opção C — ativação do canal WhatsApp (humana, bloqueada)

**Não é cadeia de agente.** Depende de 12 decisões do operador consolidadas em
[runbook-canal-whatsapp.md §2](../05-operacao/runbook-canal-whatsapp.md): commitar o manifesto
retido (= aplicar em produção, sob Argo com `selfHeal`), validar o SQL do seed contra o Postgres,
rollout escalonado por causa da `020`, credenciais do provedor (`kubeseal` ausente nesta máquina) e
a decisão organizacional sobre entrega de mídia.

**Quando autorizada**: seguir o runbook passo a passo. Ele tem os pontos de não-retorno e o
procedimento de desligamento.

### 🔵 Opção D — `whatsapp-n2-emissao` (grande, com critério de aceite duro)

**Escopo**: destravar a emissão de MTR pelo canal. **Não é flip de env** — exige que o aviso de
conclusão passe a **distinguir "o MTR não foi criado" de "o MTR foi criado e eu perdi a resposta"**,
e execução real em sandbox com transcrição **em sucesso E em falha**. A lista fechada de critérios
está em `whatsapp-confirmation-flow.ts`.

**Pré-requisito**: Opção C concluída (não há como validar em sandbox um canal que não está no ar).

## 3. Prompt pronto para o orquestrador (Opção A)

````text
work_id sugerido: sicat-rest-authz-p0
intent: fix (seguranca)
complexidade: medium

CONTEXTO
A cadeia whatsapp-channel-sicat (fase 4.5) fechou o RBAC da superficie conversacional e, com isso,
o chat virou a superficie MAIS restrita do SICAT. As rotas REST continuam abertas: middlewares/auth.ts
so confere a PRESENCA do prefixo "Bearer " e nao valida assinatura, expiracao nem permissao.
Ficam sem sicatAuthMiddleware: GET /v1/jobs/search, GET /v1/jobs/:jobId, as rotas de DLQ
(/v1/health/jobs/dlq/... incluindo requeue e delete, que MUTAM) e as rotas de acao de manifesto
(batch-submit, batch-cancel, :id/submit, :id/print, :id/cancel, :id/replicate, receive).
Registrado como P0 em docs/05-operacao/runbook-rbac-conversacional.md secao 7 e em
docs/10-estado-atual/estado-atual.md secao 4.

OBJETIVO
Fechar a autorizacao das rotas REST reusando o catalogo de 8 chaves ja existente
(src/lib/conversation-permission-catalog.ts) e o mesmo gate de tres estados, para que o regime do
chat e o das telas sejam o MESMO regime — nao dois.

ESCOPO MINIMO
- aplicar sicatAuthMiddleware nas rotas hoje sem ele;
- exigir a chave correspondente por rota (manifest.submit, manifest.cancel, manifest.print,
  manifest.replicate, manifest.receive, manifest.read, audit.read);
- reusar CONVERSATION_PERMISSION_ENFORCEMENT (observe|enforce) para que exista janela de
  observacao ANTES de negar — o mesmo protocolo do runbook de RBAC, nao um regime novo;
- lockstep contract-first: os novos 401/403 vao para o OpenAPI, examples, operations.ts e teste
  de contrato NO MESMO PR.

RESTRICOES
- NAO commitar, NAO rodar kubectl/docker, NAO aplicar migration.
- Baseline de falhas PRE-EXISTENTES da suite unitaria: 35 (11 nomes top-level). Nao aumentar.
- npm run gen:operations NAO sincroniza operations.ts — rodar tambem
  scripts/sync-operations-ts.mjs, ou consertar isso antes (ver Opcao B).
- Verificar, ANTES de escrever qualquer garantia, que a rota citada de fato esta desprotegida.
  Comentario nao e evidencia — esta cadeia teve SEIS casos de texto afirmando propriedade que o
  codigo nao tinha.

CRITERIOS DE PRONTO
- toda rota de acao de manifesto e toda rota mutavel de DLQ exige sessao SICAT valida + chave;
- curl com "Authorization: Bearer isto-nao-e-um-token" devolve 401 em todas elas;
- typecheck, lint, test:contract e a suite unitaria sem regressao sobre a baseline de 35;
- runbook atualizado com a janela observe -> medir -> conceder -> flip.

PRIMEIRO AGENTE SUGERIDO
programador-backend-mtr, com revisao de seguranca antes do QA.
````

## 4. Pendências herdadas a observar

- **12 decisões do operador (O1–O12)** — [runbook-canal-whatsapp.md §2](../05-operacao/runbook-canal-whatsapp.md).
- **INC-WIZARD-01 / INC-WIZARD-02** — cenários legados do smoke MTR provisório; a cadeia de cleanup
  nunca rodou.
- **HAR DMR ausente** — destrava `dmr-gateway-real`; ação humana.
- **F4** (flake `test:integration` 1/124) e **AUD-09** (flake `audit.spec.ts:267` sob suíte
  paralela) — não-bloqueantes.
- **F2/F3** — Playwright e chunks Vite, pré-existentes.
- **410 links markdown quebrados** em `apps/sicat/docs` — pré-existentes, invisíveis ao gate atual
  (Opção B, item 2).
- **Rotação da GCP API Key** vazada no histórico legado — `ONBOARDING-DEVOPS.md` §7.

## 5. Próximo passo operacional

Encaminhar o prompt da §3 ao `orquestrador-mtr` para abrir `sicat-rest-authz-p0` — **ou**, se a
preferência for pagar primeiro o barato que protege o resto, abrir `sicat-lockstep-gate` (Opção B) e
emendar a Opção A logo em seguida.

A ativação do canal (Opção C) é **decisão humana** e independe destas duas: pode acontecer em
paralelo, seguindo o [runbook](../05-operacao/runbook-canal-whatsapp.md).
