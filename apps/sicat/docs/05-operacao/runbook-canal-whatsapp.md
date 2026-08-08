# Runbook — ativação do canal conversacional WhatsApp

> Cadeia `whatsapp-channel-sicat` (fases 0–7, branch `sicat/whatsapp-channel`, 2026-08-06/08).
> Este runbook cobre **ligar o canal do zero**, o que verificar entre cada passo, os pontos de
> não-retorno e **como desligar**. O regime de permissão do chat tem runbook próprio —
> [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) — e **não é duplicado aqui**.

**Estado inicial real, hoje:** `WHATSAPP_PROVIDER=disabled` (default do código), migration `020`
nunca aplicada em banco nenhum, seed do catálogo RBAC nunca executado contra este Postgres,
`k8s/backend.yaml` **modificado e não commitado**. Nada do canal está no ar.

---

## 1. Antes de qualquer coisa: o que está desligado e por quê

| Chave | Default | O que o código faz com o default |
|---|---|---|
| `WHATSAPP_PROVIDER` | `disabled` | `resolveWhatsAppProvider()` devolve `null`; o webhook responde **404** no GET e no POST (`routes/channel-webhook-routes.ts:78,110`) — indistinguível de rota inexistente |
| `WHATSAPP_ACTIONS_ENABLED` | `false` | `processTurn` recebe `allowActions: false`. Nenhuma linha de `ai_tools` contorna |
| `WHATSAPP_ACTION_NOTICE_ENABLED` | `false` | portão do N2 — **e não basta**, ver §7 |
| `WHATSAPP_MEDIA_DELIVERY_ENABLED` | `false` | canal nunca promete anexo; o texto diz "o download fica no SICAT" |
| `WHATSAPP_UNLINKED_NOTICE_ENABLED` | `false` | número não vinculado não recebe cortesia (custo por mensagem contra tráfego arbitrário) |
| `CONVERSATION_PERMISSION_ENFORCEMENT` | **`enforce`** (`lib/config.ts`) | valor desconhecido **lança no boot**. A linha `observe` está no manifesto **retido**, não no git — ver ponto de não-retorno nº 2 |
| `WORKER_LANE` | ausente ⇒ `all` | comportamento antigo byte a byte; a raia nasce inerte (`lib/job-lanes.ts`) |

São **56** chaves `WHATSAPP_*`/`CHANNEL_LINK_*` em `backend/src/lib/config.ts`. **4 a 5 são
obrigatórias** para o canal existir; o resto tem default são. O inventário completo com defaults está
em [08-outbound-e-arquivos.md](../handoffs/whatsapp-channel-sicat/08-outbound-e-arquivos.md) e no
próprio `config.ts` (seções comentadas por fase).

---

## 2. DECISÕES PENDENTES DO OPERADOR

Seção canônica. Nenhuma destas é implementável por agente — todas exigem escolha humana ou ação com
efeito no cluster / na CETESB / no provedor. Os demais documentos da cadeia apontam para cá.

