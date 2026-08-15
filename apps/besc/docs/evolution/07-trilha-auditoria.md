---
title: "Trilha de auditoria imutável e exportável"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 07 — Trilha de auditoria imutável e exportável

> **Posição no plano:** este documento especifica a espinha probatória do marketplace — a tabela
> `audit_event` append-only com hash-chain, as três camadas de imutabilidade, a ancoragem Merkle,
> a verificação pericial independente e a exportação. A correspondência evento de negócio →
> `audit_event` → transação on-chain está no [Apêndice A](./apendices/A-ledger-port.md); o caminho
> da ancoragem (interface `anchorAuditRoot`, outbox, adapters) está em
> [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md); o DDL normativo consolidado
> está no [Apêndice B](./apendices/B-ddl-conceitual.md).

## 1. Ponto de partida — o que existe hoje

O sistema atual não tem trilha de auditoria no sentido probatório:

- O único histórico existente é `statusHistory[]` embutido em cada caso — objeto
  `{at, from, status, mode}` sem ator, gravado nas transições automáticas
  (`api/src/server.js:101-102`), na criação (`api/src/server.js:177`) e nas transições manuais
  (`api/src/server.js:378-379`). Não há identidade: **não existe "quem"** em nenhuma escrita.
- Deletes são **físicos** — `deleteCase` remove o caso do store e apaga os uploads
  (`api/src/store.js:81-86`); o mesmo vale para library/jurisprudence/glossary
  (`api/src/store.js:121`, `:138`, `:154`). Nada sobra para auditar.
- A API não tem middleware de auth e roda com CORS `*` (`api/src/server.js:31-37`) — toda escrita
  é anônima por definição do escopo v1 (revogado pela [ADR-001](./adr/ADR-001-revogacao-principios-v1.md)).
- O checklist de tokenização já **pergunta** sobre `smart_contract`, `blockchain_type`, `whitelist`,
  `kyc` e `transfer_restriction` (`api/src/domain.js:180-184`) — este documento e o
  [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md) são a **resposta** a essas perguntas.

A trilha descrita aqui **exige Postgres** (`besc-postgres`, [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md)):
o store JSON não oferece roles, `REVOKE`, triggers nem transações — imutabilidade sobre ele é
inviável. Os cases e o conteúdo (biblioteca/jurisprudência/glossário) **permanecem no store JSON**;
a trilha nasce cobrindo o domínio novo do marketplace, e só absorve os cases numa fase opcional
tardia (ver §4, evento legado `case.status.changed`, e [02-modelo-de-dados](./02-modelo-de-dados.md)).

## 2. Princípios

1. **Append-only real** — a imutabilidade é imposta pelo banco (roles/`REVOKE`/trigger), não por
   disciplina de aplicação. Código de aplicação não tem, tecnicamente, como alterar ou apagar um
   evento gravado.
2. **Verificável sem confiar no sistema** — hash-chain + Merkle root ancorado no ledger; um perito
   valida a trilha **offline**, com ferramenta independente, sem acesso ao ambiente nem confiança
   no operador.
3. **Evento ≠ dado pessoal** — o payload é minimizado; pessoas são referenciadas exclusivamente
   por `party_id` opaco. LGPD e imutabilidade convivem por **separação estrutural** (§8).
4. **Tudo é evento** — inclusive login, mudança de parâmetro, exportação da trilha, a própria
   ancoragem e a **leitura qualificada** por advogado/juiz (§9). Quem lê a trilha também deixa
   rastro na trilha.

## 3. Modelo `audit_event`

### 3.1 DDL conceitual

