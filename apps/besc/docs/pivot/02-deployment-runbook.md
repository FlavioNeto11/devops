---
title: "Pivot ADR-010 — runbook de deploy F1/F2 (backup, migração, validação, rollback)"
status: canonical
applies_to: [besc]
updated: 2026-09-26
language: pt-BR
---

# Runbook de deploy — F1/F2 do pivot ADR-010

> **Não executado.** Os comandos abaixo foram derivados dos manifestos (`apps/besc/k8s/*`,
> `platform/argocd/apps/besc.yaml`) e **não** foram rodados contra um cluster BESC: a máquina onde
> este runbook foi escrito não tem o ambiente BESC. Cada passo que muda o cluster exige aprovação
> do operador (AGENTS.md). O ensaio que existe é o **dry run local**
> (`api/test/migration-dry-run.pg.test.mjs`), com o mesmo schema anterior e um `besc.json`
> representativo, executado duas vezes sem nenhuma duplicação.

## 0. O que este deploy faz

| Item | Efeito |
|---|---|
| Imagem `besc-api` nova | No boot, `AUTO_MIGRATE=true` aplica `0006`→`0011`, cria o papel `besc_app`, remove as permissões do papel `investor` e migra `cases` do `besc.json` para reivindicações. **A troca de imagem é a migração.** |
| `BESC_DB_REQUIRE_APP_ROLE=true` | Sem `BESC_DB_APP_PASSWORD` no secret `besc-db`, a fundação NÃO liga: portal público no ar, rotas com login respondem 503. Comportamento fail-closed intencional. |
| `k8s/kustomization.yaml` sem `besu.yaml` | Com `prune: true`, o Argo **apaga** `Deployment besc-besu`, o `Service` e o **PVC `besc-besu-data`** (nó de teste, sem valor de produção). |
| Casos marcados `[caso-fonte:` | Não migram por padrão (`SKIPPED_SEEDED_CASE`). Migrá-los é decisão explícita: `BESC_MIGRATE_SEEDED_CASES=migrate`. |

Nomes usados (dos manifestos): namespace `apps`; deployments `besc-api`, `besc-frontend`,
`besc-postgres`; PVCs `besc-data` (montado em `/data`: `besc.json`, `uploads/`, `evidence/`,
`library/`, `jurisprudence/`) e `besc-pgdata`; secrets `besc-db` e `besc-config` (SealedSecret);
Application Argo `besc` no namespace `argocd`, `targetRevision: main`, `automated: { prune, selfHeal }`.

> **Windows:** `kubectl cp` com caminho `C:\…` quebra (o `:` vira separador de pod). Use caminhos
> **relativos** no destino local, como já avisa o `CLAUDE.md` do app. Prefira bash (Git Bash/WSL)
> para os comandos com redirecionamento binário.

## 1. PRECHECK

```bash
kubectl -n argocd get application besc -o jsonpath='{.status.sync.status} {.status.health.status} {.status.sync.revision}{"\n"}'
```
```bash
kubectl -n apps get deploy besc-api besc-frontend besc-postgres besc-besu -o wide
```
```bash
kubectl -n apps get pvc besc-data besc-pgdata besc-besu-data
```
Contagem estrutural do `besc.json` (sem PII):
```bash
kubectl -n apps exec deploy/besc-api -- node -e "const s=require('/data/besc.json');const c=Object.values(s.cases||{});const a=c.reduce((n,x)=>n+(x.documents||[]).reduce((m,d)=>m+((d.attachments||[]).length),0),0);console.log(JSON.stringify({cases:c.length,attachments:a,seeded:c.filter(x=>/\[caso-fonte:/.test(x.notes||'')).length,status:c.reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{})}))"
```
Espaço livre no volume de dados:
```bash
kubectl -n apps exec deploy/besc-api -- df -h /data
```

Decisões a registrar ANTES do deploy (no PR ou no ticket):

1. **Casos semeados.** Com o número `seeded` acima: manter o padrão (não migrar) ou definir
   `BESC_MIGRATE_SEEDED_CASES=migrate` no `besc-api`.
2. **Credencial do papel de runtime.** Gerar uma senha forte e acrescentar `BESC_DB_APP_PASSWORD` ao
   SealedSecret `besc-db` (fluxo kubeseal de `k8s/secret.example.yaml.tmpl`). Sem isso a fundação
   não liga (seção 0).
3. **Janela.** Pausar o auto-sync do Argo durante backup e migração:
```bash
kubectl -n argocd patch application besc --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
```

## 2. BACKUP

Quiesce a API (nenhuma escrita durante o backup):
```bash
kubectl -n apps scale deploy/besc-api --replicas=0
```
```bash
kubectl -n apps rollout status deploy/besc-api --timeout=120s
```

