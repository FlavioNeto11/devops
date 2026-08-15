<template>
  <Teleport to="body">
    <div v-if="open" class="ui-modal-backdrop" @click.self="onBackdrop">
      <div ref="dialog" class="ui-modal" :data-width="width" role="dialog" aria-modal="true" :aria-label="title || 'Diálogo'" tabindex="-1" @keydown.esc="onEsc" @keydown.tab="onTab">
        <header class="ui-modal-head">
          <h2 class="ui-modal-title">{{ title }}</h2>
          <button class="ui-modal-x" aria-label="Fechar" @click="close">✕</button>
        </header>
        <div class="ui-modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-modal-foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  width: { type: String, default: 'md' }, // sm | md | lg
  persistent: Boolean,
});
const emit = defineEmits(['update:open', 'close']);
const dialog = ref(null);
let lastFocus = null;

function close() { emit('update:open', false); emit('close'); }
function onBackdrop() { if (!props.persistent) close(); }
function onEsc() { if (!props.persistent) close(); }
// focus trap: Tab circula dentro do diálogo (aria-modal sozinho não segura o foco).
function onTab(e) {
  const root = dialog.value; if (!root) return;
  const all = root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  // só focáveis VISÍVEIS (v-show/hidden fariam o ciclo apontar para um alvo infocável)
  const els = [...all].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!els.length) { e.preventDefault(); return; }
  const first = els[0], last = els[els.length - 1], active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

watch(() => props.open, async (v) => {
  if (typeof document === 'undefined') return;
  if (v) {
    lastFocus = document.activeElement;
    document.body.classList.add('ui-modal-lock');
    await nextTick();
    if (dialog.value) dialog.value.focus();
  } else {
    document.body.classList.remove('ui-modal-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
});
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.body.classList.remove('ui-modal-lock'); });
</script>
<style scoped>
.ui-modal-backdrop { position: fixed; inset: 0; z-index: var(--ui-z-modal); background: rgb(2 6 23 / 0.55); display: flex; align-items: center; justify-content: center; padding: var(--ui-space-4); }
.ui-modal { width: 100%; background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-lg); box-shadow: var(--ui-shadow-lg); display: flex; flex-direction: column; max-height: 90vh; }
.ui-modal[data-width="sm"] { max-width: 420px; }
.ui-modal[data-width="md"] { max-width: 600px; }
.ui-modal[data-width="lg"] { max-width: 880px; }
.ui-modal-head { display: flex; align-items: center; justify-content: space-between; padding: var(--ui-space-4) var(--ui-space-5); border-bottom: 1px solid rgb(var(--ui-border)); }
.ui-modal-title { font-size: var(--ui-text-lg); }
.ui-modal-x { background: none; border: none; color: rgb(var(--ui-muted)); font-size: 1.1rem; cursor: pointer; padding: 4px 8px; border-radius: var(--ui-radius-sm); }
.ui-modal-x:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.ui-modal-body { padding: var(--ui-space-5); overflow-y: auto; }
.ui-modal-foot { display: flex; justify-content: flex-end; gap: var(--ui-space-2); padding: var(--ui-space-3) var(--ui-space-5); border-top: 1px solid rgb(var(--ui-border)); }
</style>
