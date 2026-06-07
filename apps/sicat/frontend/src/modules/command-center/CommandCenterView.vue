<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { buildCommandRegistry } from './commandRegistry.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatSearchInput from '../../components/sicat/SicatSearchInput.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';

const router = useRouter();
const registry = buildCommandRegistry({ router });
const notify = useNotification();

const query = ref('');
const correlationId = ref('');

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase();
  if (!term) return registry;
  return registry.filter((cmd) => {
    const haystack = [
      cmd.title,
      cmd.description,
      ...(Array.isArray(cmd.keywords) ? cmd.keywords : [])
    ].join(' ').toLowerCase();
    return haystack.includes(term);
  });
});

async function execute(cmd) {
  try {
    await cmd.resolve(router, { correlationId: correlationId.value.trim() });
    notify.success(`Comando executado: ${cmd.title}`);
  } catch (err) {
    notify.error(err?.message || 'Falha ao executar comando.');
  }
}
</script>

<template>
  <SicatPageLayout width="narrow">
    <template #header>
      <SicatPageHeader
        title="Command Center"
        description="Command palette operacional. Sem IA — registry declarativo de ações."
      />
    </template>

    <template #filters>
      <SicatCard>
        <div class="cmd-filters">
          <SicatSearchInput v-model="query" placeholder="Buscar comando: jobs em erro, auditoria, CDF…" />
          <v-text-field
            v-model="correlationId"
            label="Correlation ID (opcional)"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
        </div>
      </SicatCard>
    </template>

    <SicatCard flush-body>
      <v-list v-if="filtered.length" lines="two">
        <v-list-item v-for="cmd in filtered" :key="cmd.id" @click="execute(cmd)">
          <template #prepend>
            <v-icon color="primary">mdi-flash-outline</v-icon>
          </template>
          <v-list-item-title>{{ cmd.title }}</v-list-item-title>
          <v-list-item-subtitle>{{ cmd.description }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <SicatEmptyState
        v-else
        compact
        :title="`Nenhum comando encontrado para “${query}”`"
        icon="mdi-flash-off-outline"
      />
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.cmd-filters {
  display: grid;
  gap: var(--space-3);
}
</style>
