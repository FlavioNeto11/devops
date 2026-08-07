# Runbook — RBAC da superfície conversacional (fase 4.5)

> Cadeia `whatsapp-channel-sicat`. Este runbook cobre o **catálogo de permissões**, o **gate de três
> estados** e, principalmente, **como voltar atrás em minutos** se o fechamento do gate travar alguém.

## 1. O que mudou

Antes, `hasConversationPermission` era **fail-open por usuário**: quem não tinha papel nenhum
(`permissionKeys` vazio) passava por TODAS as tools. Como `access_permissions` estava com **0 linhas**,
isso valia para os 5 usuários — ou seja, "a IA nunca eleva permissão" era falso e liberar ação por
WhatsApp seria liberar para qualquer autenticado.

Agora:

| Peça | Onde | O que faz |
|---|---|---|
| Catálogo (8 chaves) | `src/lib/conversation-permission-catalog.ts` | fonte única do que o seed escreve |
| Seed idempotente | `src/bootstrap/access-control-seed.ts` (chamado por `ensureBaseData`) | reconcilia catálogo + papéis + vínculos a cada boot |
| Papel-piso no login | `ensureDefaultRoleForUser` em `issueTokenPair` | usuário sem **nenhuma chave efetiva** ganha `sicat.reader` |
| Gate de 3 estados | `conversation-policy-service.ts` | permite / observa / nega, com integridade **por chave** |
| Flag | `CONVERSATION_PERMISSION_ENFORCEMENT` (`observe` \| `enforce`) | default do código = `enforce` |

**Não há migration nova.** O seed roda no boot porque o problema é invariante contínua (três sítios
criam usuário sem papel todo dia), não backfill único.

### As 8 chaves

`audit.read` · `manifest.cancel` · `manifest.create` · `manifest.print` · `manifest.read` ·
`manifest.receive` · `manifest.replicate` · `manifest.submit`

### Os papéis

| Papel | Permissões | Quem recebe |
|---|---|---|
| `sicat.reader` (**piso**) | `manifest.read` — só ela | automático: login + backfill no boot |
| `sicat.operator` | as 8 | **um humano concede** na tela de Acessos |
| `admin.global` (já existia) | as 8 (o seed só ACRESCENTA os vínculos) | nada a fazer |

O piso é read-only porque `POST /v1/sicat/auth/register` é **público e sem auth** (DL-043): o piso é
literalmente o que qualquer pessoa da internet ganha ao criar conta. Por isso **alargar o piso nunca
é rollback** — ver §4.3.

