import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFrontend } from './helpers.mjs';

const html = readFrontend('index.html');

test('usa HTML semântico (header/nav/main/footer) e skip-link', () => {
  assert.match(html, /<header\b/);
  assert.match(html, /<nav\b/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /<footer\b/);
  assert.match(html, /class="skip-link"[^>]*href="#main"/);
});

test('CTAs principais com verbo + destino', () => {
  for (const cta of [
    'Acessar SICAT',
    'Acessar GymOps',
    'Acessar portal RM Ambiental',
    'Acessar portal Ana Rabottini',
    'Abrir DevOps Console',
    'Abrir Grafana',
    'Abrir Argo CD',
    'Abrir Keycloak',
    'Abrir Portal Recorder',
  ]) {
    assert.ok(html.includes(cta), `faltou CTA: ${cta}`);
  }
});

test('preserva todas as rotas/subpaths existentes', () => {
  for (const href of [
    '/sicat',
    '/gymops',
    '/rmambiental',
    '/anarabottini',
    '/devops',
    '/grafana',
    '/argocd',
    '/auth',
    '/portal-rec',
  ]) {
    assert.match(html, new RegExp(`href="${href}"`), `faltou link para ${href}`);
  }
});

test('indica apps que exigem login', () => {
  assert.ok(html.includes('exige login'));
  // SICAT e GymOps marcados com badge de login
  assert.match(html, /data-path="\/sicat"[\s\S]*?exige login/);
});

test('marca ferramentas internas com badge', () => {
  assert.ok(html.includes('badge is-internal'));
  assert.ok(html.includes('>interno<'));
});

test('busca, seção dinâmica e região de estado presentes', () => {
  assert.match(html, /id="app-search"/);
  assert.match(html, /role="search"/);
  assert.match(html, /id="cluster-apps"/);
  assert.match(html, /id="cluster-state"[^>]*aria-live="polite"/);
});

test('seção de descoberta começa oculta (recurso de operador, API autenticada)', () => {
  // só aparece quando a API do Console responde (operador logado); anônimo não vê
  assert.match(html, /id="cluster-section"[^>]*\shidden/);
});

test('menu mobile e botão voltar-ao-topo acessíveis', () => {
  assert.match(html, /id="nav-toggle"[\s\S]*?aria-expanded="false"/);
  assert.match(html, /aria-controls="nav-links"/);
  assert.match(html, /id="to-top"[^>]*aria-label="Voltar ao topo"/);
});

test('imagens decorativas marcadas aria-hidden e logo com aria-label', () => {
  assert.match(html, /class="bg-grid" aria-hidden="true"/);
  assert.match(html, /class="brand"[^>]*aria-label="NovaIT/);
});
