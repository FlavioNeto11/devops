---
title: "Camada ledger/blockchain abstraída (LedgerPort, Besu QBFT, ERC-3643)"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 05 — Camada ledger/blockchain abstraída

> Parte do plano de evolução do BESC para marketplace de ações tokenizadas — ver
> [00-visao-geral](./00-visao-geral.md). Este documento responde às perguntas que o próprio
> checklist de tokenização do sistema atual já faz — `blockchain_type`, `whitelist`, `kyc`,
> `transfer_restriction`, `smart_contract` (`api/src/domain.js:180-184`) — e define **como** o
> marketplace fala com um ledger sem acoplar o domínio a nenhuma rede específica. A decisão
> arquitetural está registrada em [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md); a
> especificação normativa da interface vive no [Apêndice A](./apendices/A-ledger-port.md).

**Premissas herdadas do sistema atual (verificadas no código):** API Node 20 + Express 4 sem
auth e com CORS `*` (`api/src/server.js:31-37`); store JSON único em PVC com escrita atômica
tmp+rename (`api/src/store.js:51-62`), sem histórico de campos/autor e com deletes físicos
(`api/src/store.js:81`); o único trilho existente é `statusHistory[]` por caso
(`api/src/server.js:101-102` e `:378-379`). Nada aqui contradiz o princípio P8 do
`ESCOPO-FUNCIONAL.md`: o enquadramento regulatório final permanece "requer validação jurídica"
— formalizado como gate bloqueante em [10-gate-regulatorio](./10-gate-regulatorio.md).

---

## 1. Requisitos que a rede precisa atender

1. **Auditoria por tribunais/governos/financeiras** — o perito precisa verificar provas sem
   confiar no operador; a rede deve ter ferramental de inspeção maduro e formato de prova
   documentável.
2. **Ecossistema brasileiro regulado** — o precedente relevante é o **DREX**: o piloto do Banco
   Central roda **Hyperledger Besu com consenso QBFT**; participantes regulados (bancos, DTVMs)
   já têm equipes treinadas nesse stack.
3. **Custo operacional de operador único no lab** — precisa rodar no k8s do Docker Desktop
   (single node), com footprint controlado, imagem pública e sem dependência de SaaS.
4. **Maturidade de tooling Node.js** — a API é Node 20; o adaptador deve usar bibliotecas
   maduras (ethers.js/viem para EVM).
5. **Caminho de consórcio** — a mesma rede deve aceitar novos nós validadores (escritórios,
   custodiante, eventual fiscalizador) sem migração de dados.
6. **LGPD** — controle total sobre o que é gravado e sobre quem lê (rede pública expõe tudo
   para sempre).

## 2. Comparativo das 5 opções de rede

| Critério | **Besu permissionado (QBFT)** | Hyperledger Fabric | R3 Corda | Pública + token permissionado (Polygon/Ethereum + ERC-3643) | Ledger simulado (DB-only) |
|---|---|---|---|---|---|
| Precedente regulado BR | **Alto — é o stack do piloto DREX/BCB; LACChain também é Besu** | Médio (casos corporativos, pouco no mercado de capitais BR) | Médio (financeiro global, pouco BR) | Baixo como infra regulada primária; tokens BR existem, mas custodiados por VASPs | N/A (não é rede) |
| Familiaridade de peritos/auditores | Boa — EVM é o modelo mais documentado do mercado; explorers padrão (Blockscout) | Baixa — modelo de canais/chaincode exige perito especializado | Baixa — modelo point-to-point sem estado global | Boa (EVM) | Exige confiar no operador (mitigado pela hash-chain — [07-trilha-auditoria](./07-trilha-auditoria.md)) |
| Padrões de token compliance | **Nativo — ERC-3643/1400 rodam sem adaptação** | Não há padrão de token equivalente; tudo é chaincode custom | Estados/contratos próprios (JVM); sem ERC | Nativo | Emulado pela interface |
| Tooling Node.js | **Excelente (ethers.js v6/viem, hardhat/foundry p/ contratos)** | Razoável (fabric-sdk-node em manutenção mínima) | Fraco (Corda é Kotlin/JVM; RPC próprio) | Excelente | Trivial (é o próprio Postgres) |
| Roda no k8s do lab? | **Sim — 1 validador QBFT dev (~1 CPU / 2 Gi, PVC 10 Gi), gas-free** | Sim, mas topologia mínima pesada (orderer + peers + CAs) | Sim, mas pesado e licenciamento CE limitado | N/A (nó RPC remoto ou full node próprio — pesado) | **Sim — custo zero adicional** |
| Consórcio futuro | **Sim — adicionar validadores QBFT por governança on-chain, sem migração** | Sim (canais/MSP), operacionalmente complexo | Sim (network map), complexo | Não se aplica (rede já é pública) | Não — exige migração (prevista: replay da outbox/trilha, §7) |
| LGPD / exposição de dados | Controle total; leitura restrita aos nós do consórcio | Controle total | Controle total (need-to-know nativo) | **Risco — tudo público e imutável para sempre; endereços são dado pessoal pseudonimizado** | Controle total |
| Custo por transação | Zero (rede gas-free própria) | Zero | Zero | Gas real (MATIC/ETH) + gestão de saldo = risco operacional | Zero |
| Neutralidade probatória (ancoragem externa) | Média — enquanto houver 1 operador, o valor probatório vem da hash-chain + ancoragem, não da rede em si | Média | Média | **Alta — timestamp público incontestável** | Baixa isolada; ver mitigação no §3 |
| Risco de aprisionamento | Baixo (open source Apache-2, EVM portável) | Médio (chaincode não portável) | Alto | Baixo (EVM) | Nenhum |

