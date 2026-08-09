# 07 — Fase 5 · Confirmação server-side de ações

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 5 |
| Branch | `sicat/whatsapp-channel` |
| Migration | **nenhuma** (reusa a `020`) |
| Data | 2026-08-08 |
| Status | ✅ concluída — **entrega o nível N1**; N2 fechado em código (§4) |

## 1. O problema

`requiresConfirmation` era **stateless**: a policy só olhava `input.confirmed`. O turno 1 devolvia
`CONFIRMATION_REQUIRED` + um card, e a UI reenviava com `confirmed: true` e snapshots. A confirmação
era responsabilidade do **cliente** — sem token, sem expiração, sem uso único, sem replay-protection
além do casamento de snapshot. Num navegador autenticado já é ruim; num canal externo não vale nada.

## 2. O conflito, e como foi resolvido

Adversarial dizia: quem domina o WhatsApp recebe o código junto com a pergunta — confirmação
in-channel não prova posse de nada. Usabilidade dizia: se para emitir um MTR a pessoa precisa abrir o
navegador, ela emite pelo navegador e o canal deixa de existir.

**A síntese é temporal, não de intensidade.** A prova de posse da credencial SICAT é exigida, mas
antecipada e amortizada: a pessoa abre uma **janela de trabalho** na sessão web autenticada — um
clique antes de sair do escritório, escolhendo conta, duração e orçamento. No pátio, com luva, digita
6 dígitos e mais nada.

Em termos concretos, isso converte *"telefone comprometido = capacidade permanente de emitir MTR"* em
*"telefone comprometido **mais** uma janela que a própria vítima abriu = capacidade contada, presa a
uma conta, visível num contador na tela dela e cortável num clique"*. Quem só tem o telefone não abre
janela nenhuma.

## 3. Três níveis, por efeito irreversível

O critério **não** é o `riskLevel` do catálogo — que o design apontou estar errado (classifica geração
de CDF como R3 mas protege com `manifest.read`). É o efeito que não tem volta.

| Nível | Exigência | Ações |
|---|---|---|
| **N1** | ticket + código | `print_manifest` (1), `manifest.batch_print_selected` (≤5), `manifest.replicate_segmented` (≤2) — nenhuma muda estado na CETESB |
| **N2** | ticket + código + **janela viva** | `submit_manifest` (1), `manifest.batch_submit_selected` (≤3) |
| **N3** | **RECUSA em código** | todos os cancelamentos, todos os CDF, `receive_with_receipt`, `create_from_payload`, `create_draft`, `replicate_manifest` direto |

O N3 é recusado numa lista de **elegibilidade de código** que nenhum `PATCH` do AI Control Center
fura. Admin comprometido, ou clique errado, não inventa elegibilidade.

## 4. A fase entrega N1 — e o portão é de código

O design condicionou: *"se o aviso de conclusão não entrar, N2 não é liberado e a fase entrega só
N1"*. O aviso (`whatsapp.outbound_notice`) exige costurar a conclusão dos jobs de volta ao ticket
através do dispatcher — fora do alcance desta fase. Então N2 ficou fechado por
`const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = false`, **constante de código**, com o gate
`if (!IMPLEMENTED || !env)`: nenhum `=true` de ambiente o abre.

Isso importa porque `config.whatsappActionNoticeEnabled` é entrada de ambiente, e um `=true` num
values.yaml abriria emissão irreversível na CETESB num canal cego. **A env não pode conceder
capacidade que o código não tem.**

Os textos foram corrigidos junto: *"Te aviso aqui quando terminar"* virou *"acompanhe em MTRs no
SICAT"*. Promessa sem mecanismo é defeito.

## 5. Decisões de implementação que valem registro

**Sem migration.** O ticket é uma **linha** em `conversation_channel_verifications` (020),
discriminada por `channel_type`. O índice único vivo, o CHECK de tentativas e o vocabulário de
`outcome` já entregavam one-shot e orçamento atômico. Uma `021` seria a **segunda** migration inédita
rodando junto com a `020` num `migrate.ts` **sem advisory-lock**, com `AUTO_MIGRATE` na api e no
worker: CrashLoop simultâneo dos dois, não "chat degradado".

**`createAccessToken` foi rejeitado por um motivo afiado.** O prefixo é a constante fixa
`sicat_access` e `sicat-auth.ts` valida apenas prefixo + assinatura + `exp` — um ticket assinado com
aquele segredo **seria, byte a byte, um Bearer de sessão válido** para aquele `sub`. Ticket vazado =
sessão vazada.

