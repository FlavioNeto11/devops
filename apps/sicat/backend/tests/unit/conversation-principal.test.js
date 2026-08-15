import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveChannelPrincipal,
  resolveHttpPrincipal,
  setConversationPrincipalDependenciesForTests
} from '../../src/services/conversation/conversation-principal.js';

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

// ---------------------------------------------------------------------------------------------
// SUJEITO da resolução de permissões — mutação m08b da fase 4.5
// ---------------------------------------------------------------------------------------------

/**
 * A mutação que sobreviveu: trocar o ARGUMENTO de `listPermissionKeysByUserId` no SÍTIO DE CHAMADA.
 *
 *     dependencies.listPermissionKeysByUserId(userId)
 *  -> dependencies.listPermissionKeysByUserId(String(input.integrationAccountId))
 *
 * Nenhum teste reagia. O SQL continua com `where aur.user_id = $1` (o contrato de texto passa), a
 * função de resolução isolada continua correta (o teste da FUNÇÃO passa) — e em produção o principal
 * carrega as permissões de OUTRA entidade. Só um duplo que REGISTRA com que argumento foi chamado
 * distingue os dois casos, e só se as três identidades do escopo (usuário, conta, sessão) forem
 * valores DIFERENTES entre si no fixture: com `userId === integrationAccountId` a mutação continua
 * invisível.
 *
 * Por isso cada caso abaixo:
 *  (a) afirma o argumento LITERAL recebido pelo repositório (mata a troca de sujeito);
 *  (b) afirma que o principal devolve as chaves DAQUELE usuário (mata "chama certo e usa errado");
 *  (c) usa um duplo que devolve conjuntos DISTINTOS por identidade — se o sítio pedir a conta, ele
 *      devolve as chaves da conta, e a asserção (b) quebra sozinha.
 */
describe('conversation-principal — o SUJEITO das permissões é o usuário, nunca a conta', () => {
  const USER_ID = 'usr_subject_001';
  const ACCOUNT_ID = 'acc_subject_999';
  const SESSION_ID = 'scx_subject_777';
  const USER_KEYS = ['manifest.read'];
  const ACCOUNT_KEYS = ['audit.read', 'manifest.cancel', 'manifest.submit'];

  /** Duplo que responde por IDENTIDADE — devolver o mesmo conjunto para todos esconderia a mutação. */
  function buildPermissionSpy() {
    const calls = [];
    const byIdentity = new Map([
      [USER_ID, USER_KEYS],
      [ACCOUNT_ID, ACCOUNT_KEYS],
      [SESSION_ID, ['manifest.print']]
    ]);

    return {
      calls,
      async listPermissionKeysByUserId(subject) {
        calls.push(subject);
        return [...(byIdentity.get(subject) ?? [])];
      }
    };
  }

  function buildAccountSpy() {
    const calls = [];
    return {
      calls,
      async resolveActiveAccountContext(subject) {
        calls.push(subject);
        return { integrationAccountId: ACCOUNT_ID, sessionContextId: SESSION_ID };
      }
    };
  }

  afterEach(() => {
    setConversationPrincipalDependenciesForTests(null);
  });

  it('resolveHttpPrincipal pede as chaves do userId do TOKEN', async () => {
    const permissionSpy = buildPermissionSpy();
    const accountSpy = buildAccountSpy();
    setConversationPrincipalDependenciesForTests({
      listPermissionKeysByUserId: permissionSpy.listPermissionKeysByUserId,
      resolveActiveAccountContext: accountSpy.resolveActiveAccountContext
    });

    const principal = await resolveHttpPrincipal({
      sicatUser: { userId: USER_ID, email: 'operador@exemplo.com' },
      declaredChannel: 'inapp'
    });

    assert.deepEqual(permissionSpy.calls, [USER_ID], 'o repositório de permissões foi chamado com outro sujeito');
    assert.deepEqual(accountSpy.calls, [USER_ID], 'a conta ativa foi resolvida para outro sujeito');
    assert.deepEqual(principal.permissionKeys, USER_KEYS);
    assert.equal(principal.userId, USER_ID);
    // A conta resolvida entra no principal — e continua NÃO sendo o sujeito da consulta de permissão.
    assert.equal(principal.integrationAccountId, ACCOUNT_ID);
    assert.equal(
      permissionSpy.calls[0] === principal.integrationAccountId,
      false,
      'as permissões foram pedidas para a CONTA — é exatamente a mutação m08b'
    );
  });

  it('resolveChannelPrincipal pede as chaves do userId do VÍNCULO, não da conta fixada no vínculo', async () => {
    const permissionSpy = buildPermissionSpy();
    const accountSpy = buildAccountSpy();
    setConversationPrincipalDependenciesForTests({
      listPermissionKeysByUserId: permissionSpy.listPermissionKeysByUserId,
      resolveActiveAccountContext: accountSpy.resolveActiveAccountContext,
      async findSicatUserById(userId) {
        return { id: userId, isActive: true };
      }
    });

    const principal = await resolveChannelPrincipal({
      channel: 'whatsapp',
      userId: USER_ID,
      externalUserKey: '+5511999990000',
      // O vínculo FIXA uma conta — é justamente o valor que a mutação passava como sujeito.
      integrationAccountId: ACCOUNT_ID
    });

    assert.deepEqual(permissionSpy.calls, [USER_ID]);
    assert.deepEqual(accountSpy.calls, [USER_ID]);
    assert.deepEqual(principal.permissionKeys, USER_KEYS);
    assert.equal(principal.integrationAccountId, ACCOUNT_ID);
  });

  it('CONTROLE NEGATIVO: com o sujeito trocado, os dois casos acima quebram', async () => {
    // Prova que o duplo ENXERGA a troca. Sem isto, um duplo que devolvesse o mesmo conjunto para
    // qualquer argumento faria os casos acima passarem com a mutação aplicada.
    const permissionSpy = buildPermissionSpy();

    const keysForUser = await permissionSpy.listPermissionKeysByUserId(USER_ID);
    const keysForAccount = await permissionSpy.listPermissionKeysByUserId(ACCOUNT_ID);

    assert.notDeepEqual(
      keysForUser,
      keysForAccount,
      'o duplo devolve o mesmo conjunto para usuário e conta — não conseguiria distinguir a mutação'
    );
    assert.deepEqual(permissionSpy.calls, [USER_ID, ACCOUNT_ID], 'o duplo não registra o argumento recebido');
  });

  it('usuário INATIVO derruba o turno de canal ANTES de resolver permissão alguma', async () => {
    const permissionSpy = buildPermissionSpy();
    setConversationPrincipalDependenciesForTests({
      listPermissionKeysByUserId: permissionSpy.listPermissionKeysByUserId,
      resolveActiveAccountContext: buildAccountSpy().resolveActiveAccountContext,
      async findSicatUserById() {
        return { id: USER_ID, isActive: false };
      }
    });

    await assert.rejects(
      () => resolveChannelPrincipal({
        channel: 'whatsapp',
        userId: USER_ID,
        externalUserKey: '+5511999990000'
      }),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.code, 'CONVERSATION_PRINCIPAL_USER_INACTIVE');
        return true;
      }
    );

    // No canal não há token: sem esta guarda, desativar um funcionário nunca desligava o WhatsApp dele.
    assert.deepEqual(permissionSpy.calls, [], 'o turno seguiu adiante depois de o usuário estar inativo');
  });
});