## 3. Recomendação: dois estágios pela mesma interface — **DECISÃO — revisar** ([ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md))

1. **Fases 1–2 do [roadmap](./09-roadmap.md): `SimulatedLedgerAdapter` (DB-only).** Toda a
   semântica de ledger (emissão, transferência, freeze, substituição, ancoragem) roda contra
   tabelas Postgres com tx-hash determinístico. Motivo: o valor probatório imediato vem da
   **trilha de auditoria hash-encadeada** ([07-trilha-auditoria](./07-trilha-auditoria.md)),
   não da rede; subir um nó Besu antes de existir domínio de marketplace seria custo sem
   benefício. Isso também respeita o estágio regulatório: enquanto o
   [gate regulatório](./10-gate-regulatorio.md) não liberar (`go_live_enabled=false`),
   **não deve haver emissão real**.
2. **Fase 3: `BesuAdapter` — Hyperledger Besu permissionado, consenso QBFT, rede própria
   gas-free**, 1 validador no k8s do lab (dev) e desenho pronto para 4+ validadores (mínimo
   BFT: 3f+1) quando houver consórcio. Justificativa central: **alinhamento com o precedente
   DREX/BCB** (facilita a conversa com participantes regulados e peritos), EVM (padrões
   ERC-3643 prontos, tooling Node excelente) e caminho de consórcio sem migração.
3. **Mitigação da fraqueza "operador único":** enquanto a rede tiver um só operador, a
   neutralidade probatória vem de (a) hash-chain verificável offline e (b) **ancoragem
   secundária opcional do Merkle root em serviço externo de timestamp** (carimbo do tempo
   RFC 3161/ICP-Brasil, ou OpenTimestamps em Bitcoin — só o hash, nunca dados). Isso dá
   timestamp de terceiro sem colocar nada de negócio em rede pública. Custo e fornecedor do
   carimbo: **DECISÃO — revisar** ([ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md)).

**Rejeitados** (detalhe em [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md)): Fabric (sem
padrão de token, perito raro, SDK Node estagnado); Corda (JVM, fora do stack, licenciamento);
pública direta (LGPD, gas, exposição perpétua — inaceitável para dado ligado a processos
judiciais, mesmo pseudonimizado).

---

## 4. Padrão de token

### 4.1 Requisitos do domínio → recursos exigidos do padrão

| Regra de negócio | Recurso necessário |
|---|---|
| Desmembramento 1 ação → N tokens (fator parametrizável — [03-elasticidade](./03-elasticidade-tokenizacao.md)) | `mint` em lote com `splitFactor` registrado por emissão |
| Valor de face congelado por contrato na contratação | metadado imutável por lote/contrato (ou hash do contrato off-chain) |
| Status jurídico governa disponibilidade ([04-maquina-estado-juridico](./04-maquina-estado-juridico.md)) | `pause`/`freeze` **por título** (não global, não só por carteira) |
| Título que cai (`defeated`) → substituição de tokens | `burn`+`mint` atômicos com rastro de proveniência |
| Fee só na 1ª transferência (saída da treasury — [06-modelo-receita](./06-modelo-receita.md)) | distinção `first` vs `secondary` transfer (pode ser off-chain, ver §4.4) |
| Whitelist/KYC | transferência restrita a identidades aprovadas |
| Público regulado/auditoria | padrão reconhecido, com `forcedTransfer`/recovery para ordem judicial |

