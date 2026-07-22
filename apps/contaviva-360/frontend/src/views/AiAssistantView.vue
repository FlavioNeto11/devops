<!--
  AiAssistantView — Assistente de IA do ContaViva 360 (bloco control-ai-por-app).
  Pergunte por texto E/OU anexe arquivos (PDF, imagem, planilha, doc, csv, zip): a IA ingere o
  conteúdo (multimodal) e raciocina sobre ele. Fail-closed sem chave (banner "desligado"); fail-soft
  na ingestão (arquivo ilegível não derruba a conversa). Usa SÓ o kit ui-vue e tokens --ui-*.
-->
<template>
  <UiPageLayout eyebrow="ContaViva 360 · IA" title="Assistente" subtitle="Pergunte e, se quiser, anexe arquivos para a IA analisar." width="wide">
    <template #actions>
      <UiStatusBadge :tone="health === 'online' ? 'success' : (health === 'offline' ? 'neutral' : 'warning')" :label="healthLabel" size="sm" />
      <UiButton variant="ghost" size="sm" :disabled="!messages.length" @click="clearAll">Limpar</UiButton>
    </template>

    <!-- fail-closed: IA desligada -->
    <UiCard v-if="health === 'offline'">
      <UiEmptyState icon="🔌" title="Assistente desligado" description="Esta instalação está sem o provedor de IA (fail-closed). Configure a chave para habilitar.">
        <template #action><UiButton variant="ghost" @click="checkHealth">Verificar novamente</UiButton></template>
      </UiEmptyState>
    </UiCard>

    <div v-else class="aiv-grid">
      <UiCard class="aiv-chat" title="Conversa">
        <div ref="logEl" class="aiv-log" role="log" aria-live="polite" aria-label="Conversa com o assistente">
          <UiEmptyState v-if="!messages.length && !thinking" icon="✨" title="Como posso ajudar?" description="Escreva uma pergunta. Anexe arquivos abaixo para a IA analisar o conteúdo." />
          <article v-for="m in messages" :key="m.id" class="aiv-msg" :data-role="m.role">
            <span class="aiv-msg-av" aria-hidden="true">{{ m.role === 'user' ? '🧑' : '🤖' }}</span>
            <div class="aiv-msg-body">
              <p class="aiv-msg-author">{{ m.role === 'user' ? 'Você' : 'Assistente' }}</p>
              <div v-if="m.error" class="aiv-msg-error" role="alert"><p>{{ m.error }}</p></div>
              <template v-else>
                <p v-for="(p, pi) in paras(m.text)" :key="pi" class="aiv-msg-text">{{ p }}</p>
                <ul v-if="m.files && m.files.length" class="aiv-files">
                  <li v-for="(f, fi) in m.files" :key="fi" class="aiv-file" :data-status="f.status">
                    <span class="aiv-file-name">{{ f.path }}</span>
                    <span class="aiv-file-meta">{{ f.type }} · {{ f.status }}</span>
                  </li>
                </ul>
              </template>
            </div>
          </article>
          <article v-if="thinking" class="aiv-msg" data-role="assistant">
            <span class="aiv-msg-av" aria-hidden="true">🤖</span>
            <div class="aiv-msg-body"><p class="aiv-msg-author">Assistente</p><UiLoadingState title="Pensando…" /></div>
          </article>
        </div>

        <form class="aiv-composer" @submit.prevent="onAsk">
          <UiFormField label="Sua pergunta" :error="formError">
            <template #default="{ id, describedBy }">
              <textarea :id="id" v-model="question" class="aiv-textarea" rows="2" :aria-describedby="describedBy" :disabled="thinking || health !== 'online'" placeholder="Ex.: Resuma o documento anexado." @keydown="onKey"></textarea>
            </template>
          </UiFormField>
          <UiFileDrop v-model="files" :disabled="thinking || health !== 'online'" hint="PDF, imagem, planilha, doc, csv ou zip — a IA analisa o conteúdo." />
          <div class="aiv-composer-actions">
            <p class="aiv-hint ui-muted">Enter envia · Shift+Enter quebra linha</p>
            <UiButton type="submit" :loading="thinking" :disabled="!canSend">Perguntar</UiButton>
          </div>
        </form>
      </UiCard>
    </div>

    <template #footer><p>Os arquivos são processados só para responder à sua pergunta. Sem chave de IA o assistente fica desligado (fail-closed).</p></template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiButton, UiFormField, UiFileDrop, UiStatusBadge, UiEmptyState, UiLoadingState, useToast, useConfirm } from '../ui/index.js';
import { assistant, assistantHealth, health as apiHealth } from '../api.js';

