<template>
  <div class="ui-empty" :data-compact="compact ? 'true' : 'false'" role="status">
    <span class="ui-empty-icon" aria-hidden="true">{{ glyph }}</span>
    <p class="ui-empty-title">{{ title || 'Nada por aqui ainda' }}</p>
    <p v-if="description" class="ui-empty-desc">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty-action"><slot name="action" /></div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { resolveGlyph } from '../lib/glyphs.js';
const props = defineProps({ title: String, description: String, icon: String, compact: Boolean });
// `icon` aceita um glifo/emoji direto OU um nome canônico ('doc','clock','search'…) → glifo.
// Evita renderizar a PALAVRA literal quando a chamada passa um nome. Fallback '∅'.
const glyph = computed(() => resolveGlyph(props.icon, '∅'));
</script>
<style scoped>
.ui-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--ui-space-2); padding: var(--ui-space-6) var(--ui-space-4); color: rgb(var(--ui-muted)); }
.ui-empty[data-compact="true"] { padding: var(--ui-space-4); }
.ui-empty-icon { font-size: 2rem; opacity: .6; }
.ui-empty-title { font-weight: 600; color: rgb(var(--ui-fg)); margin: 0; }
.ui-empty-desc { margin: 0; font-size: var(--ui-text-sm); max-width: 42ch; }
.ui-empty-action { margin-top: var(--ui-space-2); }
</style>
