/**
 * Emissão de access token SICAT para testes de API.
 *
 * `sicatAuthMiddleware` verifica ASSINATURA e EXPIRAÇÃO com `config.sicatAccessTokenSecret` e não
 * consulta o banco — então um token assinado aqui é indistinguível, para o middleware, de um emitido
 * pelo `POST /v1/sicat/auth/login`. Isso mantém os testes de rota focados na rota, sem arrastar
 * seed de usuário e login real para dentro de cada suíte.
 *
 * Nenhuma credencial real: `createAccessToken` é a MESMA função usada em produção
 * (`sicat-auth-service`), aplicada a um `sub` sintético.
 */

import { createAccessToken } from '../../src/lib/sicat-security.js';
import { config } from '../../src/lib/config.js';

/**
 * @param {{ userId?: string, roles?: string[], ttlSeconds?: number }} [options]
 * @returns {string} access token assinado
 */
export function createTestAccessToken(options = {}) {
  const {
    userId = 'usr_test_route_guard',
    roles = [],
    ttlSeconds = 3600
  } = options;

  return createAccessToken(
    { sub: userId, email: `${userId}@example.test`, name: 'QA Route Guard', roles },
    { secret: config.sicatAccessTokenSecret, ttlSeconds }
  );
}

/** Headers com Bearer válido, prontos para `fetch`. */
export function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${createTestAccessToken()}`, ...extra };
}
