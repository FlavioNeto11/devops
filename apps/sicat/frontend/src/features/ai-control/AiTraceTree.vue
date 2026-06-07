<script setup>
/**
 * Componente recursivo que renderiza a árvore de um trace (Langfuse ou fallback
 * local). Cada nó mostra nome/tipo/status/durationMs/tokens/cost, indentado por
 * nível, e renderiza recursivamente os filhos (children/nodes/observations).
 */
defineProps({
  nodes: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 }
});

function childrenOf(node) {
  return node?.children || node?.nodes || node?.observations || [];
}

function statusColor(status) {
  const key = String(status || '').toLowerCase();
  if (key.includes('error') || key.includes('fail')) return 'error';
  if (key.includes('warn')) return 'warning';
  if (key.includes('success') || key.includes('ok') || key.includes('complete')) return 'success';
  return undefined;
}

function typeIcon(type) {
  const key = String(type || '').toLowerCase();
  if (key.includes('generation') || key.includes('llm')) return 'mdi-robot-outline';
  if (key.includes('tool')) return 'mdi-tools';
  if (key.includes('span')) return 'mdi-ray-start-arrow';
  if (key.includes('event')) return 'mdi-circle-medium';
  return 'mdi-source-branch';
}

function formatNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('pt-BR');
}

function formatMoney(value) {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
}
</script>

<template>
  <div class="ai-trace-tree">
    <div
      v-for="(node, index) in nodes"
      :key="node.id || node.name || index"
      class="ai-trace-tree__node"
    >
      <div class="ai-trace-tree__row" :style="{ paddingLeft: `${depth * 18}px` }">
        <v-icon size="16" class="ai-trace-tree__icon">{{ typeIcon(node.type || node.observationType) }}</v-icon>
        <span class="ai-trace-tree__name">{{ node.name || node.type || 'nó' }}</span>
        <v-chip v-if="node.type || node.observationType" size="x-small" variant="tonal" class="ml-1">
          {{ node.type || node.observationType }}
        </v-chip>
        <v-chip
          v-if="node.status || node.level"
          :color="statusColor(node.status || node.level)"
          size="x-small"
          variant="tonal"
          class="ml-1"
        >
          {{ node.status || node.level }}
        </v-chip>
        <span class="ai-trace-tree__meta">
          <span v-if="node.durationMs != null || node.latencyMs != null">{{ formatNumber(node.durationMs ?? node.latencyMs) }} ms</span>
          <span v-if="(node.tokens ?? node.totalTokens) != null" class="ml-2">{{ formatNumber(node.tokens ?? node.totalTokens) }} tok</span>
          <span v-if="(node.cost ?? node.costUsd ?? node.totalCost) != null" class="ml-2">{{ formatMoney(node.cost ?? node.costUsd ?? node.totalCost) }}</span>
        </span>
      </div>

      <AiTraceTree
        v-if="childrenOf(node).length"
        :nodes="childrenOf(node)"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.ai-trace-tree {
  display: flex;
  flex-direction: column;
}

.ai-trace-tree__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
  flex-wrap: wrap;
}

.ai-trace-tree__icon {
  color: rgba(var(--v-theme-primary), 0.7);
}

.ai-trace-tree__name {
  font-weight: 600;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.88);
}

.ai-trace-tree__meta {
  margin-left: auto;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
  white-space: nowrap;
}
</style>
