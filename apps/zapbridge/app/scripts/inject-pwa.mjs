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
      /* Fundo escuro EDGE-TO-EDGE no documento E no #root — o app preenche até a
         borda inferior (sem faixa preta). A safe-area (home indicator) é respeitada
         pelo CONTEÚDO (FAB/input/listas) via react-native-safe-area-context, não por
         padding no #root (que criava a faixa). */
      html, body, #root { background-color: #0b0b0b; overscroll-behavior: none; }
      /* Cobertura da tela: 100dvh = tela cheia no app instalado (standalone). Em
         repouso o #root segue ESTE CSS; o script só intervém com o teclado aberto. */
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
    // Cobertura da tela + teclado, à prova de iOS standalone:
    //  • REPOUSO → limpa qualquer estilo inline e deixa o CSS 100dvh mandar (tela
    //    cheia garantida, sem depender de medição JS que trava num valor curto).
    //  • TECLADO ABERTO → encolhe o #root para a viewport visível (input acima do teclado).
    //  • TECLADO FECHA → volta ao 100dvh (não fica preso numa altura errada = sem tarja).
    (function () {
      function apply() {
        var root = document.getElementById('root');
        if (!root) return;
        var vv = window.visualViewport;
        var winH = window.innerHeight;
        var visH = vv ? vv.height : winH;
        root.style.position = 'fixed';
        root.style.left = '0';
        root.style.right = '0';
        if (winH - visH > 120) {
          // teclado aberto → encolhe para a viewport visível (input acima do teclado)
          root.style.top = (vv && vv.offsetTop ? vv.offsetTop : 0) + 'px';
          root.style.bottom = 'auto';
          root.style.height = visH + 'px';
        } else {
          // repouso → inset:0 (o browser calcula a altura = TELA CHEIA, sem medir)
          root.style.top = '0';
          root.style.bottom = '0';
          root.style.height = 'auto';
          if (window.pageYOffset !== 0) window.scrollTo(0, 0);
        }
      }
      // Re-aplica em rajada: o iOS estabiliza a viewport com atraso após o teclado.
      function burst() { apply(); [60, 180, 360, 600].forEach(function (d) { setTimeout(apply, d); }); }
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', apply);
        window.visualViewport.addEventListener('scroll', apply);
      }
      window.addEventListener('resize', apply);
      window.addEventListener('orientationchange', burst);
      window.addEventListener('focusin', burst);   // teclado abriu
      window.addEventListener('focusout', burst);  // teclado fechou
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
