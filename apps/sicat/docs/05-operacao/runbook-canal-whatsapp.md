# Runbook — ativação do canal conversacional WhatsApp

> Cadeia `whatsapp-channel-sicat` (fases 0–7, branch `sicat/whatsapp-channel`, 2026-08-06/08).
> Este runbook cobre **ligar o canal do zero**, o que verificar entre cada passo, os pontos de
> não-retorno e **como desligar**. O regime de permissão do chat tem runbook próprio —
> [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) — e **não é duplicado aqui**.

**Estado inicial real, hoje:** `WHATSAPP_PROVIDER=disabled` (default do código), migration `020`
nunca aplicada em banco nenhum, seed do catálogo RBAC nunca executado contra este Postgres,
`k8s/backend.yaml` **modificado e não commitado**. Nada do canal está no ar.

> ## 🔴 CORREÇÃO DE FATO — 2026-08-08, conferida contra os arquivos
>
> Versões anteriores deste runbook afirmavam que o `k8s/backend.yaml` retido **criava** o Deployment
> `sicat-worker-channel`, os 2 Services headless de métrica e injetava `WORKER_LANE=default`, num diff
> de **+208 linhas**, e mandavam operar sobre **TRÊS** Deployments. **Isso é falso.** Medido:
>
> | Afirmação anterior | Realidade verificada |
> |---|---|
> | diff retido de +208 linhas | **+12 linhas** (`diff` entre a versão commitada, 294 linhas, e a retida, 306) |
> | cria `sicat-worker-channel` | **não existe** — `grep -rl 'sicat-worker-channel' apps/sicat/k8s/` não retorna nada, nem na árvore commitada nem na retida |
> | cria `sicat-worker-metrics` / `sicat-worker-channel-metrics` | **não existem** em manifesto nenhum |
> | injeta `WORKER_LANE=default` | **`WORKER_LANE` não aparece em nenhum manifesto** |
> | "os TRÊS Deployments" | são **DOIS**: `sicat-api` e `sicat-worker` (`k8s/backend.yaml` tem 1 PVC, 2 Deployments e 1 Service) |
>
> **O que o diff retido realmente contém:** exatamente dois blocos
> `CONVERSATION_PERMISSION_ENFORCEMENT: "observe"` — um na `sicat-api`, um na `sicat-worker` — com
> seus comentários. Nada mais.
>
> **Consequência operacional, e ela é pior que a documentada:** a raia de fila do canal **não é
> trabalho retido, é trabalho que não existe**. O código dela existe
> ([lib/job-lanes.ts](../../backend/src/lib/job-lanes.ts), e `WORKER_LANE` ausente ⇒ `all`), mas
> **nenhum manifesto a instancia**. Enquanto for assim, o bloqueio nomeado em O1 continua de pé
> inteiro: o worker é consumidor serial único e um turno de LLM de 90 s bloqueia `manifest.submit`
> por 90 s. Todo `kubectl ... deploy/sicat-worker-channel` deste documento **falha com `NotFound`**;
> as ocorrências abaixo foram corrigidas, mas trate qualquer sobrevivente como erro de texto.

---

## 1. Antes de qualquer coisa: o que está desligado e por quê

