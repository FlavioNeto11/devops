// Pós-processa o dist/ do Expo para PWA:
//  1. copia public/ (manifest, sw.js, icons) para dist/
//  2. injeta no index.html: manifest, theme-color, metas apple, apple-touch-icon,
//     viewport-fit=cover e o registro do service worker.
// Idempotente: rodar 2x não duplica.
import { readFileSync, writeFileSync, existsSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const dist = join(appDir, 'dist');
const pub = join(appDir, 'public');

if (!existsSync(dist)) {
  console.error('dist/ não encontrado — rode `expo export --platform web` antes.');
  process.exit(1);
}

if (existsSync(pub)) {
  cpSync(pub, dist, { recursive: true });
  console.log('✓ public/ → dist/');
}

const idxPath = join(dist, 'index.html');
let html = readFileSync(idxPath, 'utf8');

if (html.includes('rel="manifest"')) {
  console.log('✓ tags PWA já presentes (idempotente)');
  process.exit(0);
}

const headTags = `
    <link rel="manifest" href="/zapbridge/manifest.webmanifest" />
    <meta name="theme-color" content="#00a884" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="ZapBridge" />
    <link rel="apple-touch-icon" href="/zapbridge/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" href="/zapbridge/icons/icon-192.png" />
    <meta name="color-scheme" content="dark" />
    <style>
      /* Fundo escuro EDGE-TO-EDGE no documento E no #root — o app preenche até a
         borda inferior (sem faixa preta). A safe-area (home indicator) é respeitada
         pelo CONTEÚDO (FAB/input/listas) via react-native-safe-area-context, não por
         padding no #root (que criava a faixa). */
      html, body, #root { background-color: #0b141a; overscroll-behavior: none; }
      /* Altura dinâmica da viewport: acompanha a barra do Safari (com fallback). O
         teclado é tratado pelo script visualViewport abaixo. */
      html, body, #root { height: 100vh; height: 100dvh; }
      /* iOS Safari dá zoom ao focar inputs com fonte < 16px (e ignora
         user-scalable=no). Força 16px no mobile para impedir o zoom. */
      @media screen and (max-width: 900px) {
        input, textarea, select { font-size: 16px !important; }
      }
    </style>
  `;
html = html.replace('</head>', headTags + '</head>');

// viewport estilo app (sem zoom, respeitando notch)
html = html.replace(
  /<meta name="viewport"[^>]*\/?>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />',
);

const swScript = `
  <script>
    // Fixa o app na VIEWPORT VISÍVEL (visualViewport): acompanha a barra do
    // navegador e o TECLADO virtual com precisão no mobile, eliminando o espaço
    // vazio embaixo (o 100dvh do CSS não encolhe com o teclado na maioria dos browsers).
    (function () {
      var root = null;
      function apply() {
        root = root || document.getElementById('root');
        if (!root) return;
        var vv = window.visualViewport;
        var h = vv ? vv.height : window.innerHeight;
        var top = vv ? vv.offsetTop : 0;
        root.style.position = 'fixed';
        root.style.left = '0';
        root.style.right = '0';
        root.style.top = top + 'px';
        root.style.height = h + 'px';
        // iOS rola o LAYOUT viewport ao abrir/fechar o teclado e deixa um resíduo
        // (a tarja preta). Forçar o topo a 0 corrige.
        if (window.pageYOffset !== 0) window.scrollTo(0, 0);
      }
      // Re-aplica em rajada: o iOS estabiliza a viewport com atraso após o teclado.
      function burst() { apply(); [50, 150, 300, 500, 800].forEach(function (d) { setTimeout(apply, d); }); }
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', apply);
        window.visualViewport.addEventListener('scroll', apply);
      }
      window.addEventListener('resize', apply);
      window.addEventListener('scroll', function () { if (window.pageYOffset !== 0) apply(); }, { passive: true });
      window.addEventListener('orientationchange', burst);
      window.addEventListener('focusin', burst);   // teclado abriu
      window.addEventListener('focusout', burst);  // teclado fechou (re-mede com atraso)
      window.addEventListener('pageshow', burst);
      burst();
    })();
    if ('serviceWorker' in navigator) {
      // Auto-update: ao detectar um SW novo assumindo o controle, recarrega 1x
      // (essencial no iOS instalado, que não tem "hard refresh").
      var __reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (__reloading) return;
        __reloading = true;
        window.location.reload();
      });
      window.addEventListener('load', function () {
        navigator.serviceWorker
          .register('/zapbridge/sw.js', { scope: '/zapbridge/' })
          .then(function (reg) {
            reg.update();
            setInterval(function () { reg.update(); }, 30 * 60 * 1000);
          })
          .catch(function () {});
      });
      // Ao voltar o foco ao app (reabrir o ícone no iOS), checa atualização.
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
          navigator.serviceWorker.getRegistration().then(function (reg) { if (reg) reg.update(); }).catch(function () {});
        }
      });
    }
    // Captura o prompt de instalação (Android/desktop Chrome/Edge) cedo, antes do
    // React montar, e avisa o app via eventos custom.
    window.__deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window.__deferredInstallPrompt = e;
      window.dispatchEvent(new Event('pwa-installable'));
    });
    window.addEventListener('appinstalled', function () {
      window.__deferredInstallPrompt = null;
      window.dispatchEvent(new Event('pwa-installed'));
    });
  </script>
  `;
html = html.replace('</body>', swScript + '</body>');

writeFileSync(idxPath, html);
console.log('✓ tags PWA + service worker injetados em index.html');
