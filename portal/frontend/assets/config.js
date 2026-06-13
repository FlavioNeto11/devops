/* =============================================================================
 * Portal NovaIT — configuração de runtime (OPCIONAL). Padrão: no-op.
 * -----------------------------------------------------------------------------
 * Carregado ANTES de portal.js. Sobrescreva este arquivo no deploy para ligar
 * analytics/observabilidade SEM segredo no git (ex.: encaminhar eventos do
 * portal a um coletor). Veja `config.example.js` para o contrato de `onEvent`.
 * Mantido vazio por padrão: o portal funciona sem nenhuma integração.
 * ========================================================================== */
window.PORTAL_CONFIG = window.PORTAL_CONFIG || {};