| Chave | Default | O que o código faz com o default |
|---|---|---|
| `WHATSAPP_PROVIDER` | `disabled` | `resolveWhatsAppProvider()` devolve `null`; o webhook responde **404** no GET e no POST (`routes/channel-webhook-routes.ts:78,110`) — indistinguível de rota inexistente |
| `WHATSAPP_ACTIONS_ENABLED` | `false` | `processTurn` recebe `allowActions: false`. Nenhuma linha de `ai_tools` contorna |
| `WHATSAPP_ACTION_NOTICE_ENABLED` | `false` | portão do N2 — **e não basta**, ver §7 |
| `WHATSAPP_MEDIA_DELIVERY_ENABLED` | `true` (O8 decidida: ligada) | com política ligada, a entrega ainda depende de capacidade — só o provedor Meta aceita bytes. Twilio degrada para texto com rótulo `skipped_media_provider_unsupported` na métrica; `false` desliga por política (`skipped_media_disabled`) |
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
| **O1a** | **Commitar `k8s/backend.yaml`.** O arquivo está modificado e **retido de propósito**, mas o diff é de **+12 linhas**: só a `CONVERSATION_PERMISSION_ENFORCEMENT: observe` na `sicat-api` e na `sicat-worker`. `platform/argocd/apps/sicat.yaml` tem `automated: {prune: true, selfHeal: true}` sobre `apps/sicat/k8s` — **commitar é aplicar** | A janela de observação do RBAC não pode começar; e commitar o arquivo SEM essa linha sobe os pods em `enforce` (ponto de não-retorno 2) |
| **O1b** | **🔴 ESCREVER a raia de fila do canal — ela NÃO existe em manifesto.** Não há Deployment `sicat-worker-channel`, não há os Services de métrica, não há `WORKER_LANE` em lugar nenhum de `apps/sicat/k8s/`. O código da raia existe e nasce inerte; falta o manifesto que a instancia. **Isto é trabalho a fazer, não um arquivo a commitar** | O canal não pode ser ligado: o worker é consumidor serial único e um turno de LLM de 90 s bloqueia `manifest.submit` por 90 s. Além disso, a coleta de métrica dos workers continua sem Service (§3, passo 3) |
| **O2** | **Passo 0 do runbook de RBAC** — validar o SQL do seed contra o Postgres em transação descartável, com `ON_ERROR_STOP=1`, colando o bloco 2× para provar idempotência, e anexar a evidência ao PR. Bloqueante e manual: **nenhum teste executa os statements do seed** | Regime de permissão sobe sem prova de que o seed roda |
| **O3** | **Aplicar a migration `020`** (`020_channel_link_verifications.sql`) — **nunca aplicada em banco nenhum**; o DDL não foi exercitado. Não há passo "aplicar": com `AUTO_MIGRATE=true` na api **e** no worker, ela estreia sozinha no boot do rollout. A decisão é **fazer o rollout escalonado** (api Ready → depois worker), porque `src/db/migrate.ts` **não tem advisory lock** | Fases 2 e 5 inteiras são inertes; colisão dupla = CrashLoop simultâneo de api + worker |
| **O4** | **O flip do RBAC** — remover `CONVERSATION_PERMISSION_ENFORCEMENT=observe` de **TODOS** os Deployments de uma vez (**hoje são 2**: `sicat-api` e `sicat-worker`; serão 3 depois de O1b), só quando a soma de `would_deny` estiver estável em zero. Protocolo completo em [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) | Esquecer um pod deixa o canal fail-open com todo mundo achando que fechou — e o `sicat-worker-channel`, quando existir, é o que avalia a policy dos turnos de WhatsApp |
| **O5** | **D-A2 — o escudo anti-bombing tranca o dono de primeira viagem.** Quem nunca vinculou um número pode ser trancado por N+1 contas descartáveis, em janela renovável (`CHANNEL_LINK_VICTIM_SHIELD_DISTINCT_USERS=3` / `_WINDOW_HOURS=24`), **sem escape no produto**. Escolher: step-up de identidade fora de banda **ou** ação de suporte que libera o número. Explicitamente **não** resolver por sinal fraco (IP, idade da conta) — reabriria o bombing multi-conta | Vítima sem caminho de recuperação |
| **O6** | **D-A5 — auditar (ou não) o `MAX_LINKS_REACHED` no `start`.** O `confirm` já audita; a pré-checagem é anterior a qualquer prova de posse e hoje não deixa rastro | Buraco de trilha, risco baixo |
| **O7** | **Credenciais do provedor** — `WHATSAPP_PROVIDER` + as chaves Twilio ou Meta. `kubeseal` **não existe nesta máquina** (verificado no PATH de Machine+User), e `sicat-config` é um SealedSecret sob Argo: ou se instala o `kubeseal` e re-sela, ou se usa o precedente do próprio repo (Secret plain fora do git + `secretKeyRef` explícito, que vence o `envFrom` — é o que `reqhub-api-config` já faz em `k8s/backend.yaml`) | O canal não existe |
| **O8** | **DECIDIDA — `WHATSAPP_MEDIA_DELIVERY_ENABLED` ligada por default** (decisão do operador). O PDF do MTR carrega CNPJ, endereço, resíduo e responsável; a organização assumiu o custo. `false` reverte por env, sem código. A entrega continua condicionada à capacidade: só o provedor Meta aceita bytes (Twilio degrada para texto, com `skipped_media_provider_unsupported` na métrica e warn mascarado no log) | Nenhum — cada degradação tem rótulo próprio na métrica |
| **O9** | **Liberar `allowChannels` das tools de ação para `whatsapp`** — pelo AI Control Center, **em runtime**, chave por chave, nunca hardcoded no `tool-registry.ts` (§9) | O canal segue somente-leitura |
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
N2: DUAS trancas, e virar uma só não faz nada. Checklist E1-E5 em §7.
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