**PostgreSQL** (dump dentro do pod, depois cópia com caminho relativo):
```bash
kubectl -n apps exec deploy/besc-postgres -- sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/besc-pre-adr010.dump && sha256sum /tmp/besc-pre-adr010.dump'
```
```bash
kubectl -n apps cp "$(kubectl -n apps get pod -l app.kubernetes.io/name=besc-postgres -o jsonpath='{.items[0].metadata.name}')":/tmp/besc-pre-adr010.dump ./besc-pre-adr010.dump
```
Também os papéis do cluster (o papel `besc_app` é global):
```bash
kubectl -n apps exec deploy/besc-postgres -- sh -c 'pg_dumpall -U "$POSTGRES_USER" --roles-only' > ./besc-roles-pre-adr010.sql
```

**PVC `besc-data`** (`besc.json`, `uploads/` com os anexos dos casos, `evidence/`, `library/`,
`jurisprudence/`), por um pod auxiliar que monta o volume só para leitura:
```bash
kubectl -n apps run besc-backup --image=alpine:3.20 --restart=Never --overrides='{"spec":{"securityContext":{"fsGroup":1000},"containers":[{"name":"b","image":"alpine:3.20","command":["sh","-c","cd /data && find . -type f -exec sha256sum {} + > /tmp/manifest.sha256 && tar czf /tmp/besc-data.tgz . && sleep 3600"],"volumeMounts":[{"name":"d","mountPath":"/data","readOnly":true}]}],"volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"besc-data","readOnly":true}}]}}'
```
```bash
kubectl -n apps wait --for=condition=Ready pod/besc-backup --timeout=120s
```
Aguarde o `tar` terminar (o arquivo para de crescer) e copie:
```bash
kubectl -n apps cp besc-backup:/tmp/besc-data.tgz ./besc-data-pre-adr010.tgz
```
```bash
kubectl -n apps cp besc-backup:/tmp/manifest.sha256 ./besc-data-pre-adr010.sha256
```
```bash
kubectl -n apps delete pod besc-backup
```
Opcional (dado de teste): o mesmo procedimento para `besc-besu-data`, que o prune vai apagar.

Conferência local: `tar tzf besc-data-pre-adr010.tgz | wc -l` bate com as linhas do manifesto;
`pg_restore -l besc-pre-adr010.dump` lista as tabelas `audit_event`, `users`, `security_title`.

## 3. MIGRATION

1. Merge do PR em `main` (é o que o Argo sincroniza).
2. Build das imagens `:local` a partir de `main` (Node fixado em 20.20.2 nos Dockerfiles):
```bash
docker build -t besc-api:local apps/besc/api
```
```bash
docker build -t besc-frontend:local apps/besc/frontend
```
3. Reativar o sync (aplica manifestos novos, remove o Besu) e reiniciar com as imagens novas:
```bash
kubectl -n argocd patch application besc --type merge -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
```
```bash
kubectl -n apps rollout restart deploy/besc-api deploy/besc-frontend
```
```bash
kubectl -n apps rollout status deploy/besc-api --timeout=300s
```
4. Log esperado do boot (uma vez):
```bash
kubectl -n apps logs deploy/besc-api --tail=200 | grep -E "migrate|foundation|recovery|ledger"
```
Deve conter `aplicado: 0006_audit_v2.sql` … `0011_valuation_label_binding.sql`,
`runtime como besc_app (modo login)` e `migração LegacyCase -> Claim (casos semeados: …)` com
`FAILED: 0`. **Não** deve conter `modo set_role` nem `papel de runtime indisponível`.

## 4. VALIDATION

```bash
curl -s https://dev.nvit.com.br/besc/api/health
```
Esperado: `"dbRuntime":{"mode":"login","role":"besc_app"}`.

No banco (papel de migração, leitura):
```bash
kubectl -n apps exec deploy/besc-postgres -- psql -U besc -d besc -Atc "SELECT version FROM schema_migrations ORDER BY 1"
```
```bash
kubectl -n apps exec deploy/besc-postgres -- psql -U besc -d besc -Atc "SELECT (SELECT count(*) FROM claim), (SELECT count(*) FROM evidence), (SELECT count(*) FROM registered_asset), (SELECT count(*) FROM recognized_right), (SELECT string_agg(DISTINCT value_type||'/'||legal_status, ',') FROM valuation), (SELECT state FROM governance_gate WHERE key='multi_issuer_research_gate')"
```
Esperado: claims = casos − semeados (ou = casos com `migrate`); evidências = anexos com id UUID;
`registered_asset = 0`; `recognized_right = 0`; valores só `claimed_value/SOURCE_CLAIM` e
`expert_estimate/SOURCE_CLAIM`; gate `CLOSED`.
```bash
kubectl -n apps exec deploy/besc-postgres -- psql -U besc -d besc -Atc "SELECT * FROM audit_chain_verify(NULL)"
```
Esperado: `first_broken_id` vazio.
```bash
kubectl -n apps exec deploy/besc-postgres -- psql -U besc -d besc -Atc "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.key='investor'; SELECT rolsuper, rolcanlogin FROM pg_roles WHERE rolname='besc_app'"
```
Esperado: `0` e `f|t`.