```sql
CREATE TABLE audit_event (
  id             BIGSERIAL PRIMARY KEY,        -- posição na cadeia (gaps detectáveis)
  event_uid      UUID NOT NULL UNIQUE,
  occurred_at    TIMESTAMPTZ NOT NULL,         -- momento do fato de negócio
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_party_id UUID,                         -- quem agiu (opaco; NULL p/ system)
  actor_role     TEXT NOT NULL,                -- role key ativa no ato: 'manager'|'admin'|'lawyer'|'judge'|'investor'|'system'
  actor_ip_hash  TEXT,                         -- SHA-256(ip + pepper) — IP bruto é dado pessoal
  event_type     TEXT NOT NULL,                -- taxonomia fechada (§4)
  entity_type    TEXT NOT NULL,                -- 'title'|'token_batch'|'transfer'|'rental_contract'|'party'|'wallet'|'param'|'anchor'|'export'|'case'
  entity_id      TEXT NOT NULL,
  payload        JSONB NOT NULL,               -- canônico (RFC 8785/JCS), imutável, sem PII
  schema_version SMALLINT NOT NULL DEFAULT 1,
  payload_hash   TEXT NOT NULL,                -- SHA-256(JCS(payload))
  prev_hash      TEXT NOT NULL,                -- event_hash do id-1; genesis = 64 zeros
  event_hash     TEXT NOT NULL                 -- SHA-256 do encoding pré-hash canônico (§3.3)
);
CREATE INDEX ON audit_event (entity_type, entity_id);
CREATE INDEX ON audit_event (event_type, occurred_at);
CREATE INDEX ON audit_event (actor_party_id, occurred_at);
```

### 3.2 Explicação campo a campo

| Campo | Papel | Observações |
|---|---|---|
| `id` | **Posição na cadeia.** Sequência monotônica; qualquer lacuna (gap) é detectável pelo verificador | `BIGSERIAL` — nunca reutilizado; o verificador trata gap como falha de integridade |
| `event_uid` | Identificador estável para referência cruzada | Usado por `ledger_outbox.audit_event_id`, por `payload.causedByEventUid` (eventos correlacionados, ex.: mudança de status jurídico → freeze) e pelos exports |
| `occurred_at` | Momento do **fato de negócio**, informado pelo domínio | Pode diferir de `recorded_at` (ex.: pagamento registrado a posteriori); a **anterioridade provável** vem da ancoragem, não deste campo (§6.3) |
| `recorded_at` | Momento da **gravação**, pelo relógio do banco | `DEFAULT now()`; não participa do hash (é metadado operacional) |
| `actor_party_id` | Quem agiu — **UUID opaco**, resolvível na tabela `party` (apagável) | `NULL` para eventos de sistema (jobs, reconciliação, anchoring) |
| `actor_role` | Role key canônica ativa no momento do ato | Valores base: `manager`, `admin`, `lawyer`, `judge`, `investor`, `system`; o conjunto acompanha o catálogo de roles em dados ([01-rbac-permissoes](./01-rbac-permissoes.md)) — papel novo criado sem deploy aparece aqui pela role key |
| `actor_ip_hash` | `SHA-256(ip + pepper)` | O IP bruto é dado pessoal e **nunca** entra na zona imutável; o pepper (segredo da plataforma, Sealed Secrets) impede reversão por força bruta do espaço IPv4; com o pepper, a plataforma ainda consegue correlacionar acessos sob requisição judicial |
| `event_type` | Tipo do evento — **taxonomia fechada** (§4) | Formato `dominio.entidade.acao`; adicionar valor exige migration + atualização do doc pericial |
| `entity_type` / `entity_id` | Âncora da entidade principal afetada | Permite reconstituir a linha do tempo de um título, contrato, carteira ou pessoa (por id opaco) |
| `payload` | Fatos do evento, em JSON **canônico** (RFC 8785/JCS) | Sem PII — validado por **allowlist de campos por `event_type`** na escrita (§8); campos de ligação com o ledger (`tx_hash`, `block_number`, `chain_id`, `contract_address`, `log_index`, `ledger_adapter`) padronizados nos eventos `.confirmed` ([Apêndice A](./apendices/A-ledger-port.md)) |
| `schema_version` | Versão do **encoding pré-hash e do schema de payload** | Permite evoluir o encoding sem invalidar o histórico: o verificador aplica a regra da versão gravada em cada evento |
| `payload_hash` | `SHA-256(JCS(payload))` | Compromete o conteúdo do evento; o JCS garante que a serialização é reprodutível byte a byte por terceiros |
| `prev_hash` | `event_hash` do evento `id - 1`; genesis = 64 zeros | O elo da corrente: alterar qualquer evento passado invalida todos os posteriores |
| `event_hash` | `SHA-256` sobre o encoding pré-hash canônico de `(prev_hash, id, event_uid, occurred_at, event_type, entity_type, entity_id, payload_hash)` | Calculado **dentro do banco** por `append_audit_event` (§5.1) — a aplicação não fornece hashes prontos |

