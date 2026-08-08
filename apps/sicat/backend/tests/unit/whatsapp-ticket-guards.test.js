import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setConfigOverride } from '../../src/lib/config.js';
import {
  metadataContainsCode,
  resolveTicketTtlMs,
  WHATSAPP_TICKET_TTL_MIN_SECONDS,
  WHATSAPP_TICKET_TTL_MAX_SECONDS
} from '../../src/services/conversation/channel/whatsapp/whatsapp-action-ticket-service.js';

/**
 * Duas guardas do ticket de confirmação que sobreviveram ao teste de mutação da fase 5 (sondas
 * `TTL-10` e `CODE-02`) — as únicas sobreviventes que não eram ramo morto do N2.
 */

describe('whatsapp-action-ticket — barreira de colisão do código (CODE-02)', () => {
  /**
   * O código de 6 dígitos é sorteado; o `metadata` é persistido. Se o código sorteado aparecer como
   * SUBSTRING de algo que já está no metadata, ele fica legível em claro na linha do banco — e o
   * ponto inteiro do desenho é que o código nunca seja persistido em claro.
   *
   * Não é hipótese remota: o metadata carrega número de MTR, que tem 12 dígitos e portanto SETE
   * substrings de 6 dígitos. Com alguns manifestos na prévia, a chance de colisão é material.
   *
   * A mutação que sobreviveu fazia esta função devolver `false` sempre, desligando o re-sorteio.
   */
  it('detecta o código escondido DENTRO de um número de MTR do metadata', () => {
    // 202600123456 contém '001234' a partir do 5º dígito.
    const metadata = { itemLabels: ['MTR 202600123456 - NOVA IT AMBIENTAL'] };

    assert.equal(metadataContainsCode(metadata, '001234'), true);
  });

  it('detecta o código em qualquer profundidade da estrutura, não só no topo', () => {
    const metadata = { binding: { snapshot: { accountId: 'acc_998877' } } };

    assert.equal(metadataContainsCode(metadata, '998877'), true);
  });

  it('não acusa código ausente — a barreira não pode recusar emissão à toa', () => {
    const metadata = { itemLabels: ['MTR 202600123456 - NOVA IT AMBIENTAL'] };

    assert.equal(metadataContainsCode(metadata, '654321'), false);
  });

  it('CONTROLE NEGATIVO: com a barreira desligada, a colisão passaria despercebida', () => {
    // Prova que o caso positivo acima não passa por construção: uma implementação que devolve
    // `false` sempre (a mutação exata) discorda do resultado real.
    const metadata = { itemLabels: ['MTR 202600123456'] };
    const mutada = () => false;

    assert.notEqual(mutada(), metadataContainsCode(metadata, '001234'));
  });
});

describe('whatsapp-action-ticket — teto e piso do TTL (TTL-10)', () => {
  afterEach(() => {
    setConfigOverride('whatsappActionTicketTtlSeconds', undefined);
  });

  it('valor ilegível cai no padrão de 300 s, e NÃO em zero', () => {
    // A mutação que sobreviveu trocava o fallback por `0`. Zero cai fora da faixa, então toda emissão
    // passaria a ser recusada: perda silenciosa de capacidade, sem erro que explique.
    setConfigOverride('whatsappActionTicketTtlSeconds', 'nao-e-numero');

    assert.equal(resolveTicketTtlMs(), 300_000);
  });

  it('valor ausente ou não-positivo também cai no padrão', () => {
    for (const valor of [undefined, '', 0, -1, Number.NaN]) {
      setConfigOverride('whatsappActionTicketTtlSeconds', valor);
      assert.equal(resolveTicketTtlMs(), 300_000, `valor ${String(valor)} deveria cair no padrão`);
    }
  });

  it('TTL absurdo é RECUSADO, não clampado em silêncio', () => {
    // 100 anos — a env é entrada externa, e esvaziar o prazo esvazia a única grandeza que limita a
    // janela de resgate de uma ação irreversível.
    setConfigOverride('whatsappActionTicketTtlSeconds', 3_153_600_000);

    assert.equal(resolveTicketTtlMs(), null);
  });

  it('TTL curto demais é RECUSADO — expiraria antes de a mensagem chegar', () => {
    setConfigOverride('whatsappActionTicketTtlSeconds', 1);

    assert.equal(resolveTicketTtlMs(), null);
  });

  it('as bordas da faixa são aceitas', () => {
    setConfigOverride('whatsappActionTicketTtlSeconds', WHATSAPP_TICKET_TTL_MIN_SECONDS);
    assert.equal(resolveTicketTtlMs(), WHATSAPP_TICKET_TTL_MIN_SECONDS * 1000);

    setConfigOverride('whatsappActionTicketTtlSeconds', WHATSAPP_TICKET_TTL_MAX_SECONDS);
    assert.equal(resolveTicketTtlMs(), WHATSAPP_TICKET_TTL_MAX_SECONDS * 1000);
  });
});