| # | Decisão | O que trava enquanto não for decidida |
|---|---|---|
| **O1** | **Commitar `k8s/backend.yaml`.** O arquivo está modificado e **retido de propósito** (+208 linhas). `platform/argocd/apps/sicat.yaml` tem `automated: {prune: true, selfHeal: true}` sobre `apps/sicat/k8s` — **commitar é aplicar**. Cria o Deployment `sicat-worker-channel`, os 2 Services headless de métrica, injeta `WORKER_LANE=default` no worker que hoje emite MTR (reinicia ele) **e** a linha `CONVERSATION_PERMISSION_ENFORCEMENT: observe` nos três pods | O canal não pode ser ligado: o worker é consumidor serial único e um turno de LLM de 90 s bloqueia `manifest.submit` por 90 s |
| **O2** | **Passo 0 do runbook de RBAC** — validar o SQL do seed contra o Postgres em transação descartável, com `ON_ERROR_STOP=1`, colando o bloco 2× para provar idempotência, e anexar a evidência ao PR. Bloqueante e manual: **nenhum teste executa os statements do seed** | Regime de permissão sobe sem prova de que o seed roda |
| **O3** | **Aplicar a migration `020`** (`020_channel_link_verifications.sql`) — **nunca aplicada em banco nenhum**; o DDL não foi exercitado. Não há passo "aplicar": com `AUTO_MIGRATE=true` na api **e** no worker, ela estreia sozinha no boot do rollout. A decisão é **fazer o rollout escalonado** (api Ready → depois worker), porque `src/db/migrate.ts` **não tem advisory lock** | Fases 2 e 5 inteiras são inertes; colisão dupla = CrashLoop simultâneo de api + worker |
| **O4** | **O flip do RBAC** — remover `CONVERSATION_PERMISSION_ENFORCEMENT=observe` dos **TRÊS** Deployments de uma vez, só quando a soma de `would_deny` estiver estável em zero. Protocolo completo em [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) | Esquecer o `sicat-worker-channel` deixa o WhatsApp fail-open com todo mundo achando que fechou |
| **O5** | **D-A2 — o escudo anti-bombing tranca o dono de primeira viagem.** Quem nunca vinculou um número pode ser trancado por N+1 contas descartáveis, em janela renovável (`CHANNEL_LINK_VICTIM_SHIELD_DISTINCT_USERS=3` / `_WINDOW_HOURS=24`), **sem escape no produto**. Escolher: step-up de identidade fora de banda **ou** ação de suporte que libera o número. Explicitamente **não** resolver por sinal fraco (IP, idade da conta) — reabriria o bombing multi-conta | Vítima sem caminho de recuperação |
| **O6** | **D-A5 — auditar (ou não) o `MAX_LINKS_REACHED` no `start`.** O `confirm` já audita; a pré-checagem é anterior a qualquer prova de posse e hoje não deixa rastro | Buraco de trilha, risco baixo |
| **O7** | **Credenciais do provedor** — `WHATSAPP_PROVIDER` + as chaves Twilio ou Meta. `kubeseal` **não existe nesta máquina** (verificado no PATH de Machine+User), e `sicat-config` é um SealedSecret sob Argo: ou se instala o `kubeseal` e re-sela, ou se usa o precedente do próprio repo (Secret plain fora do git + `secretKeyRef` explícito, que vence o `envFrom` — é o que `reqhub-api-config` já faz em `k8s/backend.yaml`) | O canal não existe |
| **O8** | **`WHATSAPP_MEDIA_DELIVERY_ENABLED`** — a entrega de arquivo está completa e testada, e **desligada por default**. O PDF do MTR carrega CNPJ, endereço, resíduo e responsável; no aparelho vai para o backup de nuvem para sempre e encaminhar é um toque. É decisão da organização, não do código | Nenhum — com a chave desligada o texto do canal diz a verdade |
| **O9** | **Liberar `allowChannels` das tools de ação para `whatsapp`** — pelo AI Control Center, **em runtime**, chave por chave, nunca hardcoded no `tool-registry.ts` (§8) | O canal segue somente-leitura |
| **O10** | **P0 fora da cadeia — autorização das rotas REST.** `GET /v1/jobs/search`, `GET /v1/jobs/:jobId`, a DLQ (incluindo `requeue`/`delete`, que **mutam**) e as rotas de ação de manifesto não têm `sicatAuthMiddleware`; o `authMiddleware` global só confere o prefixo `Bearer `. Depois da fase 4.5, o **chat é a superfície mais restrita do SICAT** | Issue P0 própria — decidir prioridade. Ver [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) |
| **O11** | **Ambiente novo nasce sem administrador** — o statement `admin-grant-bootstrap` exige um usuário pré-existente, criado só no primeiro login; só funciona no segundo boot | Bootstrap de ambiente limpo |
| **O12** | **Destravar N2** — não é decisão de configuração, é trabalho de engenharia com critério de aceite escrito. Ver §7 | Emitir MTR pelo WhatsApp continua indisponível |

---

## 3. Sequência de ativação

Ordem de dependência, do zero ao canal no ar:

```
1. veículo de segredo (kubeseal ausente → Secret plain + secretKeyRef)
2. passos 0..3 do runbook de RBAC (SQL do seed validado em transação descartável)
3. commit do manifesto retido            → NÃO-RETORNO 1 (migration 020) e 2 (regime RBAC)
4. rollout escalonado: api Ready → worker → channel
5. WHATSAPP_PROVIDER=twilio|meta          → NÃO-RETORNO 3 (rota pública viva)
6. registrar o webhook no provedor        → NÃO-RETORNO 4 (rotacionar o verify token)
7. vincular o primeiro telefone           → NÃO-RETORNO 5 (número verificado = identidade)
8. turno somente-leitura ponta a ponta
9. (opcional) WHATSAPP_ACTIONS_ENABLED + PATCH por chave N1
N2: fechado por código. Não há env que abra.
```

