/**
 * Channel Link Service — wrapper das operações HTTP /v1/sicat/channel-links/*.
 *
 * Cadeia: whatsapp-channel-sicat (fases 02-identity-binding e 05-action-window).
 * Superfície (todas autenticadas por Bearer, identidade resolvida no servidor):
 *  - GET    /v1/sicat/channel-links                                → lista + desafio vivo + limites
 *  - POST   /v1/sicat/channel-links                                → 202, cria o desafio e despacha o OTP
 *  - POST   /v1/sicat/channel-links/challenges/{id}/resend         → 202, rotaciona o código
 *  - POST   /v1/sicat/channel-links/challenges/{id}/confirm        → 200, prova a posse e grava o vínculo
 *  - DELETE /v1/sicat/channel-links/challenges/{id}                → 204, cancela o desafio ("alterar número")
 *  - DELETE /v1/sicat/channel-links/{linkId}                       → 204, desvincula o número
 *  - POST   /v1/sicat/channel-links/whatsapp/action-window         → 201, abre a janela de ação (N2)
 *  - GET    /v1/sicat/channel-links/whatsapp/action-window         → a janela viva (ou `window: null`)
 *  - DELETE /v1/sicat/channel-links/whatsapp/action-window/{id}    → 204, revoga com efeito imediato
 *
 * NÃO importa de src/** ; reusa apenas a camada api.js — fronteira frontend/backend
 * mantida (mesmo contrato de mtrProvisorioService.js).
 *
 * Diferente de `mtrProvisorioService`/`dmrService`, este módulo NÃO expõe gerador de
 * `Idempotency-Key`: nenhuma das rotas lê esse header (não há middleware de
 * idempotência em /v1/sicat/channel-links). A deduplicação é do servidor — índice
 * único parcial do desafio vivo + cooldown/teto de envios; a janela de ação é
 * única por usuário+telefone enquanto viva. Ver api.js.
 */

export {
  listChannelLinks,
  startChannelLink,
  resendChannelLinkChallenge,
  confirmChannelLinkChallenge,
  cancelChannelLinkChallenge,
  deleteChannelLink,
  openWhatsAppActionWindow,
  getWhatsAppActionWindow,
  revokeWhatsAppActionWindow
} from './api.js';
