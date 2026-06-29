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
      /* Fundo escuro no documento — evita as faixas brancas do iOS (overscroll,
         gap acima do teclado, áreas fora do #root). */
      html, body { background-color: #0b141a; overscroll-behavior: none; }
      /* Altura dinâmica da viewport: acompanha a barra do Safari e o teclado no
         iOS (com fallback para navegadores sem dvh). */
      html, body, #root { height: 100vh; height: 100dvh; }
      /* iOS Safari dá zoom ao focar inputs com fonte < 16px (e ignora
         user-scalable=no). Força 16px no mobile para impedir o zoom. */
      @media screen and (max-width: 900px) {
        input, textarea, select { font-size: 16px !important; }
      }
      /* Instalado em tela cheia (standalone): só a barra inferior (home indicator).
         O topo (notch/status bar) já é tratado pelo header de navegação do app —
         aplicar aqui também empilharia o inset em dobro (header gigante). */
      @media (display-mode: standalone) {
        #root {
          box-sizing: border-box;
          padding-bottom: env(safe-area-inset-bottom);
        }
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
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/zapbridge/sw.js', { scope: '/zapbridge/' }).catch(function () {});
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
