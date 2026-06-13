/* =============================================================================
 * Exemplo de assets/config.js — copie para `config.js` no deploy e ajuste.
 * NENHUMA chave/segredo real no git. O portal chama PORTAL_CONFIG.onEvent(...)
 * em eventos como 'cluster_apps_loaded' e 'cluster_apps_error'.
 * ========================================================================== */
window.PORTAL_CONFIG = {
  /**
   * Coletor opcional de eventos do portal (analytics / Sentry / log de acesso).
   * Recebe (name: string, data: object). Nunca pode lançar — o portal já isola
   * a chamada em try/catch, mas mantenha-a leve e tolerante a falha.
   */
  onEvent(name, data) {
    // Exemplos (escolha um e configure no seu ambiente):
    //   navigator.sendBeacon('/telemetry', JSON.stringify({ name, data, ts: Date.now() }));
    //   window.plausible && window.plausible(name, { props: data });   // Plausible (self-host)
    //   window.gtag && window.gtag('event', name, data);               // GA4
    void name;
    void data;
  },
};
