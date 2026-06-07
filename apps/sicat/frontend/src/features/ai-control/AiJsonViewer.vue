<script setup>
import { computed, ref } from 'vue';

/**
 * Visualizador de JSON grande. Por padrão NÃO renderiza inline: expõe um botão
 * que abre um v-dialog com o conteúdo formatado dentro de um <pre> rolável.
 * Inclui ação de copiar para a área de transferência.
 */
const props = defineProps({
  /** Qualquer valor serializável (objeto, array, string…). */
  value: { type: [Object, Array, String, Number, Boolean, null], default: null },
  /** Rótulo do botão que abre o diálogo. */
  label: { type: String, default: 'Ver JSON' },
  /** Título do diálogo. */
  title: { type: String, default: 'Conteúdo JSON' },
  /** Ícone do botão. */
  icon: { type: String, default: 'mdi-code-json' },
  /** Variante do botão. */
  buttonVariant: { type: String, default: 'outlined' },
  /** Tamanho do botão. */
  buttonSize: { type: String, default: 'small' }
});

const dialog = ref(false);
const copied = ref(false);

const pretty = computed(() => {
  if (props.value == null) return '—';
  if (typeof props.value === 'string') return props.value;
  try {
    return JSON.stringify(props.value, null, 2);
  } catch {
    return String(props.value);
  }
});

async function copy() {
  try {
    await navigator.clipboard.writeText(pretty.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <span class="ai-json-viewer">
    <v-btn
      :variant="buttonVariant"
      :size="buttonSize"
      :prepend-icon="icon"
      @click="dialog = true"
    >
      {{ label }}
    </v-btn>

    <v-dialog v-model="dialog" max-width="860" scrollable>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center justify-space-between ga-2">
          <span>{{ title }}</span>
          <div class="d-flex align-center ga-1">
            <v-btn
              variant="text"
              size="small"
              :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
              @click="copy"
            >
              {{ copied ? 'Copiado' : 'Copiar' }}
            </v-btn>
            <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="dialog = false" />
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text class="ai-json-viewer__body">
          <pre class="ai-json-viewer__pre">{{ pretty }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>
  </span>
</template>

<style scoped>
.ai-json-viewer {
  display: inline-flex;
}

.ai-json-viewer__body {
  max-height: 70vh;
}

.ai-json-viewer__pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--font-family-mono, monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.82);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
</style>