### Passo 1 — decidir o veículo dos segredos (bloqueante, antes de tudo)

`kubeseal` está **ausente** no PATH desta máquina, e `sicat-config` é um `SealedSecret` listado em
`k8s/kustomization.yaml`. Duas saídas:

**(A) Recomendada — seguir o precedente que já existe no manifesto.** `k8s/backend.yaml` já injeta
`ANTHROPIC_API_KEY` a partir do Secret **plain** `reqhub-api-config` com `secretKeyRef … optional:
true`, e o comentário no próprio arquivo registra que o `secretKeyRef` explícito **vence o
`envFrom`**. Mesmo padrão:

```powershell
kubectl create secret generic sicat-whatsapp -n apps `
  --from-literal=WHATSAPP_TWILIO_ACCOUNT_SID='AC...' `
  --from-literal=WHATSAPP_TWILIO_AUTH_TOKEN='...' `
  --from-literal=WHATSAPP_TWILIO_FROM='whatsapp:+1415...'
```

E, nos **três** Deployments, `env:` com `secretKeyRef: { name: sicat-whatsapp, key: <CHAVE>, optional: true }`.

**(B)** Instalar o `kubeseal` e re-selar `sicat-config`. Mais limpo, mais demorado.

**Verificar** (só nomes de chave, nunca valores):

```powershell
kubectl get secret sicat-whatsapp -n apps -o jsonpath='{.data}' | ConvertFrom-Json | Get-Member -MemberType NoteProperty
```

> ⚠️ Nenhum valor vai para o git. `secret.example.yaml` está fora do kustomize exatamente por isso.

### Passo 2 — passos 0 a 3 do runbook de RBAC

Faça **antes** do commit do manifesto: valide o SQL do seed em transação descartável, confira o
catálogo por `select` e prove idempotência rodando o bloco duas vezes. O procedimento inteiro está em
[runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) e não é repetido aqui.

### Passo 3 — commitar o manifesto retido, com o canal ainda DESLIGADO

```powershell
Set-Location C:\devops
git add apps/sicat/k8s/backend.yaml
git commit -m "chore(sicat): raia de fila do canal + Services de metrica dos workers"
git push
kubectl annotate application sicat -n argocd argocd.argoproj.io/refresh=hard --overwrite
```

**Por que este passo vem antes de ligar o provedor:** com `WHATSAPP_PROVIDER=disabled` não existe job
de canal nenhum, então a raia nasce inerte e a janela entre o `Recreate` do worker default e o do
channel não perde trabalho. Invertendo a ordem, existe uma janela em que `WORKER_LANE=default` já
filtra `whatsapp.*` e **ninguém consome** — jobs órfãos, sem erro de log.

> ⚠️ **Argo com `selfHeal: true`.** `kubectl apply` e `kubectl set env` soltos são revertidos.
> Manifesto vai **pelo git**, sempre.
>
> ⚠️ **A imagem tem de ser a desta cadeia.** `WORKER_LANE=channel` numa imagem sem `lib/job-lanes.ts`
> cai em `all` (`resolveWorkerLane` devolve `'all'` para qualquer valor desconhecido, de propósito) e
> você fica com **dois consumidores da fila inteira**.

#### 🔴 PONTO DE NÃO-RETORNO 1 — a migration `020` é aplicada aqui, sem passo próprio

`AUTO_MIGRATE=true` está na `sicat-api` **e** na `sicat-worker`. A `020` estreia no boot deste
rollout, automaticamente. `runMigrations` **não tem advisory lock** (`src/db/migrate.ts`: `select` →
`begin` → SQL → `insert` → `commit`): dois bootstraps simultâneos colidem em `23505` na PK de
`schema_migrations`, o perdedor lança, e `server.ts` não tem try/catch no top-level await enquanto
`worker.ts` faz `exit 1` — **api + worker em CrashLoop simultâneo**. Autocura no restart, mas o
rollout tem de ser escalonado:

```powershell
kubectl -n apps rollout status deploy/sicat-api --timeout=300s   # PRIMEIRO, ate Ready
kubectl -n apps rollout restart deploy/sicat-worker              # SO DEPOIS
```

O `sicat-worker-channel` sobe com `AUTO_MIGRATE=false`/`AUTO_SEED=false` — não participa da corrida.

A `020` é aditiva (`create table if not exists conversation_channel_verifications`) e **não toca**
`conversation_channel_links` (migration 011). **Não há down migration.**

**Verificar:**

```sql
select id from schema_migrations where id like '020%';
select count(*) from conversation_channel_verifications;
```

#### 🔴 PONTO DE NÃO-RETORNO 2 — o regime de RBAC muda neste mesmo boot

A linha `CONVERSATION_PERMISSION_ENFORCEMENT: observe` está **no diff retido, não no git**
(`git show HEAD:apps/sicat/k8s/backend.yaml` não tem nenhuma ocorrência da chave). Se você commitar
só a raia e deixar a linha de fora, os três pods sobem em **`enforce`** — que é o default do código —
e a janela de observação do runbook de RBAC nunca acontece: você descobre quem seria negado
**negando**.

**Verificar depois do rollout:**

```powershell
kubectl -n apps get deploy sicat-api sicat-worker sicat-worker-channel
kubectl -n apps get endpoints sicat-worker-metrics sicat-worker-channel-metrics
kubectl -n apps logs deploy/sicat-worker-channel | Select-String 'WORKER_LANE|startup'
```

```promql
# tem de aparecer amostra dos TRES pods; antes disso qualquer zero e zero por falta de coleta
count by (pod) (sicat_conversation_permission_decision_total)
```

### Passo 4 — ligar o provedor

Acrescente ao manifesto, nos **três** Deployments, e commite:

```yaml
- name: WHATSAPP_PROVIDER
  value: "twilio"          # ou "meta"
