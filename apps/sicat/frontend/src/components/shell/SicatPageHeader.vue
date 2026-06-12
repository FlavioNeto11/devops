<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps({
  /** Lista de strings; se omitida, usamos route.meta.breadcrumb */
  breadcrumbs: { type: Array, default: null },
  title: { type: String, default: '' },
  section: { type: String, default: '' },
  /**
   * Kicker curto exibido acima do título (uppercase pequeno).
   * Quando informado, sobrepõe `section` para esse propósito visual.
   */
  kicker: { type: String, default: '' },
  description: { type: String, default: '' },
  /** Quando true, oculta o cartão de meta-contexto à direita. */
  compact: { type: Boolean, default: false },
  /**
   * Tom visual do header. 'system' adiciona kicker "Sistema · SRE"
   * e faixa neutra distinta. Lido automaticamente de route.meta.audience
   * se prop não informada.
   */
  tone: {
    type: String,
    default: null,
    validator: (value) => value === null || ['default', 'system'].includes(value)
  },
  activeAccountTypeLabel: { type: String, default: '' },
  activeCetesbAccountLabel: { type: String, default: '' }
});

const route = useRoute();

const resolvedBreadcrumbs = computed(() => {
  if (Array.isArray(props.breadcrumbs) && props.breadcrumbs.length) {
    return props.breadcrumbs;
  }
  const trail = Array.isArray(route.meta?.breadcrumb) ? route.meta.breadcrumb : [];
  return trail.length ? trail : ['SICAT'];
});

const resolvedTitle = computed(
  () => props.title || resolvedBreadcrumbs.value[resolvedBreadcrumbs.value.length - 1] || 'SICAT'
);

const resolvedSection = computed(
  () => props.section || resolvedBreadcrumbs.value[0] || 'SICAT'
);

const resolvedTone = computed(() => {
  if (props.tone) return props.tone;
  const audience = String(route.meta?.audience || '').toLowerCase();
  if (audience === 'system' || audience === 'admin') return 'system';
  return 'default';
});

const resolvedKicker = computed(() => {
  if (props.kicker) return props.kicker;
  if (resolvedTone.value === 'system') return 'Sistema · SRE';
  return '';
});
</script>

<template>
  <section
    class="sicat-page-header"
    :class="{ 'sicat-page-header--compact': compact }"
    :data-tone="resolvedTone"
  >
    <div class="sicat-page-header__copy">
      <div class="sicat-page-header__breadcrumbs" role="navigation" aria-label="Trilha de navegação">
        <span
          v-for="(crumb, index) in resolvedBreadcrumbs"
          :key="`${crumb}-${index}`"
          class="sicat-page-header__crumb"
          :aria-current="index === resolvedBreadcrumbs.length - 1 ? 'page' : undefined"
        >
          <span>{{ crumb }}</span>
          <v-icon v-if="index < resolvedBreadcrumbs.length - 1" size="14" aria-hidden="true">mdi-chevron-right</v-icon>
        </span>
      </div>
      <div>
        <span v-if="resolvedKicker" class="sicat-page-header__kicker">
          <v-icon v-if="resolvedTone === 'system'" size="12" class="sicat-page-header__kicker-icon">mdi-shield-search-outline</v-icon>
          {{ resolvedKicker }}
        </span>
        <h1 class="sicat-page-header__title">{{ resolvedTitle }}</h1>
        <p v-if="description" class="sicat-page-header__description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="sicat-page-header__actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="!compact && (activeAccountTypeLabel || activeCetesbAccountLabel || $slots.meta)" class="sicat-page-header__meta">
      <div v-if="activeAccountTypeLabel || activeCetesbAccountLabel" class="sicat-page-header__meta-card">
        <span>Conta ativa</span>
        <strong>{{ activeAccountTypeLabel }}</strong>
        <small>{{ activeCetesbAccountLabel }}</small>
      </div>
      <slot name="meta" />
    </div>
  </section>
</template>

<style scoped>
.sicat-page-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
  padding: 18px 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-sm);
}

.sicat-page-header--compact {
  padding: 14px 16px;
}

/* Tom "system": mesma superfície neutra, sinalizada só pela borda/kicker. */
.sicat-page-header[data-tone='system'] {
  border-color: rgba(var(--v-theme-warning), 0.4);
}

.sicat-page-header__kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.09);
  color: rgb(var(--v-theme-primary));
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.sicat-page-header[data-tone='system'] .sicat-page-header__kicker {
  background: rgba(var(--v-theme-warning), 0.12);
  color: rgba(var(--v-theme-warning), 0.98);
}

.sicat-page-header__kicker-icon {
  margin-right: 2px;
}

.sicat-page-header__copy {
  display: grid;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.sicat-page-header__breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.sicat-page-header__crumb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sicat-page-header__title {
  margin: 0;
  font-size: clamp(1.3rem, 1.7vw, 1.6rem);
  line-height: 1.15;
  letter-spacing: -0.015em;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.sicat-page-header__description {
  margin-top: 8px;
  max-width: 76ch;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 0.95rem;
}

.sicat-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sicat-page-header__meta {
  display: grid;
  min-width: 260px;
  gap: 12px;
}

.sicat-page-header__meta-card {
  display: grid;
  gap: 4px;
  align-content: start;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-subtle);
}

.sicat-page-header__meta-card span {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.sicat-page-header__meta-card strong {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1rem;
}

.sicat-page-header__meta-card small {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.82rem;
}

@media (max-width: 1179px) {
  .sicat-page-header {
    flex-direction: column;
  }

  .sicat-page-header__meta {
    min-width: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 959px) {
  .sicat-page-header {
    padding: 16px;
  }

  .sicat-page-header__title {
    font-size: 1.3rem;
  }
}

@media (max-width: 599px) {
  .sicat-page-header__description {
    display: none;
  }

  .sicat-page-header__meta {
    grid-template-columns: 1fr;
  }
}
</style>