const toast = useToast();
const confirm = useConfirm();
const health = ref('checking'); // checking | online | offline | error
const healthLabel = computed(() => ({ checking: 'Verificando…', online: 'IA no ar', offline: 'IA desligada', error: 'IA com erro' }[health.value] || 'IA'));
const messages = ref([]);
let mid = 0;
const thinking = ref(false);
const question = ref('');
const files = ref([]);
const formError = ref(null);
const logEl = ref(null);

const canSend = computed(() => (question.value.trim().length > 0 || files.value.length > 0) && !thinking.value && health.value === 'online');

function paras(t) { return String(t || '').split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean); }
async function scrollEnd() { await nextTick(); if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; }

async function checkHealth() {
  health.value = 'checking';
  try {
    const r = await assistantHealth();
    health.value = r && r.ai ? 'online' : 'offline';
  } catch (e) {
    if (e && e.status === 503) { health.value = 'offline'; return; }
    try { await apiHealth(); health.value = 'error'; } catch { health.value = 'error'; }
  }
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAsk(); } }

async function onAsk() {
  const q = question.value.trim();
  const fl = files.value.slice();
  if (!q && !fl.length) { formError.value = 'Escreva uma pergunta ou anexe um arquivo.'; return; }
  if (health.value !== 'online') { formError.value = 'O assistente está indisponível.'; return; }
  formError.value = null;
  const label = q || ('(' + fl.length + ' arquivo' + (fl.length > 1 ? 's' : '') + ' anexado' + (fl.length > 1 ? 's' : '') + ')');
  messages.value.push({ id: ++mid, role: 'user', text: label });
  question.value = ''; files.value = [];
  thinking.value = true; scrollEnd();
  try {
    const r = await assistant(q, fl);
    messages.value.push({ id: ++mid, role: 'assistant', text: (r && (r.answer || r.text)) || 'Sem resposta.', files: (r && r.files) || [] });
  } catch (e) {
    if (e && e.status === 503) health.value = 'offline';
    messages.value.push({ id: ++mid, role: 'assistant', error: errMsg(e) });
    toast.error('Não foi possível responder.');
  } finally {
    thinking.value = false; scrollEnd();
  }
}

function errMsg(e) {
  if (!e) return 'Erro desconhecido.';
  if (e.status === 503) return 'Assistente indisponível (fail-closed). Configure o provedor de IA.';
  if (e.status === 413) return 'Arquivo grande demais para enviar.';
  return e.message || 'Falha ao falar com o assistente.';
}

async function clearAll() {
  if (!messages.value.length) return;
  const ok = await confirm({ title: 'Apagar conversa', message: 'Apagar toda a conversa e as análises de anexos? Isso não pode ser desfeito.', confirmLabel: 'Apagar', danger: true });
  if (ok) messages.value = [];
}

onMounted(checkHealth);
</script>

<style scoped>
.aiv-grid { display: grid; gap: var(--ui-space-4); }
.aiv-chat :deep(.ui-card-body) { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.aiv-log { display: flex; flex-direction: column; gap: var(--ui-space-4); max-height: 52vh; min-height: 220px; overflow-y: auto; padding-right: var(--ui-space-2); }
.aiv-msg { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.aiv-msg[data-role="user"] { flex-direction: row-reverse; }
.aiv-msg-av { flex-shrink: 0; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); }
.aiv-msg-body { max-width: 84%; background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); padding: var(--ui-space-3) var(--ui-space-4); }
.aiv-msg[data-role="user"] .aiv-msg-body { background: rgb(var(--ui-accent) / 0.10); border-color: rgb(var(--ui-accent) / 0.30); }
.aiv-msg-author { margin: 0 0 var(--ui-space-2); font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .05em; }
.aiv-msg-text { margin: 0 0 var(--ui-space-2); }
.aiv-msg-text:last-child { margin-bottom: 0; }
.aiv-msg-error { color: rgb(var(--ui-danger)); }
.aiv-files { list-style: none; margin: var(--ui-space-2) 0 0; padding: var(--ui-space-2) 0 0; border-top: 1px dashed rgb(var(--ui-border)); display: flex; flex-direction: column; gap: 4px; }
.aiv-file { display: flex; justify-content: space-between; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.aiv-file-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aiv-file-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); flex-shrink: 0; }
.aiv-file[data-status="error"] .aiv-file-meta { color: rgb(var(--ui-danger)); }
.aiv-composer { display: flex; flex-direction: column; gap: var(--ui-space-3); border-top: 1px solid rgb(var(--ui-border)); padding-top: var(--ui-space-4); }
.aiv-textarea { width: 100%; background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-sm); padding: 8px 11px; font: inherit; resize: vertical; min-height: 56px; }
.aiv-textarea:disabled { opacity: .6; cursor: not-allowed; }
.aiv-composer-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.aiv-hint { margin: 0; font-size: var(--ui-text-xs); }
@media (max-width: 560px) { .aiv-msg-body { max-width: 92%; } .aiv-composer-actions { flex-direction: column; align-items: stretch; } }
</style>