- name: WHATSAPP_WEBHOOK_URL
  value: "https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook"
- name: WHATSAPP_BUSINESS_NUMBER
  value: "5511..."         # E.164 sem '+'
```

- **`WHATSAPP_WEBHOOK_URL` é config, nunca reconstruída do `req`** — e entra no HMAC do Twilio. Se a
  URL configurada no provedor divergir **um byte** (esquema, query, barra final), é 403 em 100% dos
  webhooks, **e só em produção**, porque em dev ninguém assina.
- **`WHATSAPP_BUSINESS_NUMBER` vazio pula a guarda `foreign_business_number`** sem WARN de boot — o
  código só testa `if (businessNumber && …)`. Em WABA compartilhada, preencher é obrigatório.
- **Twilio:** `WHATSAPP_TWILIO_ACCOUNT_SID`, `_AUTH_TOKEN`, `_FROM`. Os três obrigatórios; faltando
  qualquer um, o envio devolve `503 WHATSAPP_PROVIDER_NOT_CONFIGURED`. O `AUTH_TOKEN` também é a
  chave do HMAC-SHA1 — sem ele a verificação é fail-closed.
- **Meta:** `_PHONE_NUMBER_ID`, `_ACCESS_TOKEN` (envio), `_APP_SECRET` (sem ele a verificação
  retorna `false` sempre), `_VERIFY_TOKEN` (sem ele o GET responde 403), `_GRAPH_VERSION` = `v21.0`.

#### 🔴 PONTO DE NÃO-RETORNO 3 — a rota pública deixa de ser 404

`GET|POST /sicat/api/v1/channels/whatsapp/webhook` é a **primeira rota pública do SICAT**: está na
lista `PUBLIC_PATH_PREFIXES` de `middlewares/auth.ts` (isenta do `authMiddleware` global) e o
`k8s/ingressroute.yaml` não põe ForwardAuth nela. A autenticidade vem **da assinatura HMAC**, não do
gate. Com o provedor `disabled` ela responde 404 e o mundo não a distingue de inexistente; ligada,
aceita POST assinado de qualquer origem que tenha o segredo.

**Verificar antes de assinar o webhook no provedor:**

```powershell
curl.exe -i "https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook"
curl.exe -i -X POST "https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook" -d '{}'
```

403 nos dois é o desfecho **correto** (fail-closed sem assinatura). 404 = o provedor não pegou.
**200 no POST sem assinatura = PARE, a verificação está quebrada.**

### Passo 5 — registrar o webhook no provedor

**Twilio:** aponte o número (ou o sandbox) para a URL. O HMAC é sobre `WHATSAPP_WEBHOOK_URL` + os
parâmetros ordenados.

**Meta:** o GET de verificação leva `hub.verify_token` **na query string**.

#### 🔴 PONTO DE NÃO-RETORNO 4 — `WHATSAPP_META_VERIFY_TOKEN` é segredo de uso único

O `morgan` é pulado nessa rota justamente para não mandar a query para o Loki (`app.ts:51`), **mas o
access log do Traefik registra a URI antes do app e está fora do alcance desse skip** — o comentário
no próprio `app.ts` diz isso. Depois de a verificação passar, o token **já vazou**. Rotacione
imediatamente. É consequência aceita e escrita, não bug a corrigir na hora.

**Verificar:** `sicat_channel_inbound_received_total` e `sicat_channel_inbound_enqueued_total`
começam a subir; `sicat_channel_inbound_dropped_total`, por label, revela `foreign_business_number`,
`stale`, `invalid_phone` (`lib/channel-metrics.ts`).

### Passo 6 — vincular o primeiro telefone (há UI, não precisa de `curl`)

`https://dev.nvit.com.br/sicat/perfil/canais` (`frontend/src/router.js:240`, `WhatsAppLinkView.vue`).
A rota é `requiresActiveCetesbAccount: false` de propósito: revogar um número (aparelho roubado) não
pode depender da CETESB.