**O molde do ZapBridge também foi rejeitado**: `pending-actions.ts` não é one-time (nada registra
consumo) e assina `chatJid` sem nunca comparar. Reaproveitou-se a disciplina, não o mecanismo.

**Os argumentos da ação nunca saem do servidor.** O telefone recebe 6 dígitos; o `toolRequest` é
remontado no servidor a partir da linha do ticket.

**A autorização é reavaliada na queima**, com o principal recarregado — uma permissão revogada entre a
emissão e a confirmação bloqueia.

## 6. Duas rodadas de verificação

| Rodada | Resultado |
|---|---|
| 1 | 27 achados (1 crítico, 6 altos) e **30/54 mutações — 24 sobreviveram**, o pior placar da cadeia |
| 2 | **131/160 mutações**; 9 sobreviventes, 5 deles ramo morto do N2 |

### O que a rodada 1 expôs

**Nenhum intent de lote emitia ticket em produção.** A prévia de conferência rejeitava id interno por
regex — e id interno é exatamente o que o LLM põe nos argumentos. Pior: o ticket era inserido **antes**
de a prévia existir, então a tentativa fechava como `superseded` o ticket vivo anterior e depois se
cancelava. Corrigido resolvendo a identidade contra o repositório local (`MTR 202600123456 - NOVA IT
AMBIENTAL`) e só então emitindo. Regra nova, fail-closed: resolver **de menos** é pior que não
resolver — listar 3 MTRs e executar 5 *parece* conferência.

**Replay e expiração não recusavam**: caíam em `no_ticket` e os 6 dígitos iam para o LLM. Os ramos
`already_used` e `expired` eram inalcançáveis porque a busca filtrava por vivo. Corrigido com uma
busca que devolve a linha **crua** — de propósito sem filtrar telefone, para que quem compara seja o
service e a guarda seja exercitável.

**O double concordava consigo mesmo, dentro da própria suíte da fase.** A mutação `m03c` foi descrita
pelo verificador como "a lição 1 da cadeia acontecendo aqui": o double de busca já filtrava por
telefone, tornando a guarda redundante e invisível. Foi por isso que a regra dos doubles virou
explícita na remediação.

## 7. Validação (conferida aqui)

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npx tsx --test tests/unit/*.test.js` | ✅ **878 testes · 843 pass · 35 fail** — baseline exata, 11 nomes top-level |
| Mutação | ✅ **131/160**; os 2 sobreviventes reais fechados aqui |
| Portão do N2 | ✅ verificado: constante de código, não env |

A suíte saiu de 726 (fim da 4.5) para **878**.

Os dois sobreviventes reais foram fechados por mim, não por agente:
- **`CODE-02`** — a barreira que re-sorteia o código quando ele aparece como substring do `metadata`
  persistido. Não é hipótese remota: o metadata carrega número de MTR (12 dígitos = **sete**
  substrings de 6). Sem ela, o código fica legível em claro na linha do banco.
- **`TTL-10`** — o fallback de 300 s não tinha guarda; trocá-lo por `0` fazia toda emissão ser
  recusada (perda silenciosa de capacidade).

## 8. Falha de processo desta rodada

O particionamento de arquivos entre os dois agentes de correção estava **errado**: ambos editaram
`whatsapp-action-ticket-service.ts`, e os dois relataram a colisão. As edições conviveram e a suíte
fechou limpa, mas a premissa de exclusividade não valeu — e num caso menos sortudo teria produzido
sobrescrita silenciosa. Particionar por **arquivo** não basta quando os módulos se chamam; a próxima
fase deve particionar por **fronteira de módulo**, ou serializar.

## 9. Dívida

1. **`whatsapp.outbound_notice` não existe** → N2 fechado. Enquanto não existir, confirmar ação
   irreversível num canal cego permanece proibido.
2. **Débito de saída em `unmetered`** autoriza (é teto de custo, não de autorização) e esse ramo segue
   sem cobertura — precisa de um double que implemente `consumeChannelVerificationSend`.
3. **Quarto comentário falso da cadeia**, removido: `whatsapp-turn-service.ts` afirmava que o caso de
   usuário inativo "passou a ser tratado em C2b", e `grep C2b` no backend devolvia só o próprio
   comentário.
