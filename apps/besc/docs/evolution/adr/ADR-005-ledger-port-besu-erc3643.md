# ADR-005 — LedgerPort com adaptador simulado primeiro, Besu QBFT na Fase 3, token ERC-3643 lite e aluguel off-chain

Status: **DECISÃO — revisar**

Contexto: a evolução do BESC para marketplace exige registrar emissão, transferência,
freeze/substituição e ancoragem de auditoria num ledger — mas o app atual não tem sequer
identidade (`api/src/server.js:31-37`, CORS `*`, zero auth) e o enquadramento regulatório
ainda não foi validado (gate bloqueante, [ADR-007](./ADR-007-gate-regulatorio-bloqueante.md)).
O checklist de tokenização já pergunta `blockchain_type`, `whitelist`, `kyc`,
`transfer_restriction`, `smart_contract` (`api/src/domain.js:180-184`) sem resposta
arquitetural. Subir uma rede real antes de existir domínio de marketplace seria custo sem
valor probatório adicional — enquanto houver um só operador, a prova vem da trilha
hash-encadeada ([07-trilha-auditoria](../07-trilha-auditoria.md)), não da rede.

Decisão: o domínio fala com o ledger **exclusivamente** pela interface `LedgerPort`
(especificação normativa no [Apêndice A](../apendices/A-ledger-port.md)): todos os métodos de
escrita com `idempotencyKey`, nenhum método recebe PII, entrega via **outbox transacional** +
dispatcher idempotente. Implementar primeiro o **`SimulatedLedgerAdapter`** (DB-only, Postgres,
tx-hash determinístico, semântica idêntica — Fases 1–2 do [roadmap](../09-roadmap.md)); na
**Fase 3**, o **`BesuAdapter`**: Hyperledger Besu permissionado com consenso **QBFT**, rede
própria gas-free, 1 validador no k8s do lab, alinhado ao precedente DREX/BCB e pronto para
consórcio (4+ validadores) sem migração. Padrão de token: **ERC-3643 (T-REX) em perfil
reduzido**, **um contrato por título** (`TitleToken` via `TitleTokenFactory`, `pause()` =
freeze jurídico), com `IdentityRegistry` e `ModularCompliance` compartilhados; imutáveis por
contrato: `titleId`, `splitFactor`, `faceValueBRL`, `issuanceDocHash`, `legalStatusAtIssuance`.
**Aluguel e fee ficam off-chain**: o aluguel é obrigação contratual (`lease` no domínio) com
prova por ancoragem da trilha (`anchorAuditRoot`); a fee de 1ª transferência (= saída da
treasury, [ADR-006](./ADR-006-receita.md)) é faturada em fiat, com o ledger registrando apenas
o `transferKind`. Enquanto houver operador único, mitigar a neutralidade probatória com
**ancoragem secundária do Merkle root em carimbo de tempo externo (RFC 3161/ICP-Brasil ou
OpenTimestamps — só o hash)**. Custódia por fase: nenhuma chave real no simulado → hot wallet
omnibus do Gestor via Sealed Secrets no Besu → HSM/KMS no consórcio.

Alternativas rejeitadas:
- **Hyperledger Fabric** — sem padrão de token equivalente (tudo chaincode custom), perito raro no BR, fabric-sdk-node em manutenção mínima.
- **R3 Corda** — JVM/Kotlin fora do stack Node, sem estado global auditável por explorer, licenciamento CE limitado.
- **Rede pública (Polygon/Ethereum) direta** — exposição perpétua e imutável de dados ligados a processos judiciais (LGPD), gas real = risco operacional, endereços são dado pessoal pseudonimizado.
- **ERC-1400/1410** — nunca finalizado como ERC, ecossistema estagnado; partições cobrem freeze mas sem registro de identidade padrão.
- **ERC-1155 custom** — padrão de multi-token genérico (jogos/NFT), sem semântica de compliance; toda a camada de whitelist/recovery seria custom.
- **Contrato próprio simples** — ônus probatório integral de auditoria de contrato inédito; sinal fraco para reguladores e parceiros.
- **Aluguel on-chain (ERC-4907/wrap)** — "usuário on-chain" não tem significado no contrato civil; mais superfície de ataque sem ganho probatório (a ancoragem da trilha já prova existência/vigência/pagamentos).
- **Besu desde a Fase 0** — custo operacional imediato sem valor probatório adicional com operador único; o simulado atrás da mesma interface preserva o caminho.

Consequências: o domínio nunca importa ethers.js nem conhece JSON-RPC — trocar
simulado→Besu→consórcio é troca de adaptador + replay da outbox/trilha, sem mudar regra de
negócio. A semântica única (o simulado também rejeita título pausado e carteira não
whitelisted) permite que a suíte de testes do simulado valide o `BesuAdapter` na Fase 3.
Cria-se o invariante "escrita de domínio + `audit_event` + `ledger_outbox` na mesma transação"
e o estado `ledgerSyncState` visível (venda/entrega só concluem com `confirmed`). Fica mais
difícil: operar semântica que a EVM não tenha equivalente direto, e o perfil reduzido do
ERC-3643 precisa ser documentado para não ser confundido com a suíte completa da Tokeny.

Revisão pendente: (1) **confirmação da rede e do padrão de token com a assessoria
jurídica/regulatória** antes da Fase 3 (Besu QBFT + ERC-3643 lite são recomendação técnica,
não parecer); (2) **escolha do fornecedor e custo do carimbo de tempo RFC 3161/ICP-Brasil**
(ou OpenTimestamps) para a ancoragem externa; (3) **prazo de retenção do dossiê KYC
(`kyc_record`)** conforme obrigação legal PLD-FT/COAF, a definir com o jurídico; (4) validação
do modelo de custódia omnibus do Gestor na Fase 3 (e das condições para autocustódia no
consórcio).