Fluxo: `POST /v1/sicat/channel-links` → **202** ("o envio foi aceito", nunca "chegou") →
`POST /v1/sicat/channel-links/challenges/:id/confirm` → 200 idempotente.

**Verificar:**

```sql
select id, channel_type, external_user_key, status from conversation_channel_links;
select id, outcome, send_count, attempt_count
  from conversation_channel_verifications order by created_at desc limit 5;
```

> ℹ️ A tabela `conversation_channel_verifications` guarda **três coisas** discriminadas por
> `channel_type`: `whatsapp` (o desafio de vínculo), `whatsapp_action` (o ticket de confirmação) e
> `whatsapp_stepup` (a janela de ação N2). O `check` de `outcome` **não tem `executed`** — a fase 5
> reusa `verified` para "ação executada" para não criar uma segunda migration inédita. Está escrito
> aqui para não confundir quem for ler a trilha.

#### 🔴 PONTO DE NÃO-RETORNO 5 — número verificado É identidade

A partir da fase 3, um `from` verificado autentica turnos **sem token**.
`CHANNEL_LINK_ALLOW_TRANSFER=true` (default) faz posse comprovada **transferir** o vínculo — correto,
porque operadoras reciclam números, mas significa que quem provar posse do chip entra como o dono
anterior. Desligar é a opção **insegura**. Revogação: `DELETE /v1/sicat/channel-links/:linkId`.

### Passo 7 — turno somente-leitura ponta a ponta

Mande "quais MTRs eu emiti esse mês?" do telefone vinculado. Consultas funcionam **sem nenhum
PATCH**: as tools read-only já nascem com `whatsapp` em `allowChannels`
(`conversation-policy-service.ts`); só as **ações** nascem sem.

**Verificar:**

```sql
select id, operation, status, attempts, claimed_by, created_at
  from jobs where operation like 'whatsapp.%' order by created_at desc limit 10;
```

`claimed_by` **tem de ser `worker-channel`**. Se vier `worker-default`, a raia não pegou. Se ficar
`queued` para sempre, o `sicat-worker-channel` não está no ar — é o modo de falha silencioso.

### Passo 8 — (opcional) liberar AÇÕES N1

Duas travas independentes, **ambas** necessárias:

**(a)** `WHATSAPP_ACTIONS_ENABLED=true` nos três Deployments, via git.

**(b)** Overlay em `ai_tools`, **chave por chave**, com confirmação explícita:

```
PATCH /sicat/api/v1/ai-control/runtime/tools/print_manifest
Authorization: Bearer <sessao admin do SICAT>
{ "allowChannels": ["whatsapp","native_chat","inapp"], "confirmed": true }
```

`confirmed: true` é **obrigatório** ao ADICIONAR canal externo. **Revogar nunca exige nada** — botão
de pânico não pede senha. Requer `AI_CONTROL_READONLY=false`.