### 4.2 Comparativo dos padrões

| Critério | **ERC-3643 (T-REX)** | ERC-1400/1410 | ERC-1155 custom | Contrato próprio simples |
|---|---|---|---|---|
| Whitelist/identidade | **Nativo** (Identity Registry + claims; transferência falha sem identidade elegível) | Parcial (via controladores; sem registro de identidade padrão) | Não — tudo custom | Não — tudo custom |
| Freeze por título | Via **pause() do contrato do título** (no modelo 1-contrato-por-título) + `setAddressFrozen`/`freezePartialTokens` por carteira | Nativo por partição (partição = título) | Por `id` (id = título), custom | Custom |
| Recovery/ordem judicial | **Nativo** (`forcedTransfer`, `recoveryAddress`) | Parcial (`operatorTransferByPartition`) | Custom | Custom |
| Status do padrão | **ERC final (2023), suíte auditada (Tokeny), adoção crescente em RWA/valores mobiliários** | Nunca finalizado como ERC; ecossistema estagnado | Final, mas é padrão de multi-token genérico (jogos/NFT), sem semântica de compliance | Inexistente — ônus probatório de auditoria de contrato 100% nosso |
| Complexidade | Alta (6 contratos na suíte completa) — mitigável com **perfil reduzido** | Média | Média | Baixa |
| Sinal para reguladores/parceiros | **Forte — é o padrão de fato de security token compliant** | Fraco hoje | Neutro | Fraco |

### 4.3 Recomendação — **DECISÃO — revisar** ([ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md))

**ERC-3643 em perfil reduzido ("T-REX lite"), com um contrato de token por título
(`TitleToken`), implantado por `TitleTokenFactory`, compartilhando um `IdentityRegistry` e um
`ModularCompliance` únicos da plataforma.**

- **Por que 1 contrato por título:** o eixo de governança jurídica é o **título** — o status
  jurídico congela o título inteiro, o valor de face é por lote do título e a substituição
  troca um título por outro ([04-maquina-estado-juridico](./04-maquina-estado-juridico.md)).
  `pause()`/`unpause()` do contrato do título implementa freeze/unfreeze de forma trivial e
  auditável. ERC-3643 é ERC-20 fungível — dentro de um título os tokens são fungíveis entre si
  (correto), entre títulos não (correto, contratos distintos).
- **Imutáveis por contrato (gravados na emissão):** `titleId` (id opaco do título no domínio),
  `splitFactor`, `faceValueBRL` (valor de face congelado, em centavos), `issuanceDocHash`
  (SHA-256 do contrato/dossiê off-chain), `legalStatusAtIssuance`. O **contrato jurídico
  completo fica off-chain**; on-chain vai só o hash — resolve LGPD e mantém o congelamento
  verificável (o perito compara o hash do PDF com o on-chain).
- **Substituição (título `defeated`):** função `substitute(oldToken, newToken, holders[])` no
  factory/agente executando **burn no contrato antigo + mint no novo na mesma transação**
  (atômico), emitindo evento `TokenSubstituted(oldTitleId, newTitleId, holder, amount)`. A
  alternativa "nada além do já devido" (write-off) é apenas `pause()` definitivo + evento de
  encerramento — a escolha é caso a caso do domínio
  ([04-maquina-estado-juridico](./04-maquina-estado-juridico.md)); o ledger suporta ambas.
- **Fee da 1ª transferência:** ver §4.4 — off-chain na V1.

### 4.4 Aluguel e fee — off-chain com anchoring — **DECISÃO — revisar** ([ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md))

