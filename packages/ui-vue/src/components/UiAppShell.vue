<template>
  <div class="ui-shell">
    <header class="ui-topbar">
      <button class="ui-burger" aria-label="Menu" :aria-expanded="String(navOpen)" @click="navOpen = !navOpen">☰</button>
      <RouterLink to="/" class="ui-brand">
        <span class="ui-brand-mark" aria-hidden="true">{{ initials }}</span>
        <span class="ui-brand-name">{{ title }}</span>
      </RouterLink>
      <div class="ui-spacer" />
      <button class="ui-icon-btn" :aria-label="dark ? 'Tema claro' : 'Tema escuro'" @click="toggleTheme">{{ dark ? '☀' : '☾' }}</button>
      <div v-if="user" class="ui-user" :title="user.email">
        <span class="ui-user-avatar" aria-hidden="true">{{ userInitial }}</span>
        <span class="ui-user-email">{{ user.email }}</span>
      </div>
      <a v-else-if="meChecked && loginHref" class="ui-btn" data-variant="ghost" data-size="sm" :href="loginHref">Entrar</a>
    </header>
    <div class="ui-main">
      <aside class="ui-sidebar" :data-open="navOpen ? 'true' : 'false'">
        <nav aria-label="Navegação">
          <div v-for="grp in nav" :key="grp.group" class="ui-nav-group">
            <p v-if="grp.group" class="ui-nav-grouptitle">{{ grp.group }}</p>
            <RouterLink v-for="it in grp.items" :key="it.to" :to="it.to" class="ui-nav-item"
                        :aria-current="isActive(it.to) ? 'page' : null" @click="navOpen = false">
              <span v-if="it.icon" class="ui-nav-icon" aria-hidden="true">{{ it.icon }}</span>
              <span>{{ it.label }}</span>
              <span v-if="it.badge" class="ui-nav-badge">{{ it.badge }}</span>
            </RouterLink>
          </div>
          <slot name="sidebar-footer" />
        </nav>
      </aside>
      <div v-if="navOpen" class="ui-scrim" @click="navOpen = false" />
      <main class="ui-content"><slot /></main>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
const props = defineProps({
  title: { type: String, default: 'App' },
  nav: { type: Array, default: () => [] },
  meUrl: { type: String, default: '' },
  loginHref: { type: String, default: '' },
});
const route = useRoute();
const navOpen = ref(false);
const dark = ref(false);
const user = ref(null);
const meChecked = ref(false);

const initials = computed(() => props.title.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
const userInitial = computed(() => (user.value && user.value.email ? user.value.email[0].toUpperCase() : '?'));
const isActive = (to) => route.path === to || (to !== '/' && route.path.startsWith(to));

function applyTheme(d) {
  dark.value = d;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', d);
  }
}
// chave única da plataforma (`nvit-theme`, a mesma da casca global) — o tema escolhido
// persiste entre portal/console/reqhub e os produtos da Forja. `theme` fica como legado de leitura.
function toggleTheme() { const d = !dark.value; applyTheme(d); try { localStorage.setItem('nvit-theme', d ? 'dark' : 'light'); } catch {} }

onMounted(async () => {
  let pref = null;
  try { pref = localStorage.getItem('nvit-theme') || localStorage.getItem('theme'); } catch {}
  if (pref) applyTheme(pref === 'dark');
  else if (typeof matchMedia !== 'undefined') applyTheme(matchMedia('(prefers-color-scheme: dark)').matches);
  if (props.meUrl) {
    try { const r = await fetch(props.meUrl); if (r.ok) { const m = await r.json(); if (m && m.email) user.value = m; } } catch {}
  }
  meChecked.value = true;
});
</script>
<style scoped>
.ui-shell { min-height: 100vh; display: flex; flex-direction: column; }
.ui-topbar { display: flex; align-items: center; gap: var(--ui-space-3); height: 56px; padding: 0 var(--ui-space-5); background: rgb(var(--ui-surface)); border-bottom: 1px solid rgb(var(--ui-border)); position: sticky; top: 0; z-index: var(--ui-z-bar); }
.ui-brand { display: inline-flex; align-items: center; gap: var(--ui-space-2); color: rgb(var(--ui-fg)); font-weight: 700; font-family: var(--ui-font-display); }
.ui-brand:hover { text-decoration: none; }
.ui-brand-mark { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: var(--ui-radius-md); background: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-fg)); font-size: var(--ui-text-xs); font-weight: 800; }
.ui-icon-btn { background: none; border: 1px solid rgb(var(--ui-border-strong)); color: rgb(var(--ui-fg)); width: 34px; height: 34px; border-radius: var(--ui-radius-md); cursor: pointer; font-size: 1rem; }
.ui-icon-btn:hover { background: rgb(var(--ui-surface-2)); }
.ui-user { display: inline-flex; align-items: center; gap: var(--ui-space-2); }
.ui-user-avatar { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); font-weight: 700; font-size: var(--ui-text-sm); }
.ui-user-email { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-burger { display: none; background: none; border: none; color: rgb(var(--ui-fg)); font-size: 1.3rem; cursor: pointer; }
.ui-main { display: flex; flex: 1; min-height: 0; }
.ui-sidebar { width: 232px; flex-shrink: 0; background: rgb(var(--ui-surface)); border-right: 1px solid rgb(var(--ui-border)); padding: var(--ui-space-4); overflow-y: auto; }
.ui-nav-group { margin-bottom: var(--ui-space-4); }
.ui-nav-grouptitle { margin: 0 0 var(--ui-space-2); padding: 0 var(--ui-space-2); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-faint)); font-weight: 700; }
.ui-nav-item { display: flex; align-items: center; gap: var(--ui-space-2); padding: 8px 10px; border-radius: var(--ui-radius-md); color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 500; }
.ui-nav-item:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); text-decoration: none; }
.ui-nav-item[aria-current="page"] { background: rgb(var(--ui-accent) / 0.12); color: rgb(var(--ui-accent-strong)); font-weight: 600; }
.ui-nav-icon { width: 18px; text-align: center; }
.ui-nav-badge { margin-left: auto; background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); border-radius: var(--ui-radius-pill); padding: 1px 7px; font-size: var(--ui-text-xs); font-weight: 700; }
.ui-content { flex: 1; min-width: 0; overflow-x: hidden; }
.ui-scrim { display: none; }
@media (max-width: 860px) {
  .ui-burger { display: inline-block; }
  .ui-user-email { display: none; }
  .ui-sidebar { position: fixed; top: 56px; bottom: 0; left: 0; z-index: var(--ui-z-bar); transform: translateX(-100%); transition: transform .2s ease; box-shadow: var(--ui-shadow-lg); }
  .ui-sidebar[data-open="true"] { transform: translateX(0); }
  @media (prefers-reduced-motion: reduce) { .ui-sidebar { transition: none; } }
  .ui-scrim { display: block; position: fixed; inset: 56px 0 0 0; background: rgb(2 6 23 / 0.4); z-index: 40; }
}
</style>
