<script setup>
defineProps({ title: String, open: Boolean });
const emit = defineEmits(['close']);
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="md-overlay" @click.self="emit('close')">
      <div class="md-card">
        <div class="md-head">
          <h3>{{ title }}</h3>
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
.md-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--im-border); }
.md-head h3 { margin: 0; font-size: 17px; }
.md-x { background: none; border: none; color: var(--im-muted); font-size: 16px; cursor: pointer; }
.md-x:hover { color: var(--im-text); }
.md-body { padding: 20px; }
.md-foot { padding: 14px 20px; border-top: 1px solid var(--im-border); display: flex; justify-content: flex-end; gap: 10px; }
</style>
