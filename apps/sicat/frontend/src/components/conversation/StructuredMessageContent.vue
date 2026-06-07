<script setup>
import { computed } from 'vue';

const props = defineProps({
  text: {
    type: String,
    default: ''
  }
});

const KEYWORD_HIGHLIGHTS = [
  'id',
  'manifesto',
  'numero',
  'número',
  'data',
  'status',
  'gerador',
  'transportador',
  'destinador',
  'cnpj',
  'job'
];

const FIELD_GROUPS = {
  manifesto: ['manifesto', 'mtr', 'numero', 'codigo'],
  data: ['data', 'emissao', 'created', 'criacao'],
  status: ['status', 'situacao', 'situacao externa', 'external status'],
  geradorNome: ['gerador', 'razao social gerador', 'nome gerador'],
  geradorCnpj: ['cnpj gerador', 'cnpj'],
  transportador: ['transportador', 'empresa transporte'],
  motorista: ['motorista', 'condutor'],
  placa: ['placa', 'veiculo', 'placa veiculo'],
  destinador: ['destinador', 'destino', 'receptor']
};

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function keyMatches(normalizedKey, aliases) {
  return aliases.some((alias) => normalizedKey.includes(alias));
}

function createEmptyManifestCard() {
  return {
    resumo: {
      manifesto: '',
      data: '',
      status: ''
    },
    gerador: {
      nome: '',
      cnpj: ''
    },
    transporte: {
      transportador: '',
      motorista: '',
      placa: ''
    },
    destino: {
      destinador: ''
    }
  };
}

function hasAnyCardData(card) {
  return [
    card.resumo.manifesto,
    card.resumo.data,
    card.resumo.status,
    card.gerador.nome,
    card.gerador.cnpj,
    card.transporte.transportador,
    card.transporte.motorista,
    card.transporte.placa,
    card.destino.destinador
  ].some(Boolean);
}

function hasCardEnoughData(card) {
  const fields = [
    card.resumo.manifesto,
    card.resumo.data,
    card.resumo.status,
    card.gerador.nome,
    card.gerador.cnpj,
    card.transporte.transportador,
    card.transporte.motorista,
    card.transporte.placa,
    card.destino.destinador
  ].filter(Boolean);

  return fields.length >= 2;
}

function buildManifestCards(keyFields) {
  const cards = [];
  const consumedIndexes = new Set();
  let currentCard = createEmptyManifestCard();

  keyFields.forEach((field, index) => {
    const normalizedKey = normalizeKey(field.key);
    const isManifestBoundary = keyMatches(normalizedKey, FIELD_GROUPS.manifesto);

    if (isManifestBoundary && hasAnyCardData(currentCard)) {
      cards.push(currentCard);
      currentCard = createEmptyManifestCard();
    }

    if (isManifestBoundary) {
      currentCard.resumo.manifesto = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.data)) {
      currentCard.resumo.data = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.status)) {
      currentCard.resumo.status = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.geradorCnpj)) {
      currentCard.gerador.cnpj = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.geradorNome)) {
      currentCard.gerador.nome = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.transportador)) {
      currentCard.transporte.transportador = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.motorista)) {
      currentCard.transporte.motorista = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.placa)) {
      currentCard.transporte.placa = field.value;
      consumedIndexes.add(index);
      return;
    }

    if (keyMatches(normalizedKey, FIELD_GROUPS.destinador)) {
      currentCard.destino.destinador = field.value;
      consumedIndexes.add(index);
    }
  });

  if (hasAnyCardData(currentCard)) {
    cards.push(currentCard);
  }

  const manifestCards = cards
    .filter((card) => hasCardEnoughData(card))
    .map((card, index) => ({
      id: `manifest-card-${index}`,
      ...card
    }));

  const remainingKeyFields = keyFields.filter((_, index) => !consumedIndexes.has(index));

  return {
    manifestCards,
    remainingKeyFields
  };
}

function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replaceAll(/\r\n?/g, '\n').trim();
}

function splitSegments(normalizedText) {
  const lines = normalizedText
    .split('\n')
    .flatMap((line) => {
      if (/(\w\s*:\s*.+)\s*[|;]\s*(\w\s*:\s*.+)/.test(line)) {
        return line.split(/\s*[|;]\s*/g);
      }

      return [line];
    });

  return lines.map((line) => line.trim()).filter(Boolean);
}

function parseStructuredContent(text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return {
      isStructured: false,
      plainText: '',
      paragraphs: [],
      orderedItems: [],
      bulletItems: [],
      keyFields: []
    };
  }

  const orderedItems = [];
  const bulletItems = [];
  const keyFields = [];
  const paragraphs = [];

  const segments = splitSegments(normalizedText);

  segments.forEach((segment) => {
    const orderedMatch = segment.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      orderedItems.push(orderedMatch[1].trim());
      return;
    }

    const bulletMatch = segment.match(/^(?:[-*•])\s+(.+)$/);
    if (bulletMatch) {
      bulletItems.push(bulletMatch[1].trim());
      return;
    }

    const keyValueMatch = segment.match(/^([^:]{2,34}):\s+(.+)$/);
    if (keyValueMatch) {
      const key = keyValueMatch[1].trim();
      const value = keyValueMatch[2].trim();
      keyFields.push({
        key,
        value,
        emphasized: KEYWORD_HIGHLIGHTS.some((keyword) => key.toLowerCase().includes(keyword))
      });
      return;
    }

    paragraphs.push(segment);
  });

  const { manifestCards, remainingKeyFields } = buildManifestCards(keyFields);

  const structuredSignals = orderedItems.length + bulletItems.length + keyFields.length + manifestCards.length;
  const isStructured = structuredSignals >= 2;

  return {
    isStructured,
    plainText: normalizedText,
    paragraphs,
    orderedItems,
    bulletItems,
    keyFields: remainingKeyFields,
    manifestCards
  };
}

