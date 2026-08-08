# 09 — Fase 7 · Contrato, QA e documentação final

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 7 (última) |
| Branch | `sicat/whatsapp-channel` |
| Migration | **nenhuma** (a `020` segue a única inédita, e segue **não aplicada**) |
| Data | 2026-08-08 |
| Status | ✅ concluída — dívida de contrato da cadeia **fechada**; canal segue **desligado** e **inerte no cluster** |

## 1. A dívida que esta fase existe para fechar

O SICAT é **contract-first** (`backend/AGENTS.md` §3): mudança de superfície HTTP atualiza, no mesmo
PR, `openapi/…yaml` → `examples/` → `src/generated/operations.ts` → rotas → testes de contrato.
**Todas** as rotas desta cadeia ficaram fora do OpenAPI, e a dívida foi registrada em cada checkpoint
desde a fase 0.

Fechada: **16 operações** publicadas em lockstep. Detalhe da lista, das contagens e das decisões de
contrato em [CHANGELOG-WHATSAPP-CHANNEL.md §2](../../CHANGELOG-WHATSAPP-CHANNEL.md) — não é repetido
aqui.

**Correção de contagem herdada:** o checkpoint 03 diz "6 rotas" de channel-links. São **9** — a fase 5
acrescentou as três de `action-window`.

## 2. Dois achados que não estavam em checkpoint nenhum

### 2.1 O gate `npm run test:contract` estava VERMELHO, e ninguém viu

`openapi-queue-contract.test.js` resolvia `examplesDir` como `process.cwd()/examples` =
`backend/examples` — **pasta que não existe** desde o refactor de monorepo (`266849cd`), quando
`examples/` foi para a raiz do workspace. 2 dos 4 casos falhavam com `ENOENT`.

Consequência que valia declarar antes de qualquer coisa: o critério de pronto do
[00-orchestration.md](00-orchestration.md) ("`npm run test:contract` verde") **não era alcançável**
sem consertar isto primeiro. Corrigido ancorando os caminhos em `fileURLToPath(import.meta.url)`.
Baseline anterior: 4 testes, 2 pass, 2 fail. Agora: **13 pass, 0 fail**.

### 2.2 `npm run validate:md-links` varre 8 arquivos, não 817 — mesma causa-raiz

O script usa `process.cwd()` e é exposto pelo `package.json` do `backend/`, então varre
`backend/docs/` (8 arquivos markdown) e **nunca enxergou `apps/sicat/docs/`**. Executado com
`cwd = apps/sicat`, o resultado é **410 links quebrados** (excluindo `node_modules`), quase todos
`../../src/…` — o mesmo refactor de monorepo. **Pré-existente**, e agora escrito.

Nesta fase foram corrigidos os **11 de `estado-atual.md`** e o **1 de `PROXIMO_PROMPT.md`**
(`../../src/…` → `../../backend/src/…`). O restante fica registrado como dívida em
[estado-atual.md §3.6](../../10-estado-atual/estado-atual.md).

### 2.3 `gen:operations` não fecha o lockstep sozinho

`scripts/generate-operations.js` escreve `src/generated/operations.js`; quem escreve o
`operations.ts` que o TypeScript consome é `scripts/sync-operations-ts.mjs`, que **não está em nenhum
script do `package.json`**. `AGENTS.md` §6 manda rodar `npm run gen:operations` — rodar só isso deixa
o `.ts` **stale em silêncio**. Hoje os dois estão em 104 porque o segundo foi rodado explicitamente.

## 3. Duas afirmações minhas que o código não sustentava

Pegas antes de commitar, pela regra da cadeia ("comentário não é evidência"):

- escrevi `channel_verifications` e `conversation_turns` no `dataSource` de um example; as tabelas
  reais são `conversation_channel_verifications` e `conversation_messages` — **`conversation_turns`
  não existe**;
- declarei `pending` no enum de `status` do artefato; **nenhum caminho grava esse valor**. O código
  grava `processing | available | partial | failed | expired`.

São a sétima e a oitava ocorrências do padrão registrado como **Lição 1** da cadeia.

## 4. Documentação entregue nesta fase

| Arquivo | O que é |
|---|---|
| [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md) | regenerado — seção do canal com ícones (✅/⚠️/⛔/🕓/📋) e a §3.1 dizendo, sem maquiagem, o que o canal **não** faz. Aproveitou para corrigir 3,5 meses de defasagem: AI Control Center, DL-094–DL-100, 21 migrations, rotas e telas novas, e a remoção da frase falsa *"nenhum backend de IA está implementado"* |
| [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md) | reescrito — a "Opção A" anterior (`mtr-provisorio-wizard-smoke-cleanup`, 2026-04-25) **nunca rodou** e foi rebaixada a follow-up. Recomendação atual: **P0 de autorização das rotas REST** |
| [docs/copilot/13-decision-log.md](../../copilot/13-decision-log.md) | **DL-101** no topo, com as decisões estruturais (D1–D9) e uma seção própria de **recusas** |
| [docs/copilot/decisions-INDEX.md](../../copilot/decisions-INDEX.md) | espelho atualizado (tabela + agrupamento temático) |
| [docs/CHANGELOG-WHATSAPP-CHANNEL.md](../../CHANGELOG-WHATSAPP-CHANNEL.md) | release notes da cadeia, no padrão dos demais `CHANGELOG-*` |
| [docs/05-operacao/runbook-canal-whatsapp.md](../../05-operacao/runbook-canal-whatsapp.md) | runbook de **ativação e desligamento**: sequência numerada, 5 pontos de não-retorno, verificação entre passos, modos de falha silenciosos e a lista **canônica** das decisões do operador |
| este arquivo | checkpoint da fase |