### 3.3 Encoding pré-hash — normativo e versionado

O encoding exato do pré-hash é um **contrato pericial**: o perito precisa reproduzi-lo byte a byte
com ferramenta própria. Por isso ele é especificado em documento normativo dedicado
(`docs/audit-hash-spec.md`, entregue junto com a implementação) e **versionado** por
`schema_version`. A especificação fixa, no mínimo:

- **ordem dos campos** concatenados: `prev_hash`, `id`, `event_uid`, `occurred_at`, `event_type`,
  `entity_type`, `entity_id`, `payload_hash`;
- **separador** entre campos (byte único, fora do alfabeto dos valores);
- **representação** de cada tipo: `id` em decimal ASCII sem zeros à esquerda; `occurred_at` em
  RFC 3339 UTC com precisão fixa; hashes em hexadecimal minúsculo; `event_uid` em forma canônica
  minúscula;
- **serialização do payload**: JSON Canonicalization Scheme (RFC 8785) antes do `payload_hash`.

Mudar qualquer detalhe do encoding exige **nova `schema_version`** — eventos antigos continuam
verificáveis pela regra antiga, novos pela nova; o verificador (§6) implementa todas as versões
publicadas.

## 4. Taxonomia de `event_type` — lista fechada

Formato `dominio.entidade.acao`, minúsculo, estável (é contrato). **Lista fechada** — adicionar um
valor exige migration + atualização do documento pericial. Payloads referenciam pessoas só por
`party_id` e documentos só por hash (`*_doc_hash`, `evidenceHash` etc.).

| Grupo | `event_type` | Quando |
|---|---|---|
| **Título / status jurídico** | `title.registered` | título entra no marketplace (a partir de um caso elegível — gate em [04-maquina-estado-juridico](./04-maquina-estado-juridico.md)) |
| | `title.updated` | dado não-jurídico do título alterado (diff no payload) |
| | `title.legal_status.changed` | transição da máquina jurídica (payload: `from`, `to` — entre os 7 estados de [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) —, `courtDecisionHash`, `processNumber`) |
| **Emissão** | `token.issuance.requested` | domínio decide emitir (payload: `splitFactor`, `amount`, `faceValueBRLCents`, `issuanceDocHash`) |
| | `token.issuance.confirmed` / `token.issuance.failed` | callback da outbox com `txHash`/`blockNumber` ou erro |
| **Transferência** | `token.transfer.requested` / `.confirmed` / `.failed` | idem (payload: `fromWallet`, `toWallet`, `amount`, `transferKind: first\|secondary\|forced`, `referenceHash`) — `first` = saída da treasury (distribuição primária, [06-modelo-receita](./06-modelo-receita.md)) |
| | `market.fee.charged` | fee da 1ª transferência liquidada (payload: valor, meio, `transferEventUid`) |
| | `market.fee.exempted` | isenção **explícita** de fee em secundária/substituição (payload: `fee_exemption_reason`, `transferEventUid`) — invariantes em [06-modelo-receita](./06-modelo-receita.md) |
| **Freeze/substituição** | `token.freeze.requested` / `.confirmed` · `token.unfreeze.requested` / `.confirmed` | espelho de `freezeTitle`/`unfreezeTitle` ([Apêndice A](./apendices/A-ledger-port.md)) |
| | `token.substitution.requested` / `.confirmed` / `.failed` | burn+mint atômico (payload: `fromTitleId`, `toTitleId`, `allocations`, `substitutionDocHash`) |
| **Aluguel (off-chain)** | `rental.contract.created` · `rental.contract.renewed` · `rental.contract.amended` · `rental.payment.recorded` · `rental.contract.terminated` | ciclo de vida da locação (payload sempre com `contractDocHash`); a entidade de domínio correspondente é `lease` em [02-modelo-de-dados](./02-modelo-de-dados.md) |
| **KYC/whitelist** | `kyc.identity.registered` · `kyc.identity.approved` · `kyc.identity.rejected` · `kyc.identity.revoked` | fluxo de compliance (payload: `partyId`, `claimsHash`, `reviewerRole`) — no arranjo base quem aprova é o Gestor (`manager`); papel dedicado de compliance pode ser criado em dados sem deploy ([01-rbac-permissoes](./01-rbac-permissoes.md)) |
| | `whitelist.wallet.linked` · `whitelist.wallet.revoked` | vínculo party↔wallet |
| **RBAC/acesso** | `auth.login.succeeded` · `auth.login.denied` · `rbac.role.granted` · `rbac.role.revoked` | segurança (ator = quem concedeu/tentou) |
| **Auditoria qualificada (leitura)** | `audit.access.granted` · `audit.access.revoked` | concessão/revogação de `title_access_grant` a advogado/juiz (ator = Gestor; payload: `grantId`, `granteePartyId`, `granteeRole`, `titleId`) |
| | `audit.access.viewed` | advogado/juiz **abre** a visão de auditoria de um título na área `/auditoria` (§9; payload: `titleId`, `viewKind`) — a leitura qualificada é, ela própria, evento |
| **Parâmetros** | `param.split_factor.changed` · `param.fee_schedule.changed` · `param.anchor_policy.changed` | payload com `oldValue`/`newValue` |
| **Auditoria/anchoring** | `audit.anchor.created` · `audit.anchor.confirmed` · `audit.anchor.failed` | ciclo da ancoragem Merkle (§5.3) |
| | `audit.export.generated` | **toda exportação é auditada** (payload: escopo, hash do manifesto, ator) |
| **Reconciliação** | `reconciliation.run.completed` · `reconciliation.divergence.detected` · `reconciliation.divergence.resolved` | job de reconciliação domínio↔ledger ([05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md)) |
| **LGPD** | `gdpr.erasure.requested` · `gdpr.erasure.executed` | payload: `partyId`, base legal, campos afetados — **sem** os dados apagados |
| **Legado (levantamento)** | `case.status.changed` | absorve o `statusHistory[]` atual (`api/src/server.js:101-102`, `:378-379`) **quando/se** a auditoria chegar aos cases — fase opcional tardia ([02-modelo-de-dados](./02-modelo-de-dados.md)); eventos retroativos levam `payload.migratedFromJson: true` |