HTTP (sem login): rotas da tese antiga respondem 410; reivindicações exigem login.
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://dev.nvit.com.br/besc/api/titles/x/batches
```
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dev.nvit.com.br/besc/api/recovery/claims
```
Esperado: `410` e `401`. A home em `https://dev.nvit.com.br/besc` mostra a Plataforma de Pesquisa e
Recuperação de Ativos Legados, sem "Investir".

**Nunca** rode a suíte de testes contra o `besc-postgres` do cluster: ela usa só bancos descartáveis.

## 5. ROLLBACK

Critério: `FAILED > 0` na migração, `/health` sem `mode: login`, cadeia de auditoria quebrada ou
contagens divergentes na seção 4.

O schema é **só para frente**. A imagem antiga sobe no schema novo (verificado no dry run: a trilha
v1 continua gravando), **mas** o `seedRbac` antigo devolve as permissões ao papel `investor`, e as
rotas e telas do marketplace voltam. Por isso o rollback é **completo**: banco + volume + imagens +
manifestos, juntos.

1. Pausar o Argo (comando da seção 1) e parar a API:
```bash
kubectl -n apps scale deploy/besc-api --replicas=0
```
2. Restaurar o banco a partir do dump:
```bash
kubectl -n apps cp ./besc-pre-adr010.dump "$(kubectl -n apps get pod -l app.kubernetes.io/name=besc-postgres -o jsonpath='{.items[0].metadata.name}')":/tmp/restore.dump
```
O banco é **recriado** antes da restauração: `pg_restore --clean` só apaga o que está no dump
antigo, e as tabelas novas (0006–0011) sobreviveriam, quebrando um novo deploy.
```bash
kubectl -n apps exec deploy/besc-postgres -- sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB" && psql -U "$POSTGRES_USER" -d postgres -c "DROP ROLE IF EXISTS besc_app"'
```
```bash
kubectl -n apps exec deploy/besc-postgres -- sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner /tmp/restore.dump && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT max(version) FROM schema_migrations"'
```
Esperado: `0005_receita_gate.sql`.

> **Ensaiado localmente (26/09/2026)** com `docker exec` no lugar de `kubectl exec`, na imagem
> `pgvector/pgvector:pg16`: banco no estado 0001–0005 → `pg_dump -Fc` → migração 0006–0011 pelo
> código real → os dois comandos acima. Resultado: `max(version) = 0005_receita_gate.sql`, tabelas
> novas ausentes, trilha v1 preservada. O `DROP ROLE besc_app` falha se OUTRO banco do mesmo
> servidor ainda conceder algo a ele (foi o caso no ensaio); no cluster BESC há um banco só. Se
> falhar, o papel pode ficar: a `0008` o reaproveita num novo deploy.
3. Restaurar o volume `besc-data` (o boot novo pode ter regravado o catálogo no `besc.json`): pod
   auxiliar como na seção 2, com o volume **gravável**, `kubectl cp` do `.tgz` e
   `tar xzf besc-data-pre-adr010.tgz -C /data`; conferir com o manifesto `sha256`.
4. Reverter o merge em `main` (`git revert -m 1 <merge>`), rebuild das imagens `:local` do commit
   anterior, reativar o sync. Isso recria o `besc-besu` com volume vazio.
5. Se o rollback for só de imagem, sem restaurar o banco (não recomendado): depois do boot antigo,
   reaplicar o `DELETE` de `sql/0009_deprecate_investor_role.sql` como papel de migração.

## 6. POSTCHECK

```bash
kubectl -n argocd get application besc -o jsonpath='{.status.sync.status} {.status.health.status}{"\n"}'
```
```bash
kubectl -n apps get deploy besc-besu
```
```bash
kubectl -n apps get pvc besc-besu-data
```
Esperado: `Synced Healthy`; `besc-besu` e `besc-besu-data` **NotFound** (prune).

- Guardar os artefatos de backup (dump, roles, tgz, manifesto) por no mínimo 30 dias.
- Registrar no PR: contagens da seção 4, decisão sobre casos semeados, horário da janela.
- Revisar a trilha: `GET /audit/verify` (papel com `audit:read`) retorna `ok: true`.

## 7. NO GOVERNANCE MUTATION API IN F1/F2

Não existe rota para alterar gates de governança nem capacidades nesta fase, por decisão. Provas
automáticas (suíte anti-Excalibur, teste 16): nenhuma rota não-GET de gate/capacidade fora do
congelamento; o papel `besc_app` só tem `SELECT` em `governance_gate`; nenhuma migration faz
`UPDATE governance_gate`; `multi_issuer_research_gate` nasce `CLOSED`; as capacidades reais são
constantes congeladas (`TOKENIZATION_REAL`, `MARKETPLACE_REAL`, `REAL_MONEY`, `REAL_INVESTMENT` =
`false`), sem variável de ambiente. Abrir um gate exige ADR novo, migration própria e aprovação
quatro-olhos `GATE_CHANGE`.