Só faz efeito em **3 chaves N1**, e o teto é de código (`WHATSAPP_ELIGIBLE_ACTIONS`, congelada):
`print_manifest` (1 item), `manifest.batch_print_selected` (≤ 5),
`manifest.replicate_segmented` (≤ 2). Um PATCH numa tool fora dessa tabela **não adiciona canal
nenhum**.

**Verificar:** `GET /v1/ai-control/runtime/tools/print_manifest` traz `whatsapp` em `allowChannels`.
Depois, uma 2ª via confirmada por código de 6 dígitos ponta a ponta, com o aviso de conclusão
chegando ao telefone (`sicat_channel_outbound_notice_total`).

---

## 4. Como DESLIGAR

Ordem inversa, do mais rápido ao mais completo. **Nada aqui depende de banco.**

### 4.1 Cortar as ações, manter a consulta (segundos, sem deploy)

`PATCH` em cada tool liberada, removendo `whatsapp` de `allowChannels`. Revogar não exige
`confirmed`. Efeito imediato, sem restart.

### 4.2 Cortar todas as ações de uma vez (minutos, via git)

`WHATSAPP_ACTIONS_ENABLED=false` nos três Deployments. O turno passa a receber `allowActions: false`
independentemente de qualquer overlay de runtime.

### 4.3 Desligar o canal inteiro (minutos, via git)

`WHATSAPP_PROVIDER=disabled` nos três Deployments. O webhook volta a responder **404** e nenhum job
de canal é criado. Os vínculos e a trilha permanecem no banco, intactos.

> ⚠️ `kubectl set env` compra os minutos até o Argo sincronizar, mas **é revertido** pelo `selfHeal`.
> A forma durável é sempre o commit + `kubectl annotate application sicat -n argocd
> argocd.argoproj.io/refresh=hard --overwrite`.

### 4.4 Revogar um número específico (segundos, pela UI)

`DELETE /v1/sicat/channel-links/:linkId`, ou a tela `/perfil/canais`. É o caminho para aparelho
perdido/roubado, e por isso não depende de conta CETESB ativa.

### 4.5 Desmontar a raia de fila (só se for reverter o manifesto)

Reverter o commit de O1. **Atenção à ordem inversa:** remova primeiro `WORKER_LANE=default` do
`sicat-worker` (voltando-o a `all`, que consome tudo) e só depois derrube o `sicat-worker-channel` —
caso contrário existe uma janela em que nenhum consumidor reivindica `whatsapp.*`. Com o provedor já
`disabled` (4.3) a janela é inócua, porque não há job de canal sendo criado. **Faça 4.3 antes.**

### 4.6 O que o desligamento NÃO desfaz

- a migration `020` (não há down migration);
- os vínculos verificados em `conversation_channel_links`;
- o regime de RBAC — ele tem rollback próprio, em
  [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md).

---

## 5. Modos de falha que não gritam

| Sintoma | Causa | Como confirmar |
|---|---|---|
| Job `whatsapp.*` fica `queued` para sempre, **sem erro de log** | `WORKER_LANE=default` no ar e `sicat-worker-channel` fora | `select claimed_by from jobs where operation like 'whatsapp.%'` |
| Dois consumidores da fila inteira | `WORKER_LANE=channel` numa imagem **sem** `lib/job-lanes.ts` → `resolveWorkerLane` cai em `all` | comparar a tag da imagem com a desta cadeia |
| 403 em 100% dos webhooks, **só em produção** | `WHATSAPP_WEBHOOK_URL` diverge da URL registrada no Twilio | comparar byte a byte, inclusive barra final e query |
| Webhook 404 com o provedor configurado | `WHATSAPP_PROVIDER` com valor fora de `twilio`/`meta` | `resolveWhatsAppProvider()` devolve `null` |
| Turno roda **duas vezes** | `WHATSAPP_TURN_TIMEOUT_MS` (120 s) próximo demais de `WORKER_CLAIM_STALE_TIMEOUT_MS` (300 s) | manter folga larga entre os dois |
| Execução dupla de operação CETESB | bug **pré-existente** de heartbeat por lote: `claimJobs(10)` reivindica 10, `startClaimHeartbeat` só começa na vez de cada job → jobs 2..N com heartbeat congelado viram candidatos de `requeueStaleRunningJobs`. O manifesto mitiga **só na raia de canal** (`WORKER_BATCH_SIZE=1`); a raia `default` segue exposta | `select id, attempts, claimed_by from jobs where status = 'running'` |
| `would_deny{channel="whatsapp"} = 0` interpretado como prova | **zero de construção**: nenhuma tool de ação lista `whatsapp` até a liberação do passo 8 | tratar a liberação do canal como flip próprio, com janela própria |

