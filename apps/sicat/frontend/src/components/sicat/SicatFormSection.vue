<script setup>
defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  /** Marca a seção como obrigatória (asterisco). */
  required: { type: Boolean, default: false },
  /** Número da etapa (uso em wizards). */
  step: { type: [Number, String], default: null }
});
</script>

<template>
  <section class="sicat-form-section">
    <header v-if="title || description || $slots['header-actions']" class="sicat-form-section__head">
      <div class="sicat-form-section__heading">
        <span v-if="step !== null" class="sicat-form-section__step">{{ step }}</span>
        <div>
          <h3 v-if="title" class="sicat-form-section__title">
            {{ title }}
            <span v-if="required" class="sicat-form-section__required" aria-hidden="true">*</span>
          </h3>
          <p v-if="description" class="sicat-form-section__description">{{ description }}</p>
        </div>
      </div>
      <div v-if="$slots['header-actions']" class="sicat-form-section__actions">
        <slot name="header-actions" />
      </div>
    </header>

    <div class="sicat-form-section__grid">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.sicat-form-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border: 1px solid rgba(var(--v-border-color), 0.14);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
}

.sicat-form-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sicat-form-section__heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sicat-form-section__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgba(var(--v-theme-primary), 1);
  font-weight: 800;
  font-size: 0.85rem;
}

.sicat-form-section__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.sicat-form-section__required {
  color: rgb(var(--v-theme-error));
  margin-left: 2px;
}

.sicat-form-section__description {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.sicat-form-section__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
}
</style>