## 5. Imutabilidade em três camadas

Nenhuma camada sozinha basta; juntas, elas cobrem adulteração por aplicação, por operador de banco
e por operador da plataforma inteira.

### 5.1 Camada 1 — o banco impede UPDATE/DELETE

```sql
CREATE ROLE besc_audit_writer LOGIN;   -- dono de append_audit_event; só INSERT em audit_event
CREATE ROLE besc_app LOGIN;            -- SELECT em audit_event; nunca UPDATE/DELETE/INSERT direto
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM PUBLIC, besc_app, besc_audit_writer;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION raise_immutable();  -- RAISE EXCEPTION sempre (defesa contra superuser distraído)
```

- A aplicação (`besc_app`) **não tem INSERT direto** na tabela. Toda escrita passa pela função
  **`append_audit_event(...)` `SECURITY DEFINER`** (dona: `besc_audit_writer`), que:
  1. adquire um **advisory lock transacional** (`pg_advisory_xact_lock`) que **serializa a cadeia**
     — elimina a corrida de `prev_hash` entre escritas concorrentes;
  2. valida o payload contra a **allowlist de campos por `event_type`** (§8) — rejeita chave fora
     do schema;
  3. lê o `event_hash` do último evento, calcula `payload_hash` e `event_hash` **dentro do banco**
     conforme o encoding da `schema_version` corrente (§3.3) e insere a linha.
- O trigger `audit_event_immutable` levanta exceção em qualquer UPDATE/DELETE — inclusive de um
  superuser distraído (um superuser deliberado consegue derrubar o trigger, e é exatamente para
  esse cenário que existem as camadas 2 e 3).
- **Escrita na mesma transação do domínio:** a rota de negócio grava a mudança de domínio, chama
  `append_audit_event` e enfileira a `ledger_outbox` **na mesma transação Postgres** — ou tudo
  entra, ou nada entra. Evento fora da transação quebraria a completude da trilha (fluxo completo
  da outbox em [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md)).
- **Backup:** `pg_dump` diário do PVC + export JSONL mensal assinado guardado **fora do cluster**.
  **DECISÃO — revisar** — destino do backup externo (NAS, object storage, mídia fria), registrado
  na [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md).

### 5.2 Camada 2 — hash-chain

Cada evento carrega `prev_hash` (o `event_hash` do anterior) e `event_hash` (que compromete
posição, identidade, tempo, tipo, entidade e payload — §3.2). Consequências:

- **alterar** qualquer evento passado muda seu `event_hash` e quebra o `prev_hash` de todos os
  posteriores;
- **remover** um evento cria gap de `id` e quebra o encadeamento;
- **inserir** retroativamente é impossível sem reescrever toda a cauda da cadeia — e a cauda está
  comprometida pelos anchors (camada 3).

A verificação (§6) reexecuta o encadeamento evento a evento, offline, sem nenhuma confiança no
banco de origem. Um superuser que derrube o trigger da camada 1 ainda é detectado aqui.

### 5.3 Camada 3 — ancoragem Merkle (RFC 6962)

A hash-chain prova consistência **interna**; a ancoragem dá **testemunho externo de anterioridade**
— prova que a cadeia existia naquele estado, naquele momento, mesmo que o operador reescrevesse
tudo (cadeia + banco) depois.

- Job **`audit-anchor`** (no worker) a cada `ANCHOR_INTERVAL` — default **10 min ou 500 eventos**,
  o que vier antes; a política é parâmetro versionado (mudança gera `param.anchor_policy.changed`).
- Árvore de Merkle **estilo RFC 6962**: prefixo `0x00` em folha e `0x01` em nó interno (previne
  ataque de second preimage); **folhas = `event_hash`** dos eventos do intervalo `[from_id, to_id]`.
- O root vai para `LedgerPort.anchorAuditRoot()` ([05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md)
  e [Apêndice A](./apendices/A-ledger-port.md)) e o resultado é registrado em `audit_anchor`:

```sql
CREATE TABLE audit_anchor (
  id            BIGSERIAL PRIMARY KEY,
  merkle_root   TEXT NOT NULL,
  from_event_id BIGINT NOT NULL,
  to_event_id   BIGINT NOT NULL,
  algorithm     TEXT NOT NULL DEFAULT 'sha256-rfc6962',
  tx_hash       TEXT, chain_id TEXT, block_number BIGINT,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | failed
  anchored_at   TIMESTAMPTZ
);
```

  Cada ciclo emite `audit.anchor.created` e, no callback, `audit.anchor.confirmed`/`.failed` —
  a ancoragem também é evento da própria cadeia.
- **A ancoragem funciona desde a Fase 0–2, no adaptador simulado** (tx determinística,
  `chain_id: "sim:1"`): o hábito operacional e o formato pericial ficam prontos **antes** do Besu.
  Na Fase 3+ o mesmo root vai à rede Besu QBFT; opcionalmente, também a carimbo de tempo externo
  (RFC 3161/ICP-Brasil ou OpenTimestamps — só o hash, nunca dados) — essa decisão de neutralidade
  probatória vive em [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md) /
  [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md).

## 6. Verificação independente (pericial)

### 6.1 Entregáveis

1. **`tools/audit-verify/` — CLI standalone** (Node, **zero dependência do app**, distribuível como
   script único e incluída em todo pacote de export). Entrada: export JSONL + `anchors.json`.
   Passos que executa:
   1. reencadeia `prev_hash`/`event_hash` evento a evento, aplicando o encoding da
      `schema_version` de cada evento;
   2. detecta gaps de `id`;
   3. reconstrói os Merkle roots por intervalo e compara com `audit_anchor`;
   4. se apontada uma RPC do ledger — ou usando os **receipts brutos anexados ao export**
      (`getProof`) — confere `tx_hash`/`block` de cada ancoragem;
   5. confere os hashes de arquivo declarados no `manifest.json` do export.
   Saída: laudo de verificação (OK/falha por passo, intervalo coberto, cabeça da cadeia).
2. **`docs/audit-verification-procedure.md`** — procedimento pericial passo a passo, em linguagem
   de laudo: o que é a cadeia, o que cada verificação prova, como validar um documento off-chain
   contra seu `*_doc_hash` (recalcular SHA-256 do PDF e comparar), como ler um receipt de ancoragem.
3. **Verificação contínua interna** — o job de reconciliação reexecuta a verificação da cadeia do
   último anchor em diante e alarma em divergência (`reconciliation.divergence.detected`).

### 6.2 O que a verificação PROVA

