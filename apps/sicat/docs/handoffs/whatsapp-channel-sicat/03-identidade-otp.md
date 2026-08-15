# 03 — Fase 2 · Vinculação de identidade por OTP

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 2 |
| Branch | `sicat/whatsapp-channel` |
| Migration | **020** `020_channel_link_verifications.sql` (aditiva; **não aplicada** em banco nenhum) |
| Data | 2026-08-06 |
| Status | ✅ concluída, com 2 decisões pendentes (§6) |

## 1. O que foi entregue

Vinculação telefone ↔ usuário SICAT por **OTP sempre iniciado no app** (decisão D3 do
`00-orchestration.md`): o usuário autenticado informa o número, recebe 6 dígitos pelo WhatsApp e
confirma na tela. Um número desconhecido não provoca escrita nenhuma — não existe OTP iniciado pelo
canal externo.

`conversation_channel_links` (migration 011), órfã desde que foi criada, **entra em uso** como estado
final do vínculo. A tabela nova guarda o estado transitório do desafio e a trilha de entrega.

| Camada | Arquivos |
|---|---|
| Migration | `src/sql/020_channel_link_verifications.sql` |
| Repositórios | `conversation-channel-verification-repo.ts` (novo), `conversation-channel-link-repo.ts` (estendido) |
| Service | `conversation-channel-link-service.ts` |
| Rotas | `channel-link-routes.ts` (6 rotas sob `sicatAuthMiddleware`) + registro em `api-routes.ts` |
| Frontend | `views/WhatsAppLinkView.vue`, `stores/channelLinkStore.js`, `services/channelLinkService.js`, `features/channel-link/channelLinkState.js`, rota + navegação |
| Fixture | `apps/sicat/tests/fixtures/phone-canonicalization.json` (compartilhado backend ↔ frontend) |
| Testes | `channel-link-service.test.js`, `channel-link-security.test.js`, `channel-link-view-state.test.js` |

Decisões de segurança do desenho: código por `crypto.randomInt`, guardado com `hashPassword` (scrypt
**salgado**, não `hashTokenSha256` — 6 dígitos são 10⁶ imagens, e um sha256 sem salt é pré-computável
em menos de um segundo a partir de um dump); tentativa incrementada e hash devolvido no **mesmo**
`update … returning` (mata o TOCTOU); TTL avaliado por `expires_at > now()` **no banco**; consumo
exclusivo por `consumed_at`; envio sempre por `sendTemplate` (a Meta rejeita texto livre fora da
janela de 24 h).

## 2. Três rodadas de verificação adversarial

Esta fase foi construída e verificada por 21 agentes em 3 rodadas. O registro importa porque **as duas
primeiras rodadas provaram que "gates verdes" não significava pronto**.

| Rodada | O que produziu |
|---|---|
| 1 — implementação + verificação em 3 lentes | 18 achados em código que o implementador reportou como pronto e com gates verdes. **Dois convergiram em lentes independentes** |
| 2 — correção dos 18 + teste de mutação | 4 correções ficaram pela metade e surgiram 17 achados novos, **2 críticos** — ambos de cegueira de teste |
| 3 — fechamento + reverificação por mutação | 19/19 mutações mortas, zero sobreviventes |

### Os dois críticos da rodada 2 (por que teste verde não é prova)

**O fake concordava consigo mesmo.** Mutar os parâmetros de `consumeChannelVerificationAttempt` de
`[input.id, input.userId]` para `[input.id, input.id]` não quebrava nada: o texto `and user_id = $2`
continuava literal (o teste de contrato passava) e o teste comportamental usava um *double* que
implementava o escopo em JavaScript. Em produção, `$2` receberia o `challengeId` e o predicado nunca
casaria — ou, na variante com ordem trocada, qualquer usuário confirmaria o desafio de qualquer outro.

**Ninguém verificava que o código era guardado como hash.** Trocar `hashPassword(code)` por `code`:
zero falhas. Um dump da tabela entregaria todos os OTPs vivos em texto puro — exatamente o que o
comentário do módulo afirmava estar prevenido.

**O teste de contrato de SQL era evadível.** Usava `includes()` por cláusula, então detectava *deleção*
mas nunca *neutralização*: acrescentar ` or true` depois de `and attempt_count < max_attempts` mantinha
o texto literal e desligava a guarda. Era a única cobertura de 6 das 10 guardas. Passou a comparar o
`where` **inteiro** normalizado.

## 3. Placar de mutação (rodada 3)

**19/19 detectadas.** Cada mutação derrubou exatamente a família de testes da guarda correspondente,
sem cross-talk — deltas de falha sobre a baseline entre +1 e +15, medidos por diff do conjunto de nomes
`not ok`, nunca por exit code (que é 1 na baseline por causa das 35 falhas pré-existentes).

