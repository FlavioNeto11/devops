import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHttpPrincipal } from '../../src/services/conversation/conversation-principal.js';

/**
 * Trava do endurecimento de canal (cadeia `whatsapp-channel-sicat`, fase 0).
 *
 * O bug que estes casos previnem: `channel` chegava no corpo da requisição e caía silenciosamente em
 * `inapp` quando desconhecido. Como a matriz de policy é indexada por canal (`allowChannels`), um
 * cliente que declarasse `inapp` escapava de qualquer restrição de canal — e um que declarasse
 * `whatsapp` entraria por um caminho que só o servidor deveria produzir.
 *
 * A validação de canal roda ANTES de qualquer acesso a banco em `resolveHttpPrincipal`, então estes
 * casos não precisam de Postgres.
 */
describe('conversation-principal — canal não é declarável pelo cliente', () => {
  const sicatUser = { userId: 'usr_test', email: 'operador@exemplo.com', roles: [] };

  it('rejeita `whatsapp` declarado por cliente HTTP com 403', async () => {
    await assert.rejects(
      () => resolveHttpPrincipal({ sicatUser, declaredChannel: 'whatsapp' }),
      (error) => {
        assert.equal(error.status, 403);
        assert.equal(error.code, 'CONVERSATION_CHANNEL_NOT_CLIENT_DECLARABLE');
        return true;
      }
    );
  });

  it('rejeita `whatsapp` mesmo com variação de caixa e espaços', async () => {
    await assert.rejects(
      () => resolveHttpPrincipal({ sicatUser, declaredChannel: '  WhatsApp ' }),
      (error) => error.code === 'CONVERSATION_CHANNEL_NOT_CLIENT_DECLARABLE'
    );
  });

  it('rejeita canal desconhecido com 400 em vez de cair em `inapp`', async () => {
    await assert.rejects(
      () => resolveHttpPrincipal({ sicatUser, declaredChannel: 'sms' }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.code, 'CONVERSATION_CHANNEL_INVALID');
        return true;
      }
    );
  });

  it('rejeita token sem identificação de usuário', async () => {
    await assert.rejects(
      () => resolveHttpPrincipal({ sicatUser: { userId: '   ' }, declaredChannel: 'inapp' }),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.code, 'CONVERSATION_PRINCIPAL_UNRESOLVED');
        return true;
      }
    );
  });
});