**O runbook aponta** para [runbook-rbac-conversacional.md](../../05-operacao/runbook-rbac-conversacional.md)
em vez de duplicar o protocolo de seed/observe/flip.

## 5. Decisões pendentes do operador — onde vivem

Consolidadas em **[runbook-canal-whatsapp.md §2](../../05-operacao/runbook-canal-whatsapp.md)**,
como O1 a O12. Resumo do que trava o quê:

| # | Decisão | Trava |
|---|---|---|
| O1 | commitar `k8s/backend.yaml` (retido; sob Argo com `selfHeal`, commitar = aplicar) | o canal não pode ser ligado |
| O2 | passo 0 do runbook de RBAC — validar o SQL do seed contra o Postgres | regime de permissão sem prova |
| O3 | migration `020` — rollout escalonado (sem advisory lock) | fases 2 e 5 inertes; CrashLoop duplo se colidir |
| O4 | flip do RBAC nos **três** Deployments | esquecer o `worker-channel` = fail-open silencioso |
| O5 | **D-A2** — escudo anti-bombing tranca o dono de primeira viagem, sem escape no produto | vítima sem recuperação |
| O6 | D-A5 — auditar (ou não) o `MAX_LINKS_REACHED` no `start` | buraco de trilha, risco baixo |
| O7 | credenciais do provedor (**`kubeseal` ausente nesta máquina**) | o canal não existe |
| O8 | ligar (ou não) `WHATSAPP_MEDIA_DELIVERY_ENABLED` | nada — o texto já diz a verdade |
| O9 | liberar `allowChannels` por chave, em runtime, no AI Control Center | canal segue somente-leitura |
| O10 | **P0** — autorização das rotas REST | issue própria; é a Opção A do `PROXIMO_PROMPT.md` |
| O11 | ambiente novo nasce sem administrador | bootstrap limpo |
| O12 | destravar N2 — engenharia, não configuração | emitir MTR pelo WhatsApp |

## 6. Validação

| Gate | Resultado literal |
|---|---|
| `npm run typecheck` | limpo (sem saída) |
| `npm run lint` | limpo (sem saída) |
| `npx tsx --test tests/unit/*.test.js` | `# tests 946 · # pass 911 · # fail 35` — **baseline intacta** |
| `node --test tests/integration/openapi-queue-contract.test.js` | `# tests 13 · # pass 13 · # fail 0` |
| `node scripts/validate-openapi.js` | `[ok] OpenAPI validado com sucesso` · exit 0 |
| `node scripts/validate-cetesb-source-of-truth.js` | `[erro] Pasta de evidências não encontrada: …/backend/docs/cetesb` — **falha pré-existente**, idêntica à baseline capturada antes de tocar em qualquer arquivo |
| `npm run check:secrets` | `No obvious secrets detected.` |
| `npm run scan:secrets` | `OK: nenhuma exposição NOVA` (8 pré-existentes via baseline) |
| `validate-markdown-links.js` (cwd `backend`) | `[ok] Arquivos analisados: 8` · `[ok] Nenhum problema` · exit 0 |
| `validate-markdown-links.js` (cwd `apps/sicat`) | ver §2.2 — 410 problemas **pré-existentes** |

## 7. O que esta fase NÃO fez

- **Não commitou nada.** Nenhum `git commit`/`push`.
- **Não rodou `kubectl`, `docker`, migration nem seed.** Nada foi escrito no cluster.
- **Não tocou `src/`, `openapi/` nem `tests/`** na etapa de documentação (a publicação do contrato foi
  a etapa anterior desta mesma fase).
- **Não consertou** os 410 links quebrados fora de `10-estado-atual/` — corrigir em massa exige
  decidir se o gate passa a rodar com `cwd = apps/sicat`, o que é escopo próprio (Opção B do
  `PROXIMO_PROMPT.md`).
- **Não consertou** `validate-cetesb-source-of-truth.js` — depende de decidir se os HARs (com JWT e
  CPF) entram no git.
- **Não executou** a revalidação Fable 5 sobre a árvore consolidada, recomendada pela fase 6.

## 8. Lições da cadeia, para quem vier depois

1. **Comentário e relato NÃO são evidência.** Foram **oito** casos nesta cadeia de texto — comentário
   de código e documentação — afirmando propriedade que o código não tinha. Dois deles apareceram
   nesta fase, em documento que eu mesmo estava escrevendo.
2. **Double que reimplementa a lógica testada concorda consigo mesmo.**
3. **Dívida se escreve, não se finge.** Onde não houve cobertura, está escrito que não houve — F9,
   F12 e `unmetered` são os exemplos.
4. **Omitir também é mentir.** O `estado-atual.md` violava o próprio cabeçalho ("nada é marcado como
   IMPLEMENTADO sem evidência") **por omissão**, não por promessa.