const parsed = computed(() => parseStructuredContent(props.text));
</script>

<template>
  <p v-if="!parsed.isStructured" class="structured-message-plain">{{ parsed.plainText }}</p>

  <div v-else class="structured-message">
    <p v-for="(paragraph, index) in parsed.paragraphs" :key="`p-${index}`" class="structured-message-paragraph">
      {{ paragraph }}
    </p>

    <ol v-if="parsed.orderedItems.length" class="structured-message-list structured-message-list-ordered">
      <li v-for="(item, index) in parsed.orderedItems" :key="`ol-${index}`">{{ item }}</li>
    </ol>

    <ul v-if="parsed.bulletItems.length" class="structured-message-list structured-message-list-bullet">
      <li v-for="(item, index) in parsed.bulletItems" :key="`ul-${index}`">{{ item }}</li>
    </ul>

    <section v-if="parsed.manifestCards.length" class="manifest-card-grid" aria-label="Manifestos estruturados">
      <article
        v-for="card in parsed.manifestCards"
        :key="card.id"
        class="manifest-card"
      >
        <div class="manifest-card-section">
          <p class="manifest-card-title">Resumo</p>
          <dl class="manifest-card-fields">
            <div v-if="card.resumo.manifesto" class="manifest-card-field-row">
              <dt>Manifesto</dt>
              <dd>{{ card.resumo.manifesto }}</dd>
            </div>
            <div v-if="card.resumo.data" class="manifest-card-field-row">
              <dt>Data</dt>
              <dd>{{ card.resumo.data }}</dd>
            </div>
            <div v-if="card.resumo.status" class="manifest-card-field-row">
              <dt>Status</dt>
              <dd>{{ card.resumo.status }}</dd>
            </div>
          </dl>
        </div>

        <div v-if="card.gerador.nome || card.gerador.cnpj" class="manifest-card-section">
          <p class="manifest-card-title">Gerador</p>
          <dl class="manifest-card-fields">
            <div v-if="card.gerador.nome" class="manifest-card-field-row">
              <dt>Nome</dt>
              <dd>{{ card.gerador.nome }}</dd>
            </div>
            <div v-if="card.gerador.cnpj" class="manifest-card-field-row">
              <dt>CNPJ</dt>
              <dd>{{ card.gerador.cnpj }}</dd>
            </div>
          </dl>
        </div>

        <div v-if="card.transporte.transportador || card.transporte.motorista || card.transporte.placa" class="manifest-card-section">
          <p class="manifest-card-title">Transporte</p>
          <dl class="manifest-card-fields">
            <div v-if="card.transporte.transportador" class="manifest-card-field-row">
              <dt>Transportador</dt>
              <dd>{{ card.transporte.transportador }}</dd>
            </div>
            <div v-if="card.transporte.motorista" class="manifest-card-field-row">
              <dt>Motorista</dt>
              <dd>{{ card.transporte.motorista }}</dd>
            </div>
            <div v-if="card.transporte.placa" class="manifest-card-field-row">
              <dt>Placa</dt>
              <dd>{{ card.transporte.placa }}</dd>
            </div>
          </dl>
        </div>

        <div v-if="card.destino.destinador" class="manifest-card-section">
          <p class="manifest-card-title">Destino</p>
          <dl class="manifest-card-fields">
            <div class="manifest-card-field-row">
              <dt>Destinador</dt>
              <dd>{{ card.destino.destinador }}</dd>
            </div>
          </dl>
        </div>
      </article>
    </section>

    <dl v-if="parsed.keyFields.length" class="structured-message-fields">
      <div
        v-for="(field, index) in parsed.keyFields"
        :key="`kv-${index}`"
        class="structured-message-field-row"
      >
        <dt class="structured-message-key" :class="{ 'structured-message-key-emphasis': field.emphasized }">
          {{ field.key }}
        </dt>
        <dd class="structured-message-value">{{ field.value }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.structured-message-plain {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.structured-message {
  display: grid;
  gap: 10px;
}

.structured-message-paragraph {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.structured-message-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  line-height: 1.5;
}

.structured-message-fields {
  margin: 0;
  display: grid;
  gap: 8px;
}

.structured-message-field-row {
  display: grid;
  grid-template-columns: minmax(110px, max-content) minmax(0, 1fr);
  align-items: baseline;
  column-gap: 10px;
  row-gap: 4px;
}

.structured-message-key {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.structured-message-key-emphasis {
  color: rgba(var(--v-theme-primary), 0.94);
  font-weight: 700;
}

.structured-message-value {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.manifest-card-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.manifest-card {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 14px;
  padding: 10px 12px;
  display: grid;
  gap: 10px;
  background:
    linear-gradient(180deg, rgba(var(--v-theme-primary), 0.07), rgba(var(--v-theme-primary), 0.03)),
    rgba(var(--v-theme-surface), 0.9);
}

.manifest-card-section {
  display: grid;
  gap: 5px;
}

.manifest-card-title {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-primary), 0.86);
  font-weight: 700;
}

.manifest-card-fields {
  margin: 0;
  display: grid;
  gap: 5px;
}

.manifest-card-field-row {
  display: grid;
  grid-template-columns: minmax(90px, max-content) minmax(0, 1fr);
  align-items: baseline;
  column-gap: 8px;
  row-gap: 4px;
}

.manifest-card-field-row dt {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.manifest-card-field-row dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .structured-message-field-row {
    grid-template-columns: 1fr;
  }

  .manifest-card-grid {
    grid-template-columns: 1fr;
  }

  .manifest-card-field-row {
    grid-template-columns: 1fr;
  }
}
</style>