---

## 6. Rate limit e escala

O limitador de turnos é **em memória** (`createRateLimiter(40, 5 * 60 * 1000)` em
`routes/conversation-routes.ts`), chaveado por `userId`. Correto para 1 réplica com `Recreate`; se
escalar, vira contagem **por réplica**. O balde de ingestão global
(`WHATSAPP_INBOUND_GLOBAL_PER_MINUTE=600`) é **global, não por IP** — sem `trust proxy`, `req.ip` é o
pod do Traefik.

**Não há coalescing:** 3 mensagens seguidas = 3 turnos = 3 chamadas de LLM (contido pelo teto por
vínculo, `WHATSAPP_INBOUND_PER_LINK=12` por 5 min).

---

## 7. N2 — o que NÃO dá para ligar

**Emitir MTR pelo WhatsApp não é ligável por configuração nesta entrega.**

`whatsapp-confirmation-flow.ts:207` declara `const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = false;` —
**literal de código**. O gate na linha 293 é
`if (!WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED || !resolveWhatsAppOutboundNoticeEnabled())`. Nenhum
`WHATSAPP_ACTION_NOTICE_ENABLED=true` o contradiz: a env abre **uma** das duas condições.
`submit_manifest` e `manifest.batch_submit_selected` recusam com texto próprio.

**A razão não é falta de tempo:** o aviso de conclusão **não distingue "o MTR não foi criado" de "o
MTR foi criado e eu perdi a resposta"** — e para emissão irreversível essa é exatamente a única
informação que importa.

Destravar exige, além do código, **execução real em sandbox com transcrição, em sucesso E em falha**.
A lista fechada de critérios está em `whatsapp-confirmation-flow.ts` (a partir da linha ~198).

Independentemente disso, o **N3** é recusado por lista de elegibilidade de código
(`CHANNEL_HARD_DENY`, 10 chaves): todos os cancelamentos, os três CDF, `manifest.receive_with_receipt`,
`manifest.create_from_payload`, `manifest.create_draft` e `replicate_manifest` direto. Um `PATCH` do
AI Control Center **não fura** essa lista — as duas listas são disjuntas e a invariante é verificada
**no import** (o processo não sobe se alguém relaxar).

---

## 8. O que NÃO fazer

- **Não** setar `WHATSAPP_ACTION_NOTICE_ENABLED=true` esperando destravar emissão (§7).
- **Não** ligar `WHATSAPP_MEDIA_DELIVERY_ENABLED` sem decisão organizacional escrita (O8).
- **Não** hardcodar `whatsapp` em `allowChannels` no `tool-registry.ts` — a alavanca é o runtime do
  AI Control Center, que é auditável e revogável em segundos.
- **Não** desativar uma permissão para "destravar alguém" — faz o oposto do que parece; ver
  [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md).
- **Não** alargar o papel-piso `sicat.reader`: `POST /v1/sicat/auth/register` é público, então
  alargá-lo promove a internet inteira, sobrevive a restart e some da métrica.
- **Não** mudar `CHANNEL_LINK_OTP_TTL_SECONDS` sem mudar o texto de `WHATSAPP_LINK_OTP_TEMPLATE` —
  o default do template diz "Vale por 10 minutos" **por extenso**.

---

## 9. Referências

- [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) — regime de permissão, seed, flip e rollback.
- [taxonomia-status-erros-operacionais.md](taxonomia-status-erros-operacionais.md) — status operacionais canônicos.
- [CHANGELOG-WHATSAPP-CHANNEL.md](../CHANGELOG-WHATSAPP-CHANNEL.md) — release notes da cadeia.
- [estado-atual.md](../10-estado-atual/estado-atual.md) — o que está entregue e o que não está.
- Checkpoints: [docs/handoffs/whatsapp-channel-sicat/](../handoffs/whatsapp-channel-sicat/).
