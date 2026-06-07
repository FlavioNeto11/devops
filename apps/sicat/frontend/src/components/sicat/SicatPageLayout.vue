<script setup>
import { useSlots } from 'vue';
import SicatLoadingState from './SicatLoadingState.vue';
import SicatErrorState from './SicatErrorState.vue';
import { useProvidesPageHeader } from '../../composables/usePageChrome.js';

defineProps({
  /** Estado de carregamento global da página. */
  loading: { type: Boolean, default: false },
  /** Mensagem de carregamento (default: "Carregando…"). */
  loadingMessage: { type: String, default: 'Carregando…' },
  /** Mensagem de erro global da página. Quando definido, sobrescreve o conteúdo principal. */
  error: { type: [String, Object, null], default: null },
  /** Permite retry no estado de erro global. */
  retryable: { type: Boolean, default: false },
  /** Largura do conteúdo. */
  width: {
    type: String,
    default: 'default',
    validator: (value) => ['narrow', 'default', 'wide', 'full'].includes(value)
  }
});

const emit = defineEmits(['retry']);

// Quando a página fornece seu próprio header, o shell oculta o genérico (evita duplicação).
const slots = useSlots();
useProvidesPageHeader(() => Boolean(slots.header));
</script>

<template>
  <div class="sicat-page-layout" :data-width="width">
    <header v-if="$slots.header" class="sicat-page-layout__header">
      <slot name="header" />
    </header>

    <div v-if="$slots.banner" class="sicat-page-layout__banner">
      <slot name="banner" />
    </div>

    <div v-if="$slots.filters" class="sicat-page-layout__filters">
      <slot name="filters" />
    </div>

    <div v-if="$slots.actions" class="sicat-page-layout__actions">
      <slot name="actions" />
    </div>

    <main class="sicat-page-layout__body">
      <SicatLoadingState v-if="loading" :title="loadingMessage" />
      <SicatErrorState
        v-else-if="error"
        :message="typeof error === 'string' ? error : (error?.message || 'Erro ao carregar')"
        :code="typeof error === 'object' ? (error?.code || error?.correlationId || '') : ''"
        :retryable="retryable"
        @retry="emit('retry')"
      />
      <slot v-else />
    </main>

    <footer v-if="$slots.footer" class="sicat-page-layout__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.sicat-page-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  width: 100%;
  max-width: var(--app-max-width);
  margin: 0 auto;
}

.sicat-page-layout[data-width='narrow'] {
  max-width: 880px;
}

.sicat-page-layout[data-width='wide'] {
  max-width: 1680px;
}

.sicat-page-layout[data-width='full'] {
  max-width: 100%;
}

.sicat-page-layout__header,
.sicat-page-layout__banner,
.sicat-page-layout__filters,
.sicat-page-layout__actions,
.sicat-page-layout__body,
.sicat-page-layout__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sicat-page-layout__body {
  flex: 1;
  min-height: 0;
}

.sicat-page-layout__footer {
  padding-top: var(--space-4);
  border-top: 1px solid rgba(var(--v-border-color), 0.12);
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.85rem;
}
</style>