- **Aluguel:** o aluguel do título **não transfere propriedade do token** — é obrigação
  contratual recorrente entre partes identificadas. Modelar aluguel on-chain (estilo ERC-4907
  ou wrap/unwrap) adicionaria superfície de contrato inteligente, ambiguidade jurídica (o
  "usuário on-chain" não tem significado no contrato civil) e complexidade de cobrança, sem
  ganho probatório: o que o tribunal precisa é **prova de existência, vigência e pagamentos**
  do contrato de locação. Solução: entidade `lease` no domínio
  ([02-modelo-de-dados](./02-modelo-de-dados.md)); cada evento do ciclo de vida (criação,
  pagamento, renovação, rescisão) vira `audit_event` na hash-chain, e a hash-chain é
  **ancorada no ledger** via `anchorAuditRoot` ([07-trilha-auditoria](./07-trilha-auditoria.md)).
  O perito obtém a mesma imutabilidade com 1/10 do risco.
- **Fee da 1ª transferência:** a cobrança é fiat/off-chain (não há stablecoin no escopo). A
  regra de negócio — registrada em [ADR-006](./adr/ADR-006-receita.md) e detalhada em
  [06-modelo-receita](./06-modelo-receita.md) — é: **1ª transferência = saída da treasury
  (distribuição primária)**; fee = % do valor de face do contrato (0,5% placeholder) + piso
  (R$ 25 placeholder), com unicidade garantida por índice parcial
  `fee(contract_id) WHERE kind='first_transfer'`. O ledger registra a transferência com
  `transferKind: 'first'` **quando `fromWallet` é a treasury** (distribuição primária); o
  domínio fatura e emite `market.fee.charged` na trilha. Transferências secundárias e
  substituições são **isentas com registro explícito** (`fee_exemption_reason` na entidade
  `fee`). **Enforcement on-chain opcional futuro:** módulo de compliance ERC-3643 que bloqueia
  transferência sem flag de fee liquidada — só faz sentido quando houver liquidação on-chain
  (fase de consórcio).

---

## 5. Posição arquitetural do módulo ledger

Novo módulo isolado dentro da API (Fases 1–2: mesmo processo, módulo `api/src/ledger/`;
Fase 3+: candidato a processo próprio `besc-ledger-svc` se o volume justificar). O domínio
**nunca** importa ethers.js nem fala JSON-RPC — só conhece a interface `LedgerPort`.
Configuração `LEDGER_ADAPTER=simulated|besu` via env (ConfigMap; segredos via Sealed Secrets).

```
domain (marketplace) ──► LedgerPort (interface)
                            ├── SimulatedLedgerAdapter (Fases 1–2, Postgres)
                            ├── BesuAdapter            (Fase 3, ethers.js → besu-rpc:8545)
                            └── ConsortiumAdapter      (futuro — mesma EVM, outra topologia/custódia)
domain ──► trilha de auditoria (07) ──► anchorAuditRoot() via LedgerPort
```

## 6. A interface `LedgerPort` — operações e garantias (resumo)

A especificação completa, TypeScript-like e normativa (tipos, parâmetros, retornos e
comentários), está no [Apêndice A](./apendices/A-ledger-port.md). Resumo:

| Operação | O que faz | Tipo |
|---|---|---|
| `issueBatch` | cria/usa o `TitleToken` do título e minta o lote (`splitFactor × ações`) para a carteira **treasury**, com valor de face congelado e `issuanceDocHash` | escrita |
| `transfer` | transfere entre carteiras whitelisted; `transferKind: first \| secondary \| forced` (`forced` = ordem judicial/recovery) | escrita |
| `freezeTitle` / `unfreezeTitle` | pausa/despausa o título inteiro, espelhando a máquina de estado jurídico (reason codes taxonomizados + `evidenceHash` da decisão) | escrita |
| `substitute` | burn no título antigo + mint no novo, por holder, **na mesma transação** | escrita |
| `registerIdentity` / `revokeIdentity` | liga/revoga identidade opaca (`party_id`) ↔ carteira; on-chain só `claimsHash` | escrita |
| `anchorAuditRoot` | ancora o Merkle root de um intervalo de `audit_event` | escrita |
| `getProof` | receipt/log bruto de uma transação, para anexo pericial | leitura |
| `getBalance` / `getTitleState` | saldo por carteira e estado (paused/totalSupply) por título — insumo da reconciliação (§10) | leitura |
| `health` | sonda do adaptador (chainId, altura de bloco, sync) | leitura |

