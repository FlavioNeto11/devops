# 06 — Fase 4.5 · Fechar o RBAC fail-open

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 4.5 (pré-requisito da fase 5) |
| Branch | `sicat/whatsapp-channel` |
| Migration | **nenhuma** (decisão — ver §3) |
| Data | 2026-08-07 |
| Status | ✅ código concluído · ⏸️ seed e flip **não aplicados** (§6) |

## 1. Por que esta fase existe

`hasConversationPermission` devolvia `true` quando o usuário não tinha permissão nenhuma. A fase 0 já
consertara a **origem** das permissões (antes vinham de `context.metadata.permissionKeys`, declarado
pelo cliente; passaram a ser resolvidas no servidor). Faltava fechar o gate. Enquanto ele estivesse
aberto, *"a IA nunca eleva permissão"* era falso — e liberar ações por WhatsApp seria liberá-las para
qualquer usuário autenticado. **Esta fase bloqueava a fase 5.**

Estado do banco vivo medido antes de começar: `access_permissions` **0 linhas**, `access_roles` **1**
(`admin.global`), `access_user_roles` **2**, `sicat_users` **5** (3 ativos sem papel nenhum),
`conversation_sessions` **191**. Como `admin.global` também não tinha permissão vinculada, fechar o
gate quebraria o chat para **os 5 usuários**, inclusive os dois administradores.

## 2. A solução não escolheu um lado do conflito

O briefing montou segurança contra continuidade esperando uma escolha. O design mudou o eixo: separou
**verdade de banco** de **modo de operação**, com um gate de três estados cuja integridade é avaliada
**por chave**.

Se a chave exigida não existe ou está inativa no catálogo, ela é *insatisfazível por qualquer um*:
leitura passa (e registra), ação nega. Catálogo vazio deixa de ser capaz de trancar o chat e, ao mesmo
tempo, nunca libera ação sem RBAC comprovado. Avaliar por chave — e não globalmente — tem um segundo
efeito: o operador que desativa `manifest.cancel` de propósito desarma aquela ação, sem derrubar o
regime das outras.

Seed e flip saem em **deploys separados**: o primeiro com `CONVERSATION_PERMISSION_ENFORCEMENT=observe`
explícito, o segundo trocando só a env. Esse segundo commit é o ponto de rollback.

**Não há janela de token velho.** O access token não carrega permissão — as chaves são resolvidas por
turno. Quem recebe concessão vale no turno seguinte, sem relogin, e o rollback é instantâneo.

## 3. Catálogo em `base-data.ts`, zero migration

Os três desenhos convergiram, com evidência dura: o DL-043 (auto-cadastro no login) é **invariante
contínua**, não backfill — há sítios criando usuário sem papel todo dia; e uma migration que falha
derruba api **e** worker (`server.ts` tem top-level await sem `try/catch`), ou seja o raio de dano de
uma `021` ruim seria o SICAT inteiro, não o chat. Some-se que a `020` da fase 2 nunca foi aplicada:
seriam duas migrations não exercitadas rodando juntas, e esta faria migração de **dados**.

> Achado de passagem: `apps/sicat/CLAUDE.md` e `k8s/backend.yaml` afirmam que `migrate.ts` usa
> advisory-lock. **Não usa** — as 35 linhas do arquivo foram lidas. A documentação foi corrigida.

## 4. Fechar o gate revelou testes que não testavam

As fixtures de `conversation-policy-service.test.js` e `conversation-policy-access-control.test.js`
usavam `permissionKeys: []`, que passava direto pelo fail-open. Ou seja: os casos de **confirmação**,
**limite de lote** e **escopo de conta** paravam antes, no gate aberto, e nunca exercitavam os
controles que diziam exercitar. Agora derivam de `listRequiredPermissionKeys()`, para que uma chave
nova no serviço não deixe as fixtures para trás em silêncio.

## 5. Verificação — 16 achados, e 2 buracos que sobreviveram a duas rodadas