- **Integridade:** nenhum evento do intervalo verificado foi alterado ou removido após a gravação.
- **Completude sequencial:** não há eventos suprimidos (gaps de `id`).
- **Ordem:** os eventos ocorreram na ordem registrada (a posição está comprometida no hash).
- **Anterioridade:** todo evento coberto por um anchor confirmado existia, naquele estado, no
  momento do anchor — com testemunho do ledger (e do carimbo externo, quando contratado).
- **Atribuição de registro:** cada evento foi registrado sob determinado ator (`actor_party_id`/
  `actor_role`) e os hashes de documentos citados (`*_doc_hash`) correspondem aos arquivos
  apresentados.

### 6.3 O que a verificação NÃO prova

- **Veracidade do fato narrado.** A trilha prova que *o registro* foi feito daquela forma, naquele
  momento — não que o fato do mundo real aconteceu como descrito. É prova de integridade e
  anterioridade do registro, não de verdade material.
- **Completude semântica.** Não prova que *todo* fato relevante virou evento — código malicioso
  poderia deixar de registrar algo *antes* da gravação. Mitigação: escrita na mesma transação do
  domínio (§5.1) + reconciliação domínio↔ledger, que expõe estados sem eventos correspondentes.
- **Identidade civil do ator.** A trilha registra `party_id` opaco; o vínculo com a pessoa depende
  da tabela `party` e do processo de KYC, fornecidos ao juízo em documento apartado (§8).
- **O instante do fato (`occurred_at`).** Esse campo é informado pelo domínio; o que a ancoragem
  garante é o **limite superior** — o evento certamente existia no momento do anchor.

## 7. Exportação

| Aspecto | Especificação |
|---|---|
| Formatos | **JSONL** (1 evento canônico por linha — formato pericial primário) · **CSV** (colunas achatadas, para financeiras/planilha) · **PDF sumário** (linha do tempo legível, totais, avisos legais — para juntada aos autos) |
| Escopos | `by_title` (titleId) · `by_wallet` (wallet ou partyId — este último só para papéis autorizados) · `by_period` (from/to) · `by_contract` (locação/venda) · `full` (auditoria plena) |
| Pacote | ZIP: `events.jsonl` + `anchors.json` (com receipts brutos via `getProof`) + `manifest.json` + `summary.pdf` + **cópia do `audit-verify`** (o verificador viaja junto com a prova) |
| `manifest.json` | `{exportId, generatedAt, scope, fromEventId, toEventId, fileHashes: {"events.jsonl": sha256, ...}, chainHeadHash, anchorsIncluded}` |
| Assinatura/carimbo | Fases 0–2: hash do manifesto **registrado como evento `audit.export.generated` na própria cadeia** — o export fica "pregado" na trilha ancorada. Fase 3+: assinatura digital ICP-Brasil (CAdES/JWS no manifesto, PAdES no PDF) + carimbo de tempo RFC 3161. **DECISÃO — revisar** — escolha do certificado e da AC de carimbo, registrada na [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md) |
| Acesso | `manager`/`admin` em qualquer escopo; `lawyer`/`judge` **somente** nos títulos com `title_access_grant` ativo (escopo `by_title`) — matriz completa no [Apêndice C](./apendices/C-matriz-rbac.md). **Toda geração é auditada** (`audit.export.generated`) — saber quem exportou o quê é, em si, exigência PLD-FT |

Por padrão, os exports saem com `party_id` opaco; a tabela de correspondência party↔pessoa é
fornecida ao tribunal **separadamente e sob demanda** (documento apartado, nunca incluído no
pacote padrão) — ver §8.

## 8. LGPD × imutabilidade

O aparente conflito ("registro imutável" × "direito de eliminação") é resolvido por **separação
estrutural**, não por exceção:

- **`party_id` opaco.** `audit_event.payload` referencia pessoas **exclusivamente** por `party_id`
  (UUID); nome/CPF/e-mail vivem na tabela `party` — tabela normal, apagável/anonimizável, fora da
  zona imutável.
- **Eliminação por quebra de vínculo.** O direito de eliminação (LGPD art. 18 V/VI) é atendido
  apagando/anonimizando a linha de `party`: a cadeia permanece íntegra e os eventos remanescentes
  tornam-se **irreversivelmente não atribuíveis** (anonimização por quebra de vínculo). A execução
  gera `gdpr.erasure.requested`/`gdpr.erasure.executed` — sem incluir os dados apagados.