**Garantias transversais:** (a) **todo método de escrita recebe `idempotencyKey`** (UUID
gerado pela outbox) e retorna `LedgerTxRef` com estado `pending → confirmed | failed`;
(b) **nenhum método recebe PII** — só ids opacos, endereços e hashes; (c) a semântica é
idêntica nos dois adaptadores (o simulado também rejeita transferência de título pausado e de
carteira não whitelisted), para que a troca por Besu não mude o domínio.

## 7. Adaptadores

| Adaptador | Fase ([roadmap](./09-roadmap.md)) | Implementação | Observações |
|---|---|---|---|
| `SimulatedLedgerAdapter` | 1–2 | Tabelas Postgres `sim_ledger_tx` (block = sequência monotônica; `txHash = SHA-256(JCS(operação canônica))` — determinístico e verificável) e `sim_ledger_state` (saldos/paused por título) | **Sem cripto real, sem chaves.** Semântica idêntica à do Besu; `chainId: "sim:1"`. |
| `BesuAdapter` | 3 | ethers.js v6 → `http://besc-besu:8545` (Service ClusterIP, **nunca exposto no Traefik público**); contratos ERC-3643 lite (§4.3) | Nó: StatefulSet 1 validador QBFT, gas-free (`gasPrice: 0`), genesis em ConfigMap, chave do validador e da hot wallet em **Sealed Secrets**. Padrão de manifesto análogo a `apps/sicat/k8s/postgres.yaml` (single-replica + PVC + probes). Blockscout opcional read-only. |
| `ConsortiumAdapter` | futura (pós-roadmap) | Mesma EVM/mesmos contratos; muda topologia (4+ validadores externos) e custódia (HSM/KMS, MPC) | Migração sim→besu→consórcio por **replay da outbox/trilha**: os eventos de domínio são a fonte da verdade; reemitir na rede nova e registrar `ledger.migration.*` na trilha. |

## 8. Consistência domínio ↔ ledger — outbox transacional

**Invariante: o domínio nunca chama `LedgerPort` diretamente no request HTTP.** Fluxo:

1. Na **mesma transação Postgres**: escrita de domínio + `audit_event`
   ([07-trilha-auditoria](./07-trilha-auditoria.md)) + linha em `ledger_outbox`
   (DDL no [Apêndice A](./apendices/A-ledger-port.md)).
2. **Dispatcher** (loop no worker; padrão `FOR UPDATE SKIP LOCKED`, já provado no SICAT) lê as
   linhas `pending`, chama o adaptador com o `idempotency_key` da linha, grava `tx_hash` e
   avança o estado.
3. **Confirmação:** `confirmed` após N blocos (N=1 no QBFT — finalidade imediata; N=0 no
   simulado).

Estados da outbox: `pending → submitted → confirmed | failed → (retry) | abandoned`
(intervenção manual) — tabela completa de transições no
[Apêndice A](./apendices/A-ledger-port.md).

- **Idempotência no adaptador:** simulado — o `txHash` determinístico torna o retry
  naturalmente idempotente; Besu — o contrato aceita `bytes32 opId` (o idempotencyKey) e
  reverte com `AlreadyExecuted` em replay; o adaptador trata esse revert como sucesso.
- **Estados de sincronização visíveis no domínio:** a entidade de negócio (lote,
  transferência) carrega `ledgerSyncState: pending | confirmed | failed` — a UI mostra
  "aguardando confirmação de registro"; regras de disponibilidade avaliam o estado de domínio,
  mas **venda/entrega só concluem com `confirmed`**.
- **Falha permanente (`abandoned`):** gera evento `reconciliation.divergence.detected` +
  **pendência bloqueante** no título afetado (reusa o motor de pendências do §8.1 do
  `ESCOPO-FUNCIONAL.md`, hoje em `api/src/domain.js`).

## 9. O que NUNCA vai on-chain (nem no payload de `audit_event`)

| Nunca | Em vez disso |
|---|---|
| Nome, CPF/CNPJ, e-mail, endereço, IP de investidor/titular | `party_id` (UUID opaco) — resolução em tabela `party` off-chain apagável ([07-trilha-auditoria](./07-trilha-auditoria.md), LGPD) |
| Documentos (contratos, decisões judiciais, laudos, dossiês) | SHA-256 do arquivo (`*_doc_hash`) + `file_ref` off-chain no PVC/objeto |
| Dados de KYC (claims, PEP, sanções) | `claimsHash` + registro off-chain em `kyc_record` |
| Valores de contratos privados além do necessário | valor de face e quantidade são visíveis ao consórcio por necessidade; termos comerciais do aluguel ficam off-chain com hash ancorado |
| Chaves privadas, segredos, tokens de sessão | Sealed Secrets → k8s Secret → env; jamais em git/payload |