**Quem recebe o piso** = quem o gate enxerga com **conjunto de chaves VAZIO** (e não "quem não tem
papel"). O predicado é o mesmo de `listPermissionKeysByUserId`
(`buildHasEffectivePermissionSql`, em `repositories/access-admin-repo.ts`), usado pelos **dois**
sítios — o grant do login e o backfill do boot. Consequências que a formulação anterior não tinha:

- papel **vazio** (ou estreitado até zero) não suprime mais o piso;
- grant de piso **expirado** é **revivido** (`on conflict … do update … where expires_at <= now()`),
  em vez de ficar preso para sempre pela unique `(user_id, role_id)`. Expiração ainda no **futuro** é
  preservada intacta.

## 2. Gate de três estados

```
1. sem permissão exigida             -> PERMITE
2. usuário TEM a chave               -> PERMITE
3. modo `observe`                    -> PERMITE + registra would_deny (com catalog_satisfiable)
4. chave AUSENTE/INATIVA no catálogo -> insatisfazível por qualquer um:
      ação, ou chave em DENY_WHEN_CATALOG_DEGRADED -> NEGA   (catalog_degraded_denied)
      demais leituras                              -> PERMITE (catalog_degraded_allowed)
5. senão                             -> NEGA (PERMISSION_DENIED)
```

O passo 4 é o que impede o pior minuto possível (catálogo ausente + gate fechado = chat morto com pod
Ready e health verde). A integridade é **medida** contra `access_permissions` (snapshot com TTL de
60 s, primeiro refresh awaited no boot), nunca pressuposta, e **por chave** — desativar
`manifest.cancel` desarma aquela ação, não o regime inteiro.

Duas correções da rodada de remediação, ambas dentro do passo 4:

- **`audit.read` nega mesmo sendo leitura** (`DENY_WHEN_CATALOG_DEGRADED`, em
  `lib/conversation-permission-catalog.ts`). A assimetria era só por `isAction`, e `get_audit_trail`
  é `isAction: false` — ou seja, exatamente quando o seed falha (falha **não-fatal** por desenho), o
  único vazamento que motivou criar `audit.read` continuava aberto: um estranho auto-cadastrado pelo
  endpoint público lia a trilha operacional inteira, com `enforce`, pod Ready e 200 na API.
  `requiresOperationalAccount` devolve `false` para essa tool, então nem conta CETESB era necessária.
  Custo de continuidade: zero — ninguém depende de `get_audit_trail` para o chat funcionar.
- **A classificação leitura×ação vem do DEFAULT DE CÓDIGO**, não do `isAction` efetivo. O overlay do
  AI Control Center (`ai_tools.defaultPolicyJson`) aceita `isAction` sem restrição; com o catálogo
  degradado e um override `isAction: false` em `submit_manifest`, o passo 4 classificaria a submissão
  à CETESB como leitura e devolveria `allowed: true` para quem tem zero permissões. O overlay pode
  afrouxar apresentação/confirmação — nunca a fronteira que o gate usa para decidir.

Comparação é **igualdade exata de string**: não há prefixo nem curinga. `manifest.*` não concede nada.

## 3. Rollout (ordem obrigatória)

0. **VALIDAR O SQL DO SEED CONTRA O BANCO — BLOQUEANTE, ANTES DO DEPLOY.**

   **Dívida assumida:** nenhum teste executa os statements do seed. A suíte unitária afirma sobre as
   STRINGS de `buildAccessControlSeedStatements()` — prova FORMA (nenhum insert sem `on conflict`,
   nenhum `delete`, `is_active` fora de todo `do update`), **não prova sintaxe**, nem que o conflict
   target casa com o índice único, nem idempotência. Agrava: `ensureBaseData` captura a exceção do
   seed e só faz `console.error` (o boot continua), os testes de **backend** não estão em CI nenhum
   (`.github/workflows/ci-apps.yml` roda só `lint test:unit:frontend build:frontend` para sicat), e em
   modo `observe` um seed totalmente falho é **comportamentalmente invisível** — o único sinal é uma
   linha de log em dois pods.

   Enquanto não houver teste de integração, esta validação é **manual e obrigatória**, com evidência
   anexada ao PR:

   ```bash
   # 1) gerar o SQL EXATO que o boot vai executar (nao conecta em banco, so imprime)
   cd apps/sicat/backend && npm run --silent seed:access-control:print > /tmp/access-control-seed.sql

   # 2) executar em transacao DESCARTAVEL (o arquivo ja termina em `rollback;`)
   kubectl exec -n apps -i deploy/sicat-postgres -- \
     psql -U postgres -d mtr_automation -v ON_ERROR_STOP=1 -f - < /tmp/access-control-seed.sql
   ```

   `ON_ERROR_STOP=1` é o que transforma "erro no meio" em saída != 0 — sem ele o psql segue e o
   operador lê "rollback" achando que passou. **Qualquer erro aqui: PARE.** Para provar idempotência,
   cole o bloco entre `begin;` e `rollback;` uma segunda vez no mesmo arquivo e rode de novo:
   contagens idênticas, **zero `23505`**.

1. **Deploy do código com `observe`** (já explícito nos 3 Deployments). Nada muda para os usuários.
   Migration 020 estreia neste boot → **rollout escalonado**: `sicat-api` primeiro, `sicat-worker` só
   depois de a api ficar Ready (não há advisory lock em `runMigrations` — armadilha 13 do `CLAUDE.md`).
2. **Verificação read-only, BLOQUEANTE** (`kubectl exec` no pod do Postgres, só `select`):
   ```sql
   -- (a) 8 chaves ativas
   select permission_key from access_permissions where is_active = true order by 1;
   -- (b) admin.global com os 8 vínculos e os 2 grants intactos
   select ar.role_name, count(arp.permission_id)
     from access_roles ar left join access_role_permissions arp on arp.role_id = ar.id
    where lower(ar.role_name) = 'admin.global' group by 1;
   select user_id, assigned_at from access_user_roles order by assigned_at;
   -- (c) ninguém com conjunto vazio
   select u.id, u.email, count(distinct ap.permission_key) as keys
     from sicat_users u
     left join access_user_roles aur on aur.user_id = u.id
     left join access_role_permissions arp on arp.role_id = aur.role_id
     left join access_permissions ap on ap.id = arp.permission_id and ap.is_active = true
    where u.is_active = true group by 1,2 order by keys;
   -- (d) trilha do seed
   select occurred_at, metadata from access_session_admin_audit
    where action_type = 'ACCESS_CONTROL_SEED_APPLIED' order by occurred_at desc limit 3;
   ```
   Qualquer item que falhe: **PARE**. O seed se autocorrige no boot seguinte — é para isso que ele não
   é migration.
3. **Rodar o seed uma segunda vez de propósito** (basta um rollout do worker) e reconferir: contagens
   idênticas. É a prova de idempotência contra o banco real.
4. **Janela de observação** dimensionada pelo **ciclo do negócio**, não pelo calendário do PR. Se o
   fechamento MTR/DMR é mensal, uma semana não cobre o pico — você descobriria negando um lote no dia
   30. Mínimo absoluto 7 dias; recomendado cobrir um fechamento.
   ```promql
   sum by (permission, channel, catalog_satisfiable) (
     sicat_conversation_permission_decision_total{mode="observe", outcome="would_deny"}
   )
   ```
   **`catalog_satisfiable="false"` NÃO é fila de concessão — é catálogo quebrado.** O ramo `observe`
   retorna antes da checagem de integridade, então sem este label "usuário sem papel" e "alguém
   desativou a chave / o seed falhou num pod" produziriam amostras idênticas durante a janela inteira.
   Qualquer amostra `false` aqui: volte ao passo 0.

   **A coleta cobre os 3 pods?** Até a fase 4.5 havia **um único Service** (`sicat-api`), e o
   ServiceMonitor seleciona *Services*: as métricas de `sicat-worker` e `sicat-worker-channel` nunca
   eram raspadas — inclusive as do pod que avalia a policy dos turnos de WhatsApp. Os dois Services
   headless de métrica entraram em `k8s/backend.yaml`. Confirme antes de confiar em qualquer zero:
   ```bash
   kubectl -n apps get endpoints sicat-worker-metrics sicat-worker-channel-metrics
   ```
   ```promql
   # tem de aparecer amostra dos TRÊS pods
   count by (pod) (sicat_conversation_permission_decision_total)
   ```
5. **Conceder ANTES de negar.** Cada `would_deny` é "esta pessoa precisa de `sicat.operator`".
   Conceder é 1 clique na tela de Acessos. Reobservar até `would_deny` ficar **estável em zero** —
   número, não opinião.

   **A QUEM conceder** não sai da métrica (ela não tem — e não pode ter — label `userId`: PII e
   cardinalidade). Sai da **trilha do turno**, que carrega o `userId` ao lado do `permissionShortfall`:
   ```sql
   select cal.user_id,
          cal.result_payload -> 'policy' -> 'permissionShortfall' ->> 'required' as chave,
          count(*)
     from conversation_action_logs cal
    where cal.result_payload -> 'policy' -> 'permissionShortfall' ->> 'required' is not null
      and cal.created_at > now() - interval '7 days'
    group by 1, 2 order by 3 desc;
   ```
   > ⚠️ **O zero de `would_deny{channel="whatsapp"}` é um zero de CONSTRUÇÃO, não evidência.** Nenhuma
   > tool de ação lista `whatsapp` em `allowChannels` até a fase 5, então toda ação por WhatsApp para
   > antes. Desde a fase 4.5 a permissão é **avaliada cedo e aplicada tarde** (a precedência de
   > `CHANNEL_BLOCKED`/`INTEGRATION_ACCOUNT_REQUIRED` não mudou, mas a amostra passa a existir), o que
   > torna esse zero *mensurável* — não o torna *prova*: a fase 5 é justamente quem desbloqueia o
   > canal e exercita essas chaves pela primeira vez. Trate a liberação do canal como um flip próprio,
   > com sua própria janela.
6. **O flip**: commit único que REMOVE a linha `CONVERSATION_PERMISSION_ENFORCEMENT: observe` dos
   **TRÊS** Deployments + push + `kubectl annotate application sicat -n argocd
   argocd.argoproj.io/refresh=hard --overwrite`. **Esse commit é o ponto de rollback.**
   - Nunca `kubectl set env`: `k8s/backend.yaml` está sob Argo com `selfHeal: true` e seria revertido.
   - **Esquecer o `sicat-worker-channel` é o erro mais grave possível** — é o pod que avalia a policy
     dos turnos de WhatsApp; o canal continuaria fail-open com todo mundo achando que fechou.

## 4. ROLLBACK

A superfície administrativa **sobrevive ao flip**: `ensureAdminAuthorization` decide por **nome de
papel** (`hasAdminGlobalAccessByUserId`) e **nunca lê `access_permissions`**. Os dois `admin.global`
mantêm CRUD administrativo completo com o gate fechado.

E é **instantâneo** porque o access token **não carrega permissão** — as chaves são resolvidas por
turno. Quem recebe um grant vale no turno seguinte, **sem relogin**.

### 4.1 Nível 0 — destravar UM usuário (segundos, 1 clique)

Caminho primário. Tela de Acessos → *conceder perfil* → `sicat.operator`.

```
POST /sicat/api/v1/admin/access/users/{userId}/roles/{roleId}/grant
```

Repetir por usuário. Com 5 usuários no banco, "destravar todo mundo" são no máximo 5 cliques — e
cada um fica **auditado e reversível** (`revoke` desfaz).

> ⚠️ **NÃO conceda com data de validade** (`expiresAt`) a menos que queira mesmo o corte automático.
> O grant expirado é uma linha que continua existindo na unique `(user_id, role_id)`; a partir da
> fase 4.5 o piso **revive** um grant vencido (`on conflict … do update … where expires_at <= now()`),
> mas um `sicat.operator` vencido **não** é reconcedido: a pessoa cai para o piso, silenciosamente,
> na data que alguém digitou meses antes.

### 4.2 Nível 0.5 — degradar o REGIME inteiro (minutos, reversível, sem SQL)

**Este é o rollback de "destravar TODOS".** É o interruptor de MODO, não de permissão:

```bash
# entrar no estado degradado (gate decide igual, permite mesmo assim, e REGISTRA)
kubectl -n apps set env deploy/sicat-api           CONVERSATION_PERMISSION_ENFORCEMENT=observe
kubectl -n apps set env deploy/sicat-worker        CONVERSATION_PERMISSION_ENFORCEMENT=observe
kubectl -n apps set env deploy/sicat-worker-channel CONVERSATION_PERMISSION_ENFORCEMENT=observe
```

⚠️ `k8s/backend.yaml` está sob Argo com `selfHeal: true`: o `set env` acima **é revertido** em
minutos. Ele serve para **parar a hemorragia agora**; a forma durável é o commit que repõe a linha
`CONVERSATION_PERMISSION_ENFORCEMENT: observe` nos **TRÊS** Deployments + push + `kubectl annotate
application sicat -n argocd argocd.argoproj.io/refresh=hard --overwrite`. Faça os dois: o `set env`
compra os minutos até o Argo sincronizar o commit.

**CONFIRMAR que se está no estado degradado** (sem isto, "achei que tinha voltado" é o desfecho
provável às 2h da manhã):

```bash
# (a) os TRÊS pods têm de responder `observe` — esquecer o worker-channel é o erro mais grave
for d in sicat-api sicat-worker sicat-worker-channel; do
  echo -n "$d: "
  kubectl -n apps get deploy $d -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="CONVERSATION_PERMISSION_ENFORCEMENT")].value}{"\n"}'
done
```

```promql
# (b) a métrica muda de `outcome="denied"` para `outcome="would_deny"` com `mode="observe"`.
# Enquanto aparecer `denied`, há pod que NÃO recebeu a mudança.
sum by (mode, outcome) (rate(sicat_conversation_permission_decision_total[5m]))
```

**SAIR do estado degradado:** reverter o commit (o gate volta a `enforce`, que é o default do
código) + refresh do Argo, e reconferir (a) e (b) — agora esperando ausência de `mode="observe"`.

### 4.3 ⛔ O que NÃO fazer: alargar o papel-PISO

Versões anteriores deste runbook mandavam "destravar TODOS" fazendo `PATCH` do papel `sicat.reader`
com as 8 `permissionIds`. **Não faça isso.** O piso é literalmente o que `POST /v1/sicat/auth/register`
— endpoint **público, sem `sicatAuthMiddleware`** — concede a qualquer pessoa da internet que criar
conta, porque `ensureDefaultRoleForUser` roda no login. Alargar o piso é **promover a internet
inteira** a `manifest.submit`, `manifest.cancel`, `manifest.receive`, `manifest.replicate`,
`manifest.create` e `audit.read`.

E o estado era **silencioso e permanente**:

- **sobrevive a todo restart**, de propósito — o seed é aditivo (`do nothing`/`do update`, nunca
  `delete`), então ele nunca estreita de volta;
- **fica invisível na métrica** — com todo mundo tendo a chave, `evaluateConversationPermission`
  retorna no passo 2 e o contador para de emitir amostra alguma;
- **`deleteAdminAccessRole` recusa papel `is_system`**, então nem desativar o papel dá.

A partir da fase 4.5 o boot é a **testemunha** que faltava: se o piso tiver qualquer chave além das
declaradas, sai `console.error` e uma linha `ACCESS_CONTROL_FLOOR_ROLE_WIDENED` em
`access_session_admin_audit` (ver `bootstrap/access-control-seed.ts`). Para checar:

```sql
select ap.permission_key
  from access_roles ar
  join access_role_permissions arp on arp.role_id = ar.id
  join access_permissions ap on ap.id = arp.permission_id
 where ar.role_name = 'sicat.reader' and ap.is_active = true
 order by 1;   -- ESPERADO: exatamente uma linha, `manifest.read`
```

Se alguém já alargou (incidente anterior), o caminho de volta é este `PATCH`, e ele é
**obrigatório antes de fechar o incidente**:

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  https://dev.nvit.com.br/sicat/api/v1/admin/access/roles/<ID_DE_sicat.reader> \
  -d '{"permissionIds":["<APENAS o id de manifest.read>"]}'
```

### 4.4 Nível 2

Reverter o PR inteiro, rebuild `sicat-api:local`, recriar pods.

> ⚠️ Nunca troque o seed por `replaceAdminAccessRolePermissions`: ela faz `delete from
> access_role_permissions where role_id = $1` e reinsere, então o **primeiro restart desfaz** qualquer
> alargamento de emergência e o incidente volta sozinho.
> (Uma versão anterior deste parágrafo dizia também que o `delete` abre uma janela em que um
> `listPermissionKeysByUserId` concorrente devolveria `[]`, produzindo `PERMISSION_DENIED`
> intermitente. **É falso** — `delete` e inserts estão dentro de `withTransaction`, e sob READ
> COMMITTED nenhuma sessão concorrente enxerga o estado intermediário não-commitado. A frase foi
> removida daqui e do cabeçalho de `access-control-seed.ts` porque mandava um investigador futuro
> atrás de uma causa impossível.)

## 5. 🚫 A alavanca que faz o contrário do que parece

**NUNCA desative uma permissão para "destravar" alguém.**

Desativar uma chave faz o **oposto** do que parece: `listPermissionKeysByUserId` filtra
`ap.is_active = true`, então a chave some do conjunto de **todos**, e a integridade por chave torna
aquela ação **insatisfazível para o mundo inteiro, inclusive os admins**. Transforma um incidente de
3 usuários em incidente de 5.

**O verbo certo, para quem for ler o código:**

| Chamada | O que faz de verdade |
|---|---|
| `PATCH /v1/admin/access/permissions/{id} {"isActive": false}` | **NO-OP.** `updateAdminAccessPermission` lê só `resource`, `action`, `description` e `permissionKey`; `isActive` é ignorado, e o SQL só atualiza linhas que já têm `is_active = true`. |
| `DELETE /v1/admin/access/permissions/{id}` | **É ESTE** que desativa (`deactivateAdminAccessPermissionById`). |

Concluir "o PATCH não pegou, vou de DELETE" era o caminho natural às 2h da manhã — e ele **não tem
volta pela API**: não existe rota que devolva `is_active = true`, o seed mantém `is_active` fora de
todo `do update` (propriedade por coluna) e recriar a chave bate `23505` → 409 *"Já existe uma
permissão com a chave"*.

**Guarda de código (fase 4.5):** `deleteAdminAccessPermission` agora recusa com **409
`ACCESS_PERMISSION_IS_CATALOG_KEY`** qualquer uma das 8 chaves do catálogo conversacional — é a única
barreira possível, já que `access_permissions` não tem `is_system` (migration 008).

**Recuperação, se a chave já foi desativada** (só no Postgres, não há caminho pelo produto):

```sql
-- kubectl exec -n apps -it deploy/sicat-postgres -- psql -U <user> -d mtr_automation
update access_permissions
   set is_active = true, updated_at = now()
 where permission_key in ('audit.read','manifest.cancel','manifest.create','manifest.print',
                          'manifest.read','manifest.receive','manifest.replicate','manifest.submit')
   and is_active = false;
```

Nota contraintuitiva verificada: desativar **`manifest.read`** faz o oposto do resto — cai no ramo
degradado do passo 4 e **LIBERA** leitura para qualquer autenticado.

**Destravar é SEMPRE no sentido de CONCEDER** papel (§4.1) ou de degradar o MODO (§4.2).

Correlato: **revogar todos os papéis de alguém não é durável** — `ensureDefaultRoleForUser` (login) e
o backfill do boot reconcedem `sicat.reader` a quem ficar sem nenhuma chave efetiva. O instrumento
correto de corte é `sicat_users.is_active = false`, que a auth rejeita e por onde o backfill filtra.
Da mesma forma, **estreitar um papel semeado pela UI é desfeito no boot seguinte** — quem quer um
conjunto menor cria papel próprio.

> ⚠️ **Papel próprio VAZIO não é "menos permissão": é ZERO.** `createAdminAccessRole` cria papel sem
> nenhuma permissão e **não há UI** para vincular permissão a papel (só um segundo `PATCH` com
> `permissionIds`). Até a fase 4.5, conceder esse papel — que parece um *upgrade* — **removia o piso**
> e levava a pessoa de `manifest.read` para nada. Corrigido: o piso passou a ser condicionado a **não
> ter nenhuma CHAVE EFETIVA**, não a "não ter papel". Ainda assim, crie o papel **e vincule as
> permissões** antes de conceder.

## 6. Smoke por papel (depois do flip)

1. `sicat.reader` **lê** (passa) e tenta `submit`/`cancel` → `PERMISSION_DENIED` com texto legível.
2. `sicat.operator` executa normalmente.
3. `diagnose_operation` com usuário sem `manifest.read` → negado **e não vaza trilha de auditoria**
   (a allow-list interna do agente de diagnóstico foi reduzida às 4 tools declaradas; `get_audit_trail`
   saiu dela e passou a exigir `audit.read`).
4. `/v1/admin/access/*` continua abrindo para os 2 admins — prova de que o gate conversacional não
   trancou a superfície administrativa.

## 7. O que esta fase NÃO entrega

**Autorização no produto.** `middlewares/auth.ts` só verifica a **presença** de um header Bearer, e as
rotas REST de ação (`api-routes.ts`: `batch-submit`, `batch-cancel`, `:id/submit`, `:id/print`,
`:id/cancel`, `:id/replicate`, `receive`) **não têm** `sicatAuthMiddleware` nem checagem de permissão.
Hoje um `curl -H "Authorization: Bearer x"` submete e cancela manifesto.

Depois desta fase o **chat passa a ser a superfície MAIS restrita do SICAT**. A propriedade entregue é
*"a IA não eleva permissão"* — verdadeira. A propriedade *"o usuário não conseguiria pela tela"*
continua **falsa**, por outro motivo, e é uma issue P0 própria.

**Pendências nomeadas:**

- **P0** — autorização nas rotas REST de ação.
- **P0 de teste** — nada executa o SQL do seed contra um Postgres, e os testes de **backend** não
  estão em CI nenhum. Enquanto isso, o passo **0** do §3 é a compensação manual e bloqueante.
- **Testes que a rodada de remediação deixou pendentes** (o código foi corrigido; a evidência é da
  próxima fase): (a) grant de piso EXPIRADO + `ensureFloorRoleForUser` devolve `['manifest.read']`;
  (b) usuário com papel próprio VAZIO termina com `{manifest.read}`; (c) `resolveChannelPrincipal`
  chama `listPermissionKeysByUserId` com o `userId` do VÍNCULO (seam
  `setConversationPrincipalDependenciesForTests`); (d) `issueTokenPair` concede o piso (seam
  `setSicatAuthAccessControlDependenciesForTests`); (e) o `resultPayload` persistido carrega
  `permissionShortfall`.
- **Ambiente NOVO nasce sem administrador** — o statement `admin-grant-bootstrap` exige um
  `sicat_users` que só é criado no primeiro login, então só funciona no **segundo boot**. Documentado
  em `backend/.env.example`; a correção (chamar o bootstrap de usuário antes do seed) foi adiada para
  não puxar `services/sicat-auth-service` para dentro de `bootstrap/`.
- **Fase 4.6** — separar as 3 ações R3 hoje cobertas por `manifest.read` (`enqueue_cdf_download`,
  `cdf.generate_from_manifest_selection`, `cdf.download_batch_selected`) numa chave `cdf.download`,
  pelo **mesmo protocolo** observe → medir → conceder → flip. Dois estreitamentos no mesmo flip tornam
  impossível saber qual quebrou quem.
- **Menor** — advisory lock em `runMigrations`; travar edição das 8 chaves `is_system` na API
  administrativa (`updateAdminAccessPermissionById` ainda deixa `resource`, `action` e
  `permission_key` divergirem entre si — mitigado em parte porque o seed reconcilia a cada boot e
  `mapPermission` agora expõe `permissionKey`).
