<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { findActiveGroup, isNavigationItemActive } from '../../config/navigation.js';

const props = defineProps({
  groups: {
    type: Array,
    required: true
  }
});

defineEmits(['navigate']);

const route = useRoute();
const activeGroup = computed(() => findActiveGroup(props.groups, route.path));

function isActive(path) {
  return isNavigationItemActive(route.path, path);
}

function isGroupActive(group) {
  return activeGroup.value?.id === group.id;
}

// ─── Excedente da faixa de navegação ────────────────────────────────────────
// A nav divide a barra com a marca e os controles de conta. Quando os itens não
// cabem, a rolagem horizontal (solução anterior) deixava o último item
// INALCANÇÁVEL na prática — sem barra visível e sem alvo de teclado, "Tirar
// dúvidas" sumia no perfil Destinador a 1534px. Agora medimos o que cabe e o
// restante vai para um menu "Mais", que é botão de verdade (foco + teclado).
const navRef = ref(null);
// Reserva para o gatilho "Mais" (ícone + rótulo + chevron). É deliberadamente
// MAIOR que a largura real do botão (CSS `.sicat-nav__more`): sobrar espaço só
// custa, no pior caso, um item a mais dentro do menu; faltar traria de volta o
// transbordo que esconde item.
const MORE_TRIGGER_WIDTH = 120;
const ALL_VISIBLE = Number.POSITIVE_INFINITY;
const overflowStart = ref(ALL_VISIBLE);

const visibleGroups = computed(() => (
  overflowStart.value === ALL_VISIBLE ? props.groups : props.groups.slice(0, overflowStart.value)
));
const overflowGroups = computed(() => (
  overflowStart.value === ALL_VISIBLE ? [] : props.groups.slice(overflowStart.value)
));
const hasOverflow = computed(() => overflowGroups.value.length > 0);
const isOverflowActive = computed(
  () => hasOverflow.value && overflowGroups.value.some((group) => isGroupActive(group))
);

function readNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

let measureScheduled = false;

async function measureOverflow() {
  const el = navRef.value;
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    return;
  }

  // Passo 1: renderiza tudo por um quadro para ler as larguras naturais.
  // `overflow-x` da faixa contém o transbordo momentâneo.
  overflowStart.value = ALL_VISIBLE;
  await nextTick();

  const nodes = Array.from(el.querySelectorAll('[data-nav-measure]'));
  if (!nodes.length) {
    return;
  }

  const style = typeof globalThis.getComputedStyle === 'function' ? globalThis.getComputedStyle(el) : null;
  const gap = readNumber(style?.columnGap ?? style?.gap, 4);
  const paddingX = readNumber(style?.paddingLeft, 0) + readNumber(style?.paddingRight, 0);
  const available = el.clientWidth - paddingX;
  const widths = nodes.map((node) => node.getBoundingClientRect().width);

  // Medição indisponível (jsdom, elemento oculto): mantém tudo visível.
  if (!(available > 0) || widths.some((width) => !(width > 0))) {
    overflowStart.value = ALL_VISIBLE;
    return;
  }

  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  if (total <= available) {
    overflowStart.value = ALL_VISIBLE;
    return;
  }

  let used = MORE_TRIGGER_WIDTH;
  let fits = 0;
  for (const width of widths) {
    const next = used + gap + width;
    if (next > available) break;
    used = next;
    fits += 1;
  }

  overflowStart.value = fits;
}

function scheduleMeasure() {
  if (measureScheduled) {
    return;
  }
  measureScheduled = true;
  const raf = globalThis.requestAnimationFrame || ((cb) => globalThis.setTimeout(cb, 16));
  raf(() => {
    measureScheduled = false;
    void measureOverflow();
  });
}

let resizeObserver = null;