Rodada 1: 16 achados (5 altos) e **5 mutações sobreviventes**, incluindo duas da mesma classe que já
passara despercebida na fase 2 — `where aur.user_id = $1` → `where ($1::text is not null)` (a consulta
devolveria as chaves de **todos** os usuários) e o sujeito trocado no sítio de chamada
(`listPermissionKeysByUserId(integrationAccountId)`).

Rodada 2: **38/41 mutações mortas** — o placar mais rigoroso da cadeia. O verificador sinalizou os
próprios *kills suspeitos*: 8 sondas ingênuas derrubavam duas suítes inteiras por explosão (não por
cobertura), então ele rodou uma variante refinada para obter kill discriminante. E classificou uma
sobrevivente como **mutação equivalente** (membro morto num `Set` protegido por guarda anterior), não
como buraco.

Sobreviveram 2 buracos reais, **fechados aqui e não por agente**: `inner join access_roles ar on
ar.id = aur.role_id` → `on true`, nos dois sítios. O `where` já estava congelado, mas a mutação mora no
**join**, fora dele. Com `on true` o join vira produto cartesiano e `ar.is_active = true` no `where`
continua satisfeito por qualquer papel ativo do sistema — o usuário herdaria as permissões de todos.
Fechado congelando a cadeia de joins inteira, com controle negativo provando que `includes` por
substring não enxergaria.

## 6. Validação (conferida aqui)

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npx tsx --test tests/unit/*.test.js` | ✅ **726 testes · 691 pass · 35 fail** — baseline exata, 11 nomes top-level idênticos |
| Mutação X5 (verificada aqui) | ✅ morta; arquivo restaurado pristino por sha256 |

A suíte saiu de 634 (fim da fase 4) para **726**.

**Nada foi aplicado.** O seed não rodou contra banco nenhum e o flip está em `observe`. A aplicação é
decisão do operador, com o passo 0 bloqueante do runbook
(`docs/05-operacao/runbook-rbac-conversacional.md`): imprimir o SQL com
`npm run seed:access-control:print` e validá-lo em `begin; … rollback;`, colando o bloco duas vezes
para provar idempotência.

## 7. Achados fora do escopo

**`get_audit_trail` sem permissão e sem conta operacional.** Tinha `requiredPermission === null` **e**
`requiresOperationalAccount` falso — um estranho auto-cadastrado pelo endpoint público de registro
lia a trilha de auditoria. Passou a exigir `audit.read`, que é por isso que o catálogo tem 8 chaves e
não 7.

**Allow-list mais larga que o conjunto declarado.** `READ_ONLY_TOOL_NAMES` no agente de diagnóstico
tinha 6 nomes contra 4 entradas em `DIAGNOSTIC_TOOLS` — e incluía justamente a ferramenta de
auditoria, contornando a policy. Reduzida às 4 declaradas.

**O chat passa a ser a superfície mais restrita do SICAT.** As rotas REST de ação continuam sem
`sicatAuthMiddleware` e o `authMiddleware` global só confere a presença do header. Está escrito aqui
porque afirmar no PR que *"o usuário não conseguiria isso pela tela"* seria a terceira vez que esta
cadeia documenta propriedade que o código não tem. Já há tarefa separada em andamento para isso.

## 8. Dívida assumida

1. **O SQL do seed nunca foi executado.** Os testes asseveram sobre as *strings* — não provam sintaxe
   nem que o `on conflict` faz o que diz. Mitigado pelo passo 0 do runbook; a prova definitiva é teste
   de integração contra Postgres (fase 7).
2. **Usuário inativo no canal** ainda cai como exceção técnica. A correção foi implementada e
   **revertida**: exigia `findSicatUserById` no seam do módulo, e os doubles das suítes de canal não a
   injetam — derrubou 33 testes sem relação com RBAC. Hoje é fail-closed, só mudo. → fase 5.
3. **`cdf.download` não virou chave própria** (fase 4.6). O risco contra o estranho auto-cadastrado já
   é neutralizado por `requiresOperationalAccount`; o que sobra é um usuário legítimo com conta a quem
   se deu só leitura conseguindo gerar/baixar CDF. Risco nomeado e aceito, para não fazer dois
   estreitamentos sobre gente real no mesmo flip.