## 10. Chaves e custódia por fase — **DECISÃO — revisar** ([ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md))

| Fase | Modelo |
|---|---|
| 1–2 (simulado) | **Nenhuma chave criptográfica real.** Carteiras são strings sintéticas (`sim:party:<uuid>`); assinatura inexistente — o valor probatório vem da hash-chain. |
| 3 (Besu, operador único) | **Custódia gerenciada pelo Gestor (omnibus):** uma hot wallet operacional por ambiente (agente ERC-3643 com poderes de mint/pause/forcedTransfer) + carteiras derivadas por investidor sob custódia do Gestor. Chaves em Sealed Secrets; rotação documentada; a hot wallet não guarda valor nativo (rede gas-free). O investidor **não** gerencia chave nesta fase — reduz risco e simplifica LGPD/PLD. |
| Consórcio (futura) | HSM/KMS (ex.: Vault transit, cloud KMS ou HSM físico do custodiante), segregação de funções (emissor ≠ compliance ≠ operador), possivelmente MPC. Autocustódia de investidor só com parecer jurídico próprio. |

## 11. Whitelist/KYC — mapeamento identidade → endereço

- Tabelas off-chain ([02-modelo-de-dados](./02-modelo-de-dados.md) e
  [Apêndice B](./apendices/B-ddl-conceitual.md)): `party` (PII, apagável), `kyc_record`
  (dossiê KYC/PLD-FT; prazo de retenção conforme obrigação legal — **DECISÃO — revisar** com o
  jurídico, registrado em [ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md)) e
  `wallet_link` (`party_id → wallet`, `status: pending | approved | revoked`).
- **Quem aprova:** o papel `manager` (Gestor) na V1 — a trilha registra o ator; um papel
  dedicado de compliance pode ser criado depois **sem deploy**, pelo RBAC em dados
  ([01-rbac-permissoes](./01-rbac-permissoes.md)). Aprovação gera `kyc.identity.approved` +
  outbox `registerIdentity` (on-chain só `partyId` + `claimsHash`).
- **Revogação de KYC** → `revokeIdentity` → transferências passam a falhar no Identity
  Registry (e, no simulado, na checagem equivalente).
- Somente investidores aprovados (`kyc.identity.approved` + carteira `approved`) podem receber
  tokens — inclusive na distribuição primária a partir da treasury; o gate regulatório
  ([10-gate-regulatorio](./10-gate-regulatorio.md)) mantém tudo em modo demonstração até a
  liberação formal (`go_live_enabled`).

## 12. Reconciliação e divergência

- **Job `ledger-reconcile`** (worker, a cada 5 min + sob demanda): para cada título ativo
  compara (i) a soma de posições do domínio (`wallet_position`) × `getBalance`/`getTitleState`
  do adaptador; (ii) outbox `submitted` velha (> timeout) × receipt real; (iii) verificação
  incremental da hash-chain desde o último anchor.
- **Divergência ⇒** evento `reconciliation.divergence.detected` (payload: título, valores dos
  dois lados, hipótese) + **pendência bloqueante no título** (congela novas operações de
  mercado sobre ele até resolução) + alerta operacional.
- **Resolução é sempre manual e auditada:** a correção gera transação compensatória nova
  (nunca edição) + `reconciliation.divergence.resolved` com referência aos eventos
  compensados.

> Regra de ouro: **o domínio é a fonte da verdade de intenção; o ledger é a fonte da verdade
> de execução; a trilha registra ambos, e a reconciliação explica qualquer distância entre
> eles.**

---

_Especificação normativa: [Apêndice A](./apendices/A-ledger-port.md) · decisão:
[ADR-005](./adr/ADR-005-ledger-port-besu-erc3643.md) · trilha e ancoragem:
[07-trilha-auditoria](./07-trilha-auditoria.md) · máquina jurídica:
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md) · receita:
[06-modelo-receita](./06-modelo-receita.md) · fases: [09-roadmap](./09-roadmap.md)._
