# ADR-002 — Postgres novo (`besc-postgres`) e convivência com o store JSON

Status: **DECISÃO — revisar**

Contexto: hoje toda a persistência do BESC é um único arquivo JSON em PVC
(`/data/besc.json`, escrita atômica serializada — `api/src/store.js:51-62`), sem transação, sem FK,
sem imutabilidade imposta e sem tipos numéricos. O marketplace exige exatamente isso (contratos com
valor travado, contabilidade de dupla entrada, trilha `audit_event` com REVOKE/trigger, unique
parciais). Ao mesmo tempo, o motor de pendências/risco/status do levantamento
(`computePendencies`/`suggestStatus`/`computeRisk`) opera sobre o **documento** embutido do caso e
funciona bem. Agravante a corrigir antes: `GET /cases/:id` **grava na leitura** — chama
`saveAndEnrich` (`api/src/server.js:193-197`), que regrava o caso, bumpa `updatedAt` e pode aplicar
auto-status (`api/src/server.js:95-104`); `updatedAt` hoje não é confiável como "última edição".

Decisão: criar um **Postgres dedicado `besc-postgres`** (padrão single-replica dos apps da
plataforma — `apps/sicat/k8s/postgres.yaml` como referência —, Secret via Sealed Secrets, migrations
no boot com advisory lock) como dono **exclusivo** de identidade/RBAC, marketplace, receita, ledger
e auditoria. Os **cases e o portal de conhecimento (library/jurisprudence/glossary) permanecem no
store JSON**; a ligação entre as zonas é a referência soft `security_title.case_id`. A migração de
cases para Postgres (`cases(id, doc JSONB)`, preservando o shape do documento) é uma fase
**opcional e tardia** (F5 em [02-modelo-de-dados](../02-modelo-de-dados.md) §6) — nunca condição
para o marketplace. **Pré-requisito técnico da fase F0**: eliminar o write-on-read do
`GET /cases/:id` — o enriquecimento (`enrichCase`) passa a ser aplicado só em memória no GET, e o
auto-status só em mutações. Leitura jamais grava.

Alternativas rejeitadas:
- **Migrar cases para Postgres já na Fase 0** (proposta do design de receita/portais): big-bang de
  risco alto sem ganho — o motor de pendências opera sobre o documento e teria de ser reescrito ou
  envelopado, atrasando a fundação (auth/RBAC/auditoria) que é o que destrava tudo.
- **Fazer o marketplace sobre o store JSON**: inviável — sem transação não há trava de valor nem
  supply consistente; sem roles/REVOKE/trigger não há trilha imutável (a imutabilidade precisa ser
  imposta pelo banco, não por disciplina de aplicação).
- **Banco único desde já (tudo no Postgres, JSON aposentado)**: mais "limpo" no papel, mas quebra o
  levantamento em produção durante a fase mais crítica e não remove nenhum bloqueio real.
- **SQLite/arquivo relacional embutido**: não oferece roles/REVOKE por usuário nem o padrão
  operacional (backup, Sealed Secrets, manifests) já provado na plataforma.

Consequências: (+) o motor de pendências/risco fica **intocado**; cada fase é aditiva e reversível
(a base JSON nunca é destruída); o marketplace nasce com transação, FK e imutabilidade de verdade;
o padrão operacional de Postgres da plataforma é reaproveitado como está. (−) duas zonas de
persistência para operar (backup do PVC **e** do Postgres); integridade case↔título validada em
aplicação, não por FK (mitigada pelo unique em `case_id` + gate de elegibilidade); consultas que
cruzam case × título exigem duas leituras. Invariantes criados: Postgres é a única fonte de verdade
de identidade/dinheiro/auditoria; o JSON é a única fonte de verdade do levantamento e do conteúdo
público; nenhuma rota de leitura tem efeito colateral de escrita.

Revisão pendente: confirmar com o operador (Flavio) (a) que a migração de cases fica mesmo fora do
caminho crítico (F5 opcional); (b) o dimensionamento do PVC `besc-pgdata` (proposta: 2 Gi) e a
rotina de backup das duas zonas; (c) a imagem do Postgres — `postgres:16` puro ou
`pgvector/pgvector:pg16` (drop-in, útil se a base de conhecimento ganhar RAG depois).
