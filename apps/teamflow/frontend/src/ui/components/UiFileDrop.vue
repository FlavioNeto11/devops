<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <div class="ui-filedrop" :data-disabled="disabled ? 'true' : null">
    <button type="button" class="ui-filedrop-zone" :data-over="over ? 'true' : 'false'" :disabled="disabled"
            :aria-label="label || 'Enviar arquivos'"
            @click="open" @dragover.prevent="over = true" @dragleave.prevent="over = false" @drop.prevent="onDrop">
      <span class="ui-filedrop-icon" aria-hidden="true">⬆</span>
      <span class="ui-filedrop-label">{{ label || 'Arraste arquivos aqui ou clique para escolher' }}</span>
      <span v-if="hint" class="ui-filedrop-hint">{{ hint }}</span>
    </button>
    <input ref="input" class="ui-filedrop-input" type="file" :accept="accept" :multiple="multiple"
           tabindex="-1" aria-hidden="true" @change="onPick" />
    <ul v-if="files.length" class="ui-filedrop-list">
      <li v-for="(f, i) in files" :key="i" class="ui-filedrop-item">
        <span class="ui-filedrop-name">{{ f.name }}</span>
        <span class="ui-filedrop-size">{{ fmt(f.size) }}</span>
        <button type="button" class="ui-filedrop-remove" :aria-label="`Remover ${f.name}`" @click="removeAt(i)">×</button>
      </li>
    </ul>
  </div>
</template>
<script setup>
// UiFileDrop — seletor de arquivos com drag & drop, brand-agnostic (--ui-*) e CSP-safe
// (sem estilo inline, sem HTML cru). v-model = File[]. Acompanha o padrão de entrada multimodal
// da plataforma (@flavioneto11/file-ingest-kit faz a ingestão no backend).
import { ref, computed } from 'vue';
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  accept: { type: String, default: '.md,.txt,.csv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*' },
  multiple: { type: Boolean, default: true },
  maxFiles: { type: Number, default: 20 },
  disabled: Boolean,
  label: String,
  hint: String,
});
const emit = defineEmits(['update:modelValue', 'change']);
const input = ref(null);
const over = ref(false);
const files = computed(() => props.modelValue || []);
function open() { if (!props.disabled && input.value) input.value.click(); }
function commit(list) {
  let next = props.multiple ? [...files.value, ...list] : list.slice(0, 1);
  if (next.length > props.maxFiles) next = next.slice(0, props.maxFiles);
  emit('update:modelValue', next);
  emit('change', next);
}
function onPick(e) { commit(Array.from(e.target.files || [])); e.target.value = ''; }
function onDrop(e) { over.value = false; if (props.disabled) return; commit(Array.from((e.dataTransfer && e.dataTransfer.files) || [])); }
function removeAt(i) { const next = files.value.slice(); next.splice(i, 1); emit('update:modelValue', next); emit('change', next); }
function fmt(n) { if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`; return `${(n / 1048576).toFixed(1)} MB`; }
</script>
<style scoped>
.ui-filedrop { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ui-filedrop-input { display: none; }
.ui-filedrop-zone { display: flex; flex-direction: column; align-items: center; gap: var(--ui-space-1); width: 100%; padding: var(--ui-space-5) var(--ui-space-4); border: 1px dashed rgb(var(--ui-border)); border-radius: var(--ui-radius); background: rgb(var(--ui-surface)); color: rgb(var(--ui-muted)); cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.ui-filedrop-zone[data-over="true"] { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / .06); color: rgb(var(--ui-fg)); }
.ui-filedrop-zone:disabled { opacity: .5; cursor: not-allowed; }
.ui-filedrop-icon { font-size: 1.5rem; line-height: 1; }
.ui-filedrop-label { font-weight: 600; color: rgb(var(--ui-fg)); }
.ui-filedrop-hint { font-size: var(--ui-text-xs); text-align: center; max-width: 46ch; }
.ui-filedrop-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-1); }
.ui-filedrop-item { display: flex; align-items: center; gap: var(--ui-space-2); padding: var(--ui-space-1) var(--ui-space-2); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius); background: rgb(var(--ui-surface)); font-size: var(--ui-text-sm); }
.ui-filedrop-name { flex: 1; color: rgb(var(--ui-fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-filedrop-size { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.ui-filedrop-remove { border: none; background: none; color: rgb(var(--ui-muted)); cursor: pointer; font-size: 1.1rem; line-height: 1; padding: 0 var(--ui-space-1); }
.ui-filedrop-remove:hover { color: rgb(var(--ui-fg)); }
</style>
