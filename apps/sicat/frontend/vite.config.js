import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

// ---------------------------------------------------------------------------
// IDENTIFICADOR DO BUILD
//
// Medido em produção: o navegador pode continuar servindo o `index.html` da
// publicação anterior a partir do cache de disco (deliveryType "cache",
// transferSize 0) mesmo com `Cache-Control: no-store` no nginx — o no-store só
// vale para entradas criadas DEPOIS dele, não desaloja a que já está guardada.
// Sem 404 em nenhum asset, a aba fica presa na versão velha em silêncio.
//
// A saída é comparar versões em RUNTIME, por fora do cache HTTP: o mesmo
// identificador é (1) embutido no bundle e (2) publicado em `dist/version.json`.
// A SPA busca o arquivo com `cache: "no-store"` e compara
// (`src/lib/version-check.js` + `src/lib/version-watch.js`).
//
// Gerado AQUI de propósito: nenhum passo externo de build precisa lembrar disso.
// A esteira pode fixar o valor (ex.: o SHA do commit) exportando VITE_BUILD_ID.
// ---------------------------------------------------------------------------
function resolveBuildId() {
  const external = String(process.env.VITE_BUILD_ID || '').trim();
  if (external) return external.slice(0, 64);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${random}`;
}

const BUILD_ID = resolveBuildId();
const BUILT_AT = new Date().toISOString();

// O Vite embute em `import.meta.env` toda variável do processo com o prefixo
// VITE_ (é assim que o Dockerfile passa VITE_API_BASE_URL). Definir aqui, antes
// da resolução da config, garante o MESMO valor no bundle e no version.json.
process.env.VITE_BUILD_ID = BUILD_ID;

/** Emite `dist/version.json` — a fonte que o runtime consulta. */
function versionManifestPlugin() {
  return {
    name: 'sicat-version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ buildId: BUILD_ID, builtAt: BUILT_AT }, null, 2)}\n`
      });
    }
  };
}

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    versionManifestPlugin()
  ]
});