### Passo 3 — escrever a raia (O1b) e commitar o manifesto, com o canal ainda DESLIGADO

> 🔴 **Este passo tem duas metades, e a primeira ainda não foi feita.** O manifesto retido contém
> **só** a linha `observe` (+12 linhas). O Deployment `sicat-worker-channel`, os 2 Services headless
> de métrica e o `WORKER_LANE=default` no worker **precisam ser escritos** — não existem em
> `apps/sicat/k8s/`. Enquanto não existirem, pule direto para o passo 4 apenas se aceitar que o
> canal compartilha o worker serial com `manifest.submit`, o que a O1b desaconselha.

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

O `sicat-worker-channel`, **quando for escrito** (O1b), deve subir com
`AUTO_MIGRATE=false`/`AUTO_SEED=false` para não participar desta corrida.

A `020` é aditiva (`create table if not exists conversation_channel_verifications`) e **não toca**
`conversation_channel_links` (migration 011). **Não há down migration.**

**Verificar:**

```sql
select id from schema_migrations where id like '020%';
select count(*) from conversation_channel_verifications;
```

#### 🔴 PONTO DE NÃO-RETORNO 2 — o regime de RBAC muda neste mesmo boot

A linha `CONVERSATION_PERMISSION_ENFORCEMENT: observe` está **no diff retido, não no git**
(`git show sicat/whatsapp-channel:apps/sicat/k8s/backend.yaml` não tem nenhuma ocorrência da chave).
Se você commitar o arquivo e deixar a linha de fora, os pods sobem em **`enforce`** — que é o default
do código — e a janela de observação do runbook de RBAC nunca acontece: você descobre quem seria
negado **negando**.

**Verificar depois do rollout** (hoje são **2** Deployments; acrescente o terceiro depois de O1b):

```powershell
kubectl -n apps get deploy sicat-api sicat-worker
kubectl -n apps get deploy -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].env[?(@.name=="CONVERSATION_PERMISSION_ENFORCEMENT")].value}{"\n"}{end}'
```

```promql
# tem de aparecer amostra de TODOS os pods que avaliam policy; antes disso qualquer zero
# e zero por falta de coleta
count by (pod) (sicat_conversation_permission_decision_total)
```

> ⚠️ **A coleta do `sicat-worker` NÃO está resolvida.** O `ServiceMonitor` seleciona *Services*, e o
> único Service de `k8s/backend.yaml` é o `sicat-api`. Os Services headless
> `sicat-worker-metrics` / `sicat-worker-channel-metrics` **não existem** (parte de O1b). Enquanto
> não existirem, a métrica do worker **não é raspada** e todo zero na consulta acima é zero por
> falta de coleta — inclusive para o critério objetivo do flip de RBAC.

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

**Com a raia escrita (O1b feito):** `claimed_by` tem de ser `worker-channel`. Se vier
`worker-default`, a raia não pegou. Se ficar `queued` para sempre, o `sicat-worker-channel` não está
no ar — é o modo de falha silencioso.

