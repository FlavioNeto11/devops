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
    <meta name="theme-color" content="#0b0b0b" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="ZapBridge" />
    <link rel="apple-touch-icon" href="/zapbridge/icons/apple-touch-icon.png" />
    <link rel="icon" type="image/png" href="/zapbridge/icons/icon-192.png" />
    <meta name="color-scheme" content="dark" />
    <style>
      /* Ancoragem à prova de zoom/scroll: html/body TRAVADOS (fixed, sem rolagem) e o
         #root fixado nos 4 cantos por CSS PURO (position:fixed; top/left/right/bottom:0).
         NÃO depende de medição JS nem de 100dvh — então zoom e scroll do iOS não deslocam
         o app. O container do react-native-web estica porque o #root é um flex column (o
         build do Expo não injeta esse reset). */
      html, body {
        margin: 0; padding: 0; height: 100%; width: 100%;
        overflow: hidden; overscroll-behavior: none;
        background-color: #0b0b0b;
      }
      body { position: fixed; top: 0; left: 0; right: 0; bottom: 0; }
      #root {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        display: flex; flex-direction: column; overflow: hidden;
        background-color: #0b0b0b;
      }
      /* iOS Safari dá zoom ao focar inputs com fonte < 16px. Força 16px no mobile. */
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
    // A ancoragem nos 4 cantos é 100% CSS (position:fixed) — imune a zoom e scroll.
    // O JS só levanta o RODAPÉ do #root quando o TECLADO abre (e IGNORA zoom), sem
    // nunca ler scroll/offset. top/left/right ficam fixos pelo CSS o tempo todo.
    (function () {
      function onChange() {
        var root = document.getElementById('root');
        var vv = window.visualViewport;
        if (!root || !vv) return;
        // ZOOM (pinça do usuário): escala ≠ 1 → não mexe no layout.
        if (vv.scale && Math.abs(vv.scale - 1) > 0.01) return;
        var kb = Math.round(window.innerHeight - vv.height);
        // teclado aberto → sobe o rodapé acima do teclado; fechado → volta a 0.
        root.style.bottom = kb > 120 ? kb + 'px' : '0px';
      }
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onChange);
      }
      window.addEventListener('focusout', function () { setTimeout(onChange, 100); });
      window.addEventListener('orientationchange', function () { setTimeout(onChange, 200); });
      onChange();
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
