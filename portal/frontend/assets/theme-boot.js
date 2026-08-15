/* =============================================================================
 * theme-boot.js — aplica o tema escolhido pelo usuário ANTES do paint.
 * -----------------------------------------------------------------------------
 * Páginas estáticas SEM a casca (<platform-shell>) — como a 404 — não têm quem
 * leia o toggle de tema persistido pela casca. Este snippet minúsculo lê a mesma
 * chave (`nvit-theme`) e marca <html> com data-theme/.dark, espelhando exatamente
 * o que a casca faz (platform-shell.js `_applyTheme`). Sem escolha salva, nada é
 * marcado e os tokens seguem a preferência do sistema (prefers-color-scheme).
 *
 * Externo (não inline) de propósito: passa direto na CSP `script-src 'self'` do
 * portal, sem precisar de hash. CSP-safe, sem dependências.
 * ========================================================================== */
(function () {
  try {
    var t = localStorage.getItem('nvit-theme');
    if (t !== 'dark' && t !== 'light') return; // sem escolha explícita → preferência do sistema
    var el = document.documentElement;
    el.setAttribute('data-theme', t);
    el.classList.toggle('dark', t === 'dark');
  } catch {
    /* localStorage indisponível (modo privado etc.) — tema segue o sistema */
  }
})();