**Sem a raia (situação de hoje):** `claimed_by` vem `worker-default` e isso é o **esperado**, não um
defeito — sem `WORKER_LANE` em manifesto nenhum, `resolveWorkerLane` devolve `all` e o worker único
consome tudo. O preço é o descrito em O1b: um turno de LLM de 90 s bloqueia `manifest.submit` pelo
mesmo tempo.

### Passo 8 — (opcional) liberar AÇÕES N1

Duas travas independentes, **ambas** necessárias:

**(a)** `WHATSAPP_ACTIONS_ENABLED=true` em TODOS os Deployments do backend (**hoje 2** — `sicat-api` e `sicat-worker`; 3 depois de O1b), via git.

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

`WHATSAPP_ACTIONS_ENABLED=false` em TODOS os Deployments do backend (**hoje 2** — `sicat-api` e `sicat-worker`; 3 depois de O1b). O turno passa a receber `allowActions: false`
independentemente de qualquer overlay de runtime.

### 4.3 Desligar o canal inteiro (minutos, via git)

`WHATSAPP_PROVIDER=disabled` em TODOS os Deployments do backend (**hoje 2** — `sicat-api` e `sicat-worker`; 3 depois de O1b). O webhook volta a responder **404** e nenhum job
de canal é criado. Os vínculos e a trilha permanecem no banco, intactos.

> ⚠️ `kubectl set env` compra os minutos até o Argo sincronizar, mas **é revertido** pelo `selfHeal`.
> A forma durável é sempre o commit + `kubectl annotate application sicat -n argocd
> argocd.argoproj.io/refresh=hard --overwrite`.

### 4.4 Revogar um número específico (segundos, pela UI)

`DELETE /v1/sicat/channel-links/:linkId`, ou a tela `/perfil/canais`. É o caminho para aparelho
perdido/roubado, e por isso não depende de conta CETESB ativa.

### 4.5 Desmontar a raia de fila (só se for reverter o manifesto)

> ℹ️ **Não se aplica hoje** — a raia não existe em manifesto (O1b). Esta seção vale a partir do
> momento em que ela for escrita e commitada.

Reverter o commit de O1b. **Atenção à ordem inversa:** remova primeiro `WORKER_LANE=default` do
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
| Manifesto `failed` cuja mensagem manda reenviar — e o MTR **existe** na CETESB | janela cega do `manifest.submit`: o `manHashCode` só nasce na resposta do PUT, e a falha terminal grava `failed` **sem consultar a CETESB** | procurar o marcador `[sicat:<manifestId>]` no `manObservacao` do portal antes de reenviar — **§8** |
| `WHATSAPP_ACTION_NOTICE_ENABLED=true` "não pegou" | pegou; ela abre **uma** das duas trancas do N2 e a outra é literal de código | §7.1 |

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

## 7. N2 — o que NÃO dá para ligar, e o checklist para destravar

**Emitir MTR pelo WhatsApp não é ligável por configuração nesta entrega.** É a manchete do canal, e
ela não está entregue ao usuário final. Toda a maquinaria existe — janela de ação, débito de crédito,
revogação, textos, métricas — e está **testada**; o que falta é evidência, não código.

### 7.1 As duas trancas que o operador vira (e a terceira, que ele não vira)

Quem chega aqui em pânico precisa desta frase antes de qualquer outra: **são duas trancas, e virar
uma só não faz absolutamente nada.**

| # | Tranca | Onde | Estado | Quem vira |
|---|---|---|---|---|
| 1 | `const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = false;` | [whatsapp-confirmation-flow.ts:207](../../backend/src/services/conversation/channel/whatsapp/whatsapp-confirmation-flow.ts) | **`false`** | commit de código |
| 2 | `WHATSAPP_ACTION_NOTICE_ENABLED` (`config.whatsappActionNoticeEnabled`, [config.ts:338](../../backend/src/lib/config.ts)) | env dos **três** Deployments | default **`false`** | commit de manifesto |
| 3 | `whatsapp.outbound_notice` ∈ `CHANNEL_LANE_OPERATIONS` | [whatsapp-outbound-notice-service.ts:93](../../backend/src/services/conversation/channel/whatsapp/whatsapp-outbound-notice-service.ts) | **já satisfeita** — o processo não sobe se deixar de ser | ninguém: é invariante de import |