- **Retenções que prevalecem.** Registros exigidos por PLD-FT/COAF e pelo exercício regular de
  direitos em processo (LGPD art. 7º II, VI e X; art. 16) têm base legal para retenção mesmo após
  pedido de eliminação — inclusive o dossiê `kyc_record`. A política de retenção por categoria
  (`kyc_record`, `party`, eventos) é documento próprio, alinhado ao gate regulatório
  ([10-gate-regulatorio](./10-gate-regulatorio.md), itens `kyc_aml_pldft` e `lgpd`).
  **DECISÃO — revisar** — prazos de retenção por categoria, com assessoria jurídica; registrada na
  [ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md).
- **Validador allowlist de payload.** A escrita (`append_audit_event`, §5.1) valida o payload
  contra uma **allowlist de campos por `event_type`** e rejeita evento com chave fora do schema —
  impede vazamento acidental de PII para dentro da zona imutável. É a barreira técnica que torna a
  minimização verificável, não apenas prometida.
- **IP com hash + pepper.** `actor_ip` só entra como `SHA-256(ip + pepper)` (§3.2) — nunca o IP
  bruto.

## 9. Leitura qualificada — advogado e juiz na trilha

A área `/auditoria` ([08-portais-perfis](./08-portais-perfis.md)) dá a advogado (`lawyer`) e juiz
(`judge`) acesso **read-only** aos títulos que lhes foram concedidos. O princípio §2.4 se aplica
integralmente: **acessos de auditoria são eventos** —

1. a **concessão** do acesso pelo Gestor gera `audit.access.granted` (e a revogação,
   `audit.access.revoked`), com `grantId`, `granteePartyId` e `titleId` no payload;
2. cada **abertura** da visão de auditoria de um título gera `audit.access.viewed` — a linha do
   tempo de um título mostra, portanto, também *quem o examinou e quando*;
3. cada **export** feito por advogado/juiz gera `audit.export.generated`, restrito ao escopo
   `by_title` do grant (§7).

Isso fecha o ciclo probatório: a mesma trilha que o auditor usa para verificar o sistema registra
a atuação do próprio auditor — simetria exigível em contexto de disputa judicial.

## 10. O que o auditor vê em cada camada

| Camada | O que prova | Ferramenta |
|---|---|---|
| Domínio (Postgres) | Estado corrente (saldo, status, contratos) — **não é prova**, é operação | UI/relatórios |
| `audit_event` (hash-chain) | **Que cada fato foi registrado naquela ordem, naquele momento, por aquele ator, e nada foi alterado/removido depois** | export JSONL + `audit-verify` (§6) |
| `audit_anchor` + ledger | **Que a cadeia existia no estado X no momento do anchor** (anterioridade), com testemunho do ledger — e do carimbo externo, se contratado | receipt/`getProof` + explorer (Blockscout na fase Besu) |
| On-chain (Fase 3) | Estado autoritativo de saldos/freeze por título; execução atômica de emissão/transferência/substituição | explorer + RPC read-only |

A correspondência completa evento de negócio → `audit_event` → transação on-chain (campos de
ligação `tx_hash`, `block_number`, `chain_id`, `contract_address`, `log_index`, `ledger_adapter`)
está no [Apêndice A](./apendices/A-ledger-port.md).

## 11. Riscos desta fatia

1. **Tentar imutabilidade sobre o store JSON** — inviável; Postgres é pré-requisito duro
   ([ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md)).
2. **Escrever evento fora da transação de domínio** — quebra a completude da trilha; por isso
   `append_audit_event` roda na mesma transação (§5.1).
3. **PII escorregar para o payload** — mitigado pelo validador allowlist por `event_type` (§8).
4. **Trilha sem ator** — auth é pré-requisito transversal da Fase 0
   ([09-roadmap](./09-roadmap.md)): sem identidade ([01-rbac-permissoes](./01-rbac-permissoes.md)),
   `actor_party_id` não existe e a trilha nasce coxa — hoje **toda** escrita é anônima
   (`api/src/server.js:31-37`).

---
_Anterior: [06-modelo-receita](./06-modelo-receita.md) · Próximo: [08-portais-perfis](./08-portais-perfis.md) · Índice: [00-visao-geral](./00-visao-geral.md)_
