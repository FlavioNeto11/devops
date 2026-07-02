<script setup>
import { nextTick, onMounted, ref } from 'vue';
import Icon from '../../components/Icon.vue';
import { api } from '../../api';

const status = ref(null);
const messages = ref([]); // {role:'user'|'assistant', text, route?}
const input = ref('');
const streaming = ref(false);
const bodyEl = ref(null);

onMounted(async () => { try { status.value = await api.aiStatus(); } catch { /* noop */ } });

async function scrollDown() { await nextTick(); if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight; }

function send() {
  const q = input.value.trim();
  if (!q || streaming.value) return;
  messages.value.push({ role: 'user', text: q });
  input.value = '';
  const idx = messages.value.push({ role: 'assistant', text: '', route: null }) - 1;
  streaming.value = true;
  scrollDown();

  const es = new EventSource(api.aiStreamUrl(q));
  es.addEventListener('route', (e) => {
    const d = JSON.parse(e.data);
    messages.value[idx].route = d;
    scrollDown();
  });
  es.addEventListener('delta', (e) => {
    const d = JSON.parse(e.data);
    messages.value[idx].text += d.text;
    scrollDown();
  });
  es.addEventListener('done', (e) => {
    const d = JSON.parse(e.data);
    messages.value[idx].meta = d;
    streaming.value = false;
    es.close();
    scrollDown();
  });
  es.addEventListener('error', () => {
    if (!messages.value[idx].text) messages.value[idx].text = '(falha na conexão com o assistente)';
    streaming.value = false;
    es.close();
  });
}

const suggestions = [
  'Qualifique um lead com renda de R$ 8.000 querendo apê de 2 quartos até R$ 450 mil.',
  'Redija um lembrete gentil de visita para amanhã às 15h.',
  'Como você lê um relatório do Serasa para o Corbam?',
];
</script>

<template>
  <div class="ap-page chat-page">
    <div class="ap-page-head">
      <h1><Icon name="spark" :size="22" /> Assistente IA</h1>
      <p>Uma orquestra de modelos: o <b>Cortex</b> tria e encaminha para <b>GPT</b> (lógica), <b>Claude</b> (redação) ou <b>Gemini</b> (documentos/visão).</p>
    </div>

    <div v-if="status?.dormant" class="im-notice" style="margin-bottom: 14px">
      ⚠️ IA dormente — nenhuma chave de provedor configurada. O assistente responde explicando como ativar; os módulos seguem funcionando manualmente.
    </div>

    <div class="chat-box">
      <div class="chat-body" ref="bodyEl">
        <div v-if="!messages.length" class="chat-empty">
          <p>Faça uma pergunta ou experimente:</p>
          <button v-for="s in suggestions" :key="s" class="chat-suggest" @click="input = s; send()">{{ s }}</button>
        </div>
        <div v-for="(m, i) in messages" :key="i" class="chat-msg" :class="m.role">
          <div class="chat-role">
            <template v-if="m.role === 'assistant'">
              <span v-if="m.route && !m.route.dormant" class="chat-route" :class="`tag-${m.route.actor}`">{{ m.route.actor }} · {{ m.route.model }}</span>
              <span v-else class="chat-route">assistente</span>
            </template>
            <template v-else>você</template>
          </div>
          <div class="chat-bubble">{{ m.text }}<span v-if="m.role === 'assistant' && streaming && i === messages.length - 1" class="chat-caret">▋</span></div>
          <div v-if="m.meta && !m.meta.dormant" class="chat-meta">{{ m.meta.usage?.inputTokens || 0 }}+{{ m.meta.usage?.outputTokens || 0 }} tok · ${{ (m.meta.costUsd || 0).toFixed(5) }} · {{ m.meta.latencyMs }}ms</div>
        </div>
      </div>
      <form class="chat-input" @submit.prevent="send">
        <input v-model="input" :disabled="streaming" placeholder="Escreva para a orquestra de IAs…" />
        <button type="submit" :disabled="streaming || !input.trim()"><Icon name="spark" :size="16" /></button>
      </form>
    </div>
  </div>
</template>