O gate, literal, em `whatsapp-confirmation-flow.ts:293`:

```ts
if (!WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED || !resolveWhatsAppOutboundNoticeEnabled()) {
  return { text: WHATSAPP_N2_NOTICE_MISSING_TEXT, outcome: 'whatsapp_inbound_action_notice_missing' };
}
```

É um **OU** de duas negações: basta uma ser falsa para recusar. `WHATSAPP_ACTION_NOTICE_ENABLED=true`
sozinho abre a condição 2 e a 1 continua fechando — o efeito visível é **zero**, e o operador que
tentou isso vai ficar convencido de que a env "não pegou". Ela pegou; ela só não basta.

A terceira não é uma alavanca, é uma cerca: se alguém tirar `whatsapp.outbound_notice` de
`CHANNEL_LANE_OPERATIONS` ([lib/job-lanes.ts](../../backend/src/lib/job-lanes.ts)), o import de
`whatsapp-outbound-notice-service.ts` **lança e o processo não sobe**. Ela existe porque, numa
instalação `WORKER_LANE=default` + `channel`, o aviso não seria reivindicado por consumidor nenhum e
o N2 estaria liberado num canal onde o desfecho é invisível — exatamente o que o portão evita.
Um portão que **não pode** ser mal configurado vale mais que um que depende de alguém configurar certo.

### 7.2 O checklist — E1 a E5, transcritas do código

Estas cinco linhas **não são um resumo**: são a lista fechada escrita em
`whatsapp-confirmation-flow.ts:195–204`, que é a fonte da verdade. **Faltando QUALQUER item, o portão
fica fechado.** Se o código e esta tabela divergirem, o código vence e esta tabela é que está errada.

| # | Evidência exigida | Situação hoje |
|---|---|---|
| **E1** | execução real ponta a ponta em sandbox, com transcrição, **em sucesso E em falha** | ❌ impossível hoje: `WHATSAPP_PROVIDER=disabled` é o default e **as credenciais Twilio/Meta não existem** neste ambiente (decisão O7). Nada da cadeia rodou contra provedor real |
| **E2** | `WORKER_LANE=channel` no ar, com a raia `default` separada | ❌ depende de **O1b** — a raia **não existe em manifesto nenhum** (ver a correção de fato no topo), então este item não está a um commit de distância: é código de infra a escrever |
| **E3** | `dispatchStatus` carimbado no desfecho, verificado **numa linha real** | ⚠️ o código existe (`recordDispatchOutcome`, `whatsapp-confirmation-flow.ts:873`); falta a **evidência** numa linha de banco |
| **E4** | decisão explícita sobre a cauda **fora da janela de 24 h** — templates UTILITY APPROVED, **ou** a aceitação registrada de que emissão que termina fora da janela não é empurrada | ❌ decisão de produto, não escrita |
| **E5** | um mecanismo que responda **"o MTR nasceu na CETESB?"** depois de uma falha de `manifest.submit` — e a decisão de produto sobre o que dizer quando a resposta é *"não sei"* | ⚠️ **parcial** — ver §8: a chave de correlação (C1) está costurada, o reconciliador (C2) e a varredura (C3) existem e estão **inertes**, sem consumidor |

O próprio código separa as duas naturezas: **E1–E4 são trabalho conhecido; E5 é escopo próprio.**

### 7.3 O passo, quando (e só quando) E1–E5 estiverem satisfeitas

Um único PR, com as duas trancas no mesmo diff — separar em dois PRs cria uma janela em que alguém
lê o literal `true` e conclui que o N2 está ligado:

1. **Código** — em `whatsapp-confirmation-flow.ts:207`, trocar `false` por `true`, **e reescrever o
   comentário de bloco acima dele** para registrar qual evidência satisfez cada item de E1 a E5, com
   link. Deixar o comentário antigo (que afirma que o portão está fechado) é a sexta ocorrência do
   defeito que esta cadeia já cometeu cinco vezes: texto afirmando propriedade que o código não tem.
