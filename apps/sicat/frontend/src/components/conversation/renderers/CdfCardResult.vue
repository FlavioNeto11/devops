<script setup>
import { computed } from 'vue';
import { asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
});

const criteria = computed(() => asRecord(props.data?.suggestedCertificateCriteria));
const sourceManifest = computed(() => asRecord(props.data?.sourceManifest));
</script>

<template>
  <article class="result-card" aria-label="cdf_card">
    <header class="result-card-header">
      <v-icon size="16">mdi-certificate-outline</v-icon>
      <h4>CDF Sugerido</h4>
    </header>

    <dl class="result-card-grid">
      <div class="result-row" v-if="toNullableText(sourceManifest.manifestNumber || sourceManifest.manifestId)">
        <dt>Manifesto</dt>
        <dd>{{ sourceManifest.manifestNumber || sourceManifest.manifestId }}</dd>
      </div>
      <div class="result-row" v-if="toNullableText(criteria.certificateHashCode)">
        <dt>Hash CDF</dt>
        <dd>{{ criteria.certificateHashCode }}</dd>
      </div>
      <div class="result-row" v-if="toNullableText(criteria.dateFrom)">
        <dt>Data ini</dt>
        <dd>{{ criteria.dateFrom }}</dd>
      </div>
      <div class="result-row" v-if="toNullableText(criteria.dateTo)">
        <dt>Data fim</dt>
        <dd>{{ criteria.dateTo }}</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-info), 0.24);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-info), 0.05);
}

.result-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.result-card-header h4 {
  margin: 0;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.result-card-grid {
  margin: 0;
  display: grid;
  gap: 6px;
}

.result-row {
  display: grid;
  grid-template-columns: minmax(86px, max-content) minmax(0, 1fr);
  gap: 8px;
}

.result-row dt {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.result-row dd {
  margin: 0;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
</style>