onMounted(() => {
  scheduleMeasure();
  if (typeof globalThis.ResizeObserver === 'function' && navRef.value) {
    resizeObserver = new globalThis.ResizeObserver(scheduleMeasure);
    resizeObserver.observe(navRef.value);
  } else {
    globalThis.addEventListener?.('resize', scheduleMeasure);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  globalThis.removeEventListener?.('resize', scheduleMeasure);
});

// Troca de perfil/permissão muda os rótulos e a quantidade de itens.
watch(() => props.groups, scheduleMeasure, { deep: true });
</script>

<template>
  <ul ref="navRef" class="sicat-nav" aria-label="Navegação principal">
    <li v-for="group in visibleGroups" :key="group.id" class="sicat-nav__item" data-nav-measure>
      <router-link
        v-if="group.kind === 'direct'"
        :to="group.to"
        class="sicat-nav__link"
        :class="{ 'is-active': isActive(group.to) }"
        :aria-current="isActive(group.to) ? 'page' : undefined"
        @click="$emit('navigate', group.to)"
      >
        <v-icon size="18">{{ group.icon }}</v-icon>
        <span>{{ group.label }}</span>
      </router-link>

      <v-menu
        v-else
        location="bottom start"
        :close-on-content-click="true"
        offset="8"
      >
        <template #activator="{ props: activatorProps }">
          <button
            v-bind="activatorProps"
            type="button"
            class="sicat-nav__link sicat-nav__link--group"
            :class="{ 'is-active': isGroupActive(group) }"
            :aria-label="`Abrir grupo ${group.label}`"
            aria-haspopup="menu"
          >
            <v-icon size="18" aria-hidden="true">{{ group.icon }}</v-icon>
            <span>{{ group.label }}</span>
            <v-icon size="16" class="sicat-nav__chevron" aria-hidden="true">mdi-chevron-down</v-icon>
          </button>
        </template>

        <v-card class="sicat-nav__menu" min-width="280" elevation="8">
          <v-list density="comfortable" nav>
            <v-list-item
              v-for="item in group.items"
              :key="item.to"
              :prepend-icon="item.icon"
              :title="item.label"
              :subtitle="item.description"
              :active="isActive(item.to)"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              :to="item.to"
              rounded="lg"
              @click="$emit('navigate', item.to)"
            />
          </v-list>
        </v-card>
      </v-menu>
    </li>

    <li v-if="hasOverflow" class="sicat-nav__item sicat-nav__item--more">
      <v-menu location="bottom end" :close-on-content-click="true" offset="8">
        <template #activator="{ props: activatorProps }">
          <button
            v-bind="activatorProps"
            type="button"
            class="sicat-nav__link sicat-nav__link--group sicat-nav__more"
            :class="{ 'is-active': isOverflowActive }"
            aria-label="Abrir os demais itens do menu"
            aria-haspopup="menu"
          >
            <v-icon size="18" aria-hidden="true">mdi-dots-horizontal</v-icon>
            <span>Mais</span>
            <v-icon size="16" class="sicat-nav__chevron" aria-hidden="true">mdi-chevron-down</v-icon>
          </button>
        </template>

        <v-card class="sicat-nav__menu" min-width="300" elevation="8">
          <v-list density="comfortable" nav>
            <template v-for="group in overflowGroups" :key="group.id">
              <v-list-item
                v-if="group.kind === 'direct'"
                :prepend-icon="group.icon"
                :title="group.label"
                :subtitle="group.description"
                :active="isActive(group.to)"
                :aria-current="isActive(group.to) ? 'page' : undefined"
                :to="group.to"
                rounded="lg"
                @click="$emit('navigate', group.to)"
              />

              <template v-else>
                <v-list-subheader>{{ group.label }}</v-list-subheader>
                <v-list-item
                  v-for="item in group.items"
                  :key="item.to"
                  :prepend-icon="item.icon"
                  :title="item.label"
                  :subtitle="item.description"
                  :active="isActive(item.to)"
                  :aria-current="isActive(item.to) ? 'page' : undefined"
                  :to="item.to"
                  rounded="lg"
                  @click="$emit('navigate', item.to)"
                />
              </template>
            </template>
          </v-list>
        </v-card>
      </v-menu>
    </li>
  </ul>
</template>

<style scoped>
/* A navegação divide a barra com a marca (esquerda) e os controles de conta
   (direita). O que não couber vai para o menu "Mais" (medição no script), então
   a faixa não precisa mais depender de rolagem para expor itens. O
   `overflow-x: auto` fica como rede de segurança: contém o quadro de medição e
   degrada para rolagem caso a medição não seja possível (sem ResizeObserver,
   ambiente de teste), em vez de recortar itens. `safe center` evita que o
   excedente seja pintado por cima da marca e dos controles. */
.sicat-nav {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  justify-content: center;
  justify-content: safe center;
  gap: 4px;
  margin: 0;
  padding: 3px 12px;
  list-style: none;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* Barra de rolagem some: a faixa tem 64px e o scroll aqui é só válvula de
   escape para viewports estreitos (o menu completo continua no drawer). */
.sicat-nav::-webkit-scrollbar {
  display: none;
}

.sicat-nav__item {
  display: flex;
  flex: 0 0 auto;
}

.sicat-nav__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.sicat-nav__link:hover,
.sicat-nav__link:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.92);
  outline: none;
}

/* Ativo monocromático: texto + fundo discreto na cor do acento, sem gradiente
   nem sombra — leitura imediata de "onde estou" sem gritar. */
.sicat-nav__link.is-active {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

/* O gatilho "Mais" tem de caber na reserva da medição (MORE_TRIGGER_WIDTH=120). */
.sicat-nav__more {
  max-width: 120px;
  justify-content: center;
}

.sicat-nav__chevron {
  margin-left: 2px;
  opacity: 0.7;
}

.sicat-nav__menu {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
}
</style>