2. **Manifesto** — `WHATSAPP_ACTION_NOTICE_ENABLED: "true"` em **TODOS** os Deployments do backend
   em `k8s/backend.yaml` (hoje `sicat-api` e `sicat-worker`; mais `sicat-worker-channel` depois de
   O1b). Esquecer um deles faz o chat prometer e o job recusar, com o motivo aparecendo só na trilha.
3. **Overlay** — `PATCH` em `submit_manifest` e/ou `manifest.batch_submit_selected` com
   `confirmed: true` (§3, passo 8b). Sem isto, as trancas abertas não liberam nada: a tool continua
   sem `whatsapp` em `allowChannels`.
4. **Janela de ação** — N2 exige, **além** do ticket de 6 dígitos, uma janela aberta na sessão web
   autenticada (`whatsapp_stepup`). Sem janela viva o pedido para em
   `whatsapp_inbound_stepup_required` e **nenhum ticket é criado**.

**Rollback:** `WHATSAPP_ACTION_NOTICE_ENABLED=false` (env, minutos, via git) ou revogar o
`allowChannels` pelo AI Control Center (segundos, sem deploy). Revogar nunca exige `confirmed`.

### 7.4 O N3 continua recusado, independentemente de tudo isto

`CHANNEL_HARD_DENY` ([whatsapp-action-eligibility.ts:83–94](../../backend/src/services/conversation/channel/whatsapp/whatsapp-action-eligibility.ts)),
**8 chaves**: os três cancelamentos, os três CDF, `manifest.create_draft` e `replicate_manifest`
direto. Um `PATCH` do AI Control Center **não fura** essa lista — as duas listas são disjuntas e a
invariante é verificada **no import** (o processo não sobe se alguém relaxar).

> **Eram dez.** `manifest.receive_with_receipt` e `manifest.create_from_payload` saíram da recusa
> permanente porque o motivo delas — *"não há conferência visual no canal"* — deixou de valer: as
> prévias dedicadas montam a conferência item a item e **recusam o ticket** quando não conseguem
> montá-la. As duas foram para a lista de elegíveis, logo continuam dependendo do portão acima.
>
> Cada uma das quatro chaves N2 recusa com **texto próprio**, com o verbo certo — "emitir", "dar
> baixa", "criar" —, e não com uma mensagem genérica. Reusar o texto de `submit` para a criação
> afirmaria efeito na CETESB que ela não tem (ver §7.5).

