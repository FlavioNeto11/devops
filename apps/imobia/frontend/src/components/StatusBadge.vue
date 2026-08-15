<script setup>
import { STATUS_TONE, statusLabel } from '../utils/format';
defineProps({ status: String });
</script>
<template>
  <span class="st-badge" :class="`tone-${STATUS_TONE[status] || 'muted'}`">{{ statusLabel(status) }}</span>
</template>
<style scoped>
.st-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid transparent; }
.st-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.tone-green { color: var(--im-accent-2); background: rgba(52,211,153,0.13); }
.tone-amber { color: var(--im-accent); background: rgba(240,180,41,0.14); }
.tone-blue { color: var(--im-accent-3); background: rgba(56,189,248,0.13); }
.tone-danger { color: var(--im-danger); background: rgba(248,113,113,0.13); }
.tone-muted { color: var(--im-muted); background: rgba(147,168,173,0.12); }
</style>
