<script setup>
import { nextTick, ref, useId, watch } from 'vue';

const props = defineProps({ title: String, open: Boolean });
const emit = defineEmits(['close']);

const titleId = useId();
const card = ref(null);
let lastActive = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
}

function initialTarget() {
  const body = card.value?.querySelector('.md-body');
  const inBody = focusables(body);
  if (inBody.length) return inBody[0];
  return focusables(card.value)[0] || card.value;
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close'); return; }
  if (e.key !== 'Tab') return;
  const f = focusables(card.value);
  if (!f.length) { e.preventDefault(); card.value?.focus(); return; }
  const first = f[0];
  const last = f[f.length - 1];
  const active = document.activeElement;
  const outside = !card.value.contains(active);
  if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    lastActive = document.activeElement;
    nextTick(() => { initialTarget()?.focus(); });
  } else if (lastActive) {
    lastActive.focus?.();
    lastActive = null;
  }
});
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="md-overlay" @click.self="emit('close')">
      <div
        ref="card"
        class="md-card"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="md-head">
          <h3 :id="titleId">{{ title }}</h3>
          <button class="md-x" @click="emit('close')" aria-label="fechar">✕</button>
        </div>
        <div class="md-body"><slot /></div>
        <div v-if="$slots.footer" class="md-foot"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.md-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: flex-start; justify-content: center; padding: 6vh 16px; z-index: 60; backdrop-filter: blur(3px); overflow-y: auto; }
.md-card { width: 100%; max-width: 560px; background: var(--im-surface); border: 1px solid var(--im-border); border-radius: 16px; box-shadow: var(--im-shadow); }
.md-card:focus { outline: none; }
.md-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--im-border); }
.md-head h3 { margin: 0; font-size: 17px; }
.md-x { background: none; border: none; color: var(--im-muted); font-size: 16px; cursor: pointer; }
.md-x:hover { color: var(--im-text); }
.md-x:focus-visible { outline: 2px solid var(--im-accent); outline-offset: 2px; border-radius: 6px; }
.md-body { padding: 20px; }
.md-foot { padding: 14px 20px; border-top: 1px solid var(--im-border); display: flex; justify-content: flex-end; gap: 10px; }
</style>