> ✅ **A armadilha do `manifest.create_draft` foi fechada** — ela era a única ação de default de
> código com `requiresConfirmation: false`, contida **apenas** por estar nesta lista. Passou a
> `confirmedActionIntentPolicy('R2')`, e `assertEveryActionRequiresConfirmation()` agora prende a
> invariante no import das duas tabelas de política. Ou seja: a recusa de canal deixou de ser a
> única coisa que segurava aquela chave.
> **Procedência:** branch `sicat/wa-u3-policy-confirm` (`ba404b9d`, **PR #296**), **ainda não
> mesclada** em `sicat/whatsapp-channel` quando este runbook foi escrito.

> ℹ️ **Conferido em 2026-08-08 na árvore consolidada:** `manifest.receive_with_receipt` e
> `manifest.create_from_payload` **continuam em `CHANNEL_HARD_DENY`** e **não** aparecem em
> `WHATSAPP_ELIGIBLE_ACTIONS`. Recebimento e criação por WhatsApp **não** são ações elegíveis, nem
> como N2. Se algum documento ou comentário disser o contrário, ele está adiantado em relação ao
> código — confira `whatsapp-action-eligibility.ts:54–94` antes de acreditar.

---

## 8. MTR duplicado: a janela cega do envio, e o que já existe para fechá-la

Este risco **não é do canal WhatsApp** — é de todo `manifest.submit`, pela tela inclusive. Está aqui
porque é a evidência **E5**, o item que sozinho segura o N2.

### 8.1 O quadro, hoje

O `manHashCode` só nasce na **resposta** do PUT da CETESB. Se essa resposta se perde — timeout, erro
de parse, o pod morrendo entre o PUT e o commit local — o SICAT não sabe se o MTR nasceu. E o que ele
faz com essa dúvida, hoje, é **resolvê-la para o lado errado**:

- `applyManifestSubmitTerminalFailureSideEffect`
  ([operation-handlers.ts:754–759](../../backend/src/workers/operation-handlers.ts)) grava
  `status: 'failed'` **sem consultar a CETESB**;
- `reconcileManifestSubmitState`
  ([manifest-service.ts:1127](../../backend/src/services/manifest-service.ts)) decide o mesmo olhando
  apenas o status do **job local** — nunca a CETESB;
- e a mensagem que o operador lê é
  `'Falha definitiva no envio para CETESB. Revise os dados e realize novo envio.'`
  ([operation-handlers.ts:162–172](../../backend/src/workers/operation-handlers.ts)).

Ou seja: quando o MTR **nasceu** e a resposta se perdeu, o produto marca `failed` e **manda reenviar**
— e o reenvio cria um **segundo MTR real** na CETESB, com número, data e trilha novos. Cancelar não
resolve: cancelamento não tem inverso, e o desenho do canal recusa cancelar.

### 8.2 O que o Track C já entregou (verificado por leitura)

| Unidade | O que é | Estado no código |
|---|---|---|
| **C1** — marcador de correlação | `[sicat:<manifestId>]` determinístico, concatenado ao `manObservacao` **sem sobrescrever** a observação do usuário e de forma **idempotente** ([lib/manifest-correlation.ts](../../backend/src/lib/manifest-correlation.ts)) | ✅ **costurado ponta a ponta** |
| **C2** — reconciliador | [services/manifest-submit-reconciler.ts](../../backend/src/services/manifest-submit-reconciler.ts) — dado um manifesto indeterminado, pergunta à CETESB via `searchManifests` injetado e casa o item remoto **pelo marcador**; polling 2s/5s/10s/15s/20s; resultado tipado `found` \| `not-found-after-polling` \| `error` | 🕓 **INERTE** — nenhum consumidor em `src/`, só o teste importa |
| **C3** — varredura | `listUnconfirmedSubmitManifestsForReconciliation` ([manifest-repo.ts:457](../../backend/src/repositories/manifest-repo.ts)) — lista manifestos presos em `queued_submit`/`submitting`/`processing` com `external_hash_code` **NULO**, com janela de tempo obrigatória | 🕓 **INERTE** — nenhum consumidor em `src/`, só os testes chamam |

O que C1 fecha, concretamente: a intenção (`submitCorrelation` = marcador + `jobId` + `dispatchedAt`)
é gravada no `payload` jsonb da linha local **ANTES** da chamada ao gateway
([operation-handlers.ts:1069–1072](../../backend/src/workers/operation-handlers.ts), e 1260–1265 para
o MTR provisório), e o gateway concatena o mesmo marcador ao `manObservacao` do payload enviado
([cetesb-gateway.js:1322](../../backend/src/gateways/cetesb-gateway.js), alimentado por
`correlationManifestId` na linha 2283). Como o `manObservacao` **volta** no resultado de
`searchManifests`, o envio passa a ser reencontrável. **Sem migration** — vive no `payload`.

### 8.3 O que ainda NÃO existe — dito sem maquiagem

- **O estado `submit_unconfirmed` NÃO EXISTE.** `grep -r submit_unconfirmed backend/src frontend/src`
  não retorna nada na árvore consolidada de 2026-08-08. Falha terminal de `manifest.submit` continua
  gravando `failed`.
- **Ninguém chama o reconciliador.** C2 e C3 entraram declaradamente **inertes**; a integração é
  trabalho separado, em curso no momento em que este runbook foi escrito.
- Portanto **E5 continua NÃO satisfeita**, e o N2 continua fechado.

> ⚠️ **Aviso de honestidade:** o desenho descrito em §8.4 (estado `submit_unconfirmed` + reconciliador
> acionado na falha) é o **desenho acordado**, não o código conferido. Foi escrito enquanto a unidade
> responsável ainda implementava. **Não confirmei nenhuma das três afirmações de §8.4 lendo o
> código** — quando a integração entrar, confira `operation-handlers.ts` e o job de reconciliação
> antes de operar por este texto.

### 8.4 O desenho da integração (NÃO CONFIRMADO em código — ver aviso acima)

1. Falha terminal de `manifest.submit` deixa de gravar `failed` direto: se houver `submitCorrelation`
   no payload, o manifesto vai para **`submit_unconfirmed`** — "não sei se nasceu" — em vez de
   "não nasceu".
2. Um reconciliador pergunta à CETESB (C2 sobre C3): `found` promove a linha ao MTR real, com
   `manCodigo`/`manNumero`/`manHashCode`; `not-found-after-polling` autoriza a conclusão de que não
   nasceu, e **só aí** vira `failed`.
3. `SUBMIT_RECONCILE_AMBIGUOUS_MARKER_MATCH` é o caso em que dois remotos casam o mesmo marcador —
   ambiguidade é erro explícito, nunca um palpite.

**O que o operador faz ao ver `submit_unconfirmed`:**

- 🔴 **NÃO reenvie.** É a única regra que importa. `submit_unconfirmed` significa literalmente
  "pode existir um MTR seu na CETESB"; reenviar é o caminho conhecido para o MTR duplicado.
- Espere o reconciliador: o orçamento de polling é de ~52 s de espera somada, em 5 tentativas.
- Se ele terminar em `not-found-after-polling`, a linha vira `failed` e **aí sim** reenviar é correto.
- Se terminar em `error` ou em ambiguidade, **confira no portal da CETESB** pelo marcador
  `[sicat:<manifestId>]` no campo de observação antes de qualquer nova ação.
- Para achar o marcador de um manifesto:
  ```sql
  select id, status, payload -> 'submitCorrelation' ->> 'marker' as marcador,
         payload -> 'submitCorrelation' ->> 'dispatchedAt' as enviado_em
    from manifests where id = '<manifestId>';
  ```

---

## 9. O que NÃO fazer

- **Não** setar `WHATSAPP_ACTION_NOTICE_ENABLED=true` esperando destravar emissão (§7).
- **Não** esperar anexo em instalação Twilio: com a política ligada (O8, default atual) o provedor
  sem suporte a bytes degrada para texto — o sinal é `skipped_media_provider_unsupported` na métrica
  e o warn mascarado no log, não uma falha do aviso.
- **Não** hardcodar `whatsapp` em `allowChannels` no `tool-registry.ts` — a alavanca é o runtime do
  AI Control Center, que é auditável e revogável em segundos.
- **Não** desativar uma permissão para "destravar alguém" — faz o oposto do que parece; ver
  [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md).
- **Não** alargar o papel-piso `sicat.reader`: `POST /v1/sicat/auth/register` é público, então
  alargá-lo promove a internet inteira, sobrevive a restart e some da métrica.
- **Não** mudar `CHANNEL_LINK_OTP_TTL_SECONDS` sem mudar o texto de `WHATSAPP_LINK_OTP_TEMPLATE` —
  o default do template diz "Vale por 10 minutos" **por extenso**.

---

## 10. Referências

- [runbook-rbac-conversacional.md](runbook-rbac-conversacional.md) — regime de permissão, seed, flip e rollback.
- [taxonomia-status-erros-operacionais.md](taxonomia-status-erros-operacionais.md) — status operacionais canônicos.
- [CHANGELOG-WHATSAPP-CHANNEL.md](../CHANGELOG-WHATSAPP-CHANNEL.md) — release notes da cadeia.
- [estado-atual.md](../10-estado-atual/estado-atual.md) — o que está entregue e o que não está.
- [13-decision-log.md](../copilot/13-decision-log.md) — DL-101 (canal) e DL-102 (correlação pré-submit).
- Checkpoints: [docs/handoffs/whatsapp-channel-sicat/](../handoffs/whatsapp-channel-sicat/).