Guardas cobertas: escopo por usuário no consume · hash do código · `attempt_count < max_attempts` ·
`consumed_at is null` (consume **e** close) · predicado do on-conflict do claim · advisory lock ·
os 3 fechamentos em massa · limitador de telefone · escopo do close do passo (4) · `user_id = $2` no
lookup · `expires_at > now()` · ordem consume-antes-de-comparar · fechamento `conflict` fora da
transação · máscara do telefone na auditoria · ramo de reenvio esgotado (frontend) · bypass do dono.

### Incidente de método, registrado de propósito

A primeira execução do harness de mutação foi lançada por um pipeline PowerShell terminado em
`Select-Object -First 3`. **`Select-Object -First` corta o pipeline upstream mas não mata o processo
node** — ele seguiu mutando os fontes destacado por ~6 minutos enquanto uma segunda execução começava.
Duas execuções concorrentes mutando e "restaurando" os mesmos arquivos, cada uma capturando como
"original" o conteúdo já mutado pela outra: a árvore ficou com duas mutações vazadas e o relatório
mostrava mutações "matando" testes que não tocam.

Foi detectado, os órfãos foram mortos, os fontes reconstruídos linha a linha e o harness reescrito com
snapshot pristino único, asserção de contaminação antes de cada mutação, restauração verificada por
conteúdo, handlers de `exit`/`SIGINT`/`uncaughtException` e execução por `Start-Process -Wait` com
redirecionamento para arquivo — nunca por pipeline. É a mesma armadilha já registrada na memória do
repo sobre `Select-Object -First`.

## 4. Validação (conferida de forma independente, não pelo relato dos agentes)

| Gate | Resultado |
|---|---|
| `npm run typecheck` (backend) | ✅ exit 0 |
| `npm run lint` (backend) | ✅ exit 0 |
| `npx tsx --test tests/unit/*.test.js` | ✅ **374 testes · 339 pass · 35 fail** — exatamente a baseline pré-existente |
| `npx tsx --test tests/unit/channel-link-*.test.js` | ✅ **95 / 95** |
| `npm run test:unit:frontend` | ✅ **220 / 220** |
| `npm run build:frontend` | ✅ (aviso de chunk > 500 kB é pré-existente — F3) |
| Árvore | ✅ sem resíduo de mutação (varredura por assinatura) |

A suíte do backend saiu de 279 para **374 testes** nesta fase.

## 5. O que estes testes NÃO provam

Registrado para não gerar confiança falsa:

- **Não há teste de integração contra Postgres.** As guardas de SQL são protegidas por testes de
  *nível de fonte* (comparação do `where` inteiro e do alinhamento entre placeholders e array de
  parâmetros). Isso mata as mutações conhecidas, mas é um proxy: a prova definitiva é exercitar o SQL
  real. **Escopo da fase 7.**
- A migration 020 **nunca foi aplicada**. O DDL não foi exercitado por banco nenhum.
- O fluxo ponta a ponta (enviar OTP de verdade e confirmar) não foi executado — depende de credenciais
  de provedor, que não existem no ambiente.

## 6. Decisões pendentes para o operador

**D-A2 — O escudo anti-bombing tranca o dono de primeira viagem.** Qualquer mecanismo que proteja um
número de receber OTP em massa pode ser virado contra o dono desse número. Foi fechado o caso de quem
**já tem o número verificado** (pula o escudo e o limitador de telefone). Mas uma vítima que **nunca
vinculou** o número pode ser trancada por N+1 contas descartáveis, em janela renovável, sem caminho de
escape no produto. Não há solução dentro deste fluxo — exige prova de posse fora de banda.
**Decisão necessária:** step-up de identidade quando o escudo dispara, ou ação de suporte que libera o
número. O trade-off está comentado no código para não ser "resolvido" por sinal fraco (IP, idade da
conta), o que reabriria o bombing multi-conta.

**D-A5 — `MAX_LINKS_REACHED` no `start` continua sem trilha de auditoria.** É uma pré-checagem barata,
anterior a qualquer prova de posse; o caminho do `confirm` passou a auditar. Decidir se a pré-checagem
também deve deixar rastro.

## 7. Pendências que a fase 3 herda

1. **O `from` de entrada do webhook DEVE passar por `canonicalizeChannelUserKey`** — a mesma função que
   o cadastro usa. Se cadastro e recepção canonicalizarem diferente, o vínculo nunca é encontrado e o
   sintoma é **silencioso**: a mensagem chega e não casa com nada, sem erro visível. O fixture
   compartilhado (`apps/sicat/tests/fixtures/phone-canonicalization.json`) existe exatamente para
   travar isso — as duas suítes iteram sobre ele.
2. **`integration_account_id` NUNCA deve sair do vínculo** enquanto essa coluna não tiver dono definido.
   `resolveChannelPrincipal` prioriza o valor do vínculo sobre a conta ativa do usuário; um valor
   herdado do dono anterior amarraria o novo dono à conta CETESB alheia.
3. O `resend` usa o balde de telefone **sem** o bypass do dono (o `start` tem). Impacto menor — o
   `resend` só age sobre desafio vivo do próprio usuário, e há saída pelo `start`.
4. Testes de integração contra Postgres (fase 7).
