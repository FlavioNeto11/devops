<script setup>
/**
 * SicatHelpHint — ícone "?" ao lado de um rótulo que abre uma explicação simples
 * ("O que é isto?"). Puxa o texto do glossário central (linguagem leiga) ou de
 * props explícitas. Acessível: é um <button> com aria-label, abre por clique ou
 * teclado (Enter/Espaço) via v-menu.
 */
import { computed } from 'vue';
import { getGlossaryTerm } from '../../config/glossary.js';

const props = defineProps({
  /** Chave do glossário (config/glossary.js). */
  term: { type: String, default: '' },
  /** Overrides opcionais (quando não vem do glossário). */
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  example: { type: String, default: '' },
  size: { type: [Number, String], default: 18 }
});

const entry = computed(() => (props.term ? getGlossaryTerm(props.term) : null));
const heading = computed(() => props.title || entry.value?.simple || entry.value?.term || 'O que é isto?');
const body = computed(() => props.text || entry.value?.explain || '');
const example = computed(() => props.example || entry.value?.example || '');
const ariaLabel = computed(() => `O que é isto? ${heading.value}`);
</script>

<template>
  <v-menu :close-on-content-click="false" location="bottom start" max-width="320">
    <template #activator="{ props: menuProps }">
      <button
        type="button"
        class="sicat-help-hint"
        v-bind="menuProps"
        :aria-label="ariaLabel"
      >
        <v-icon :size="size" icon="mdi-help-circle-outline" aria-hidden="true" />
      </button>
    </template>
    <div class="sicat-help-hint__card" role="note">
      <strong class="sicat-help-hint__title">{{ heading }}</strong>
      <p v-if="body" class="sicat-help-hint__text">{{ body }}</p>
      <p v-if="example" class="sicat-help-hint__example">
        <span class="sicat-help-hint__example-label">Exemplo</span>{{ example }}
      </p>
    </div>
  </v-menu>
</template>

<style scoped>
.sicat-help-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: rgb(var(--v-theme-info));
  cursor: pointer;
  vertical-align: middle;
}
.sicat-help-hint:hover { background: rgba(var(--v-theme-info), 0.12); }
.sicat-help-hint:focus-visible {
  outline: 2px solid rgb(var(--v-theme-info));
  outline-offset: 2px;
}

.sicat-help-hint__card {
  padding: var(--space-4);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
.sicat-help-hint__title {
  display: block;
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.92);
  margin-bottom: 4px;
}
.sicat-help-hint__text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.76);
}
.sicat-help-hint__example {
  margin: 8px 0 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.sicat-help-hint__example-label {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-info), 0.14);
  color: rgb(var(--v-theme-info));
  font-size: 0.72rem;
  font-weight: 700;
}
</style>
