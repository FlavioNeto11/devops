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

                <!-- Fontes citadas (grounding) — UX-CV360-009 -->
                <div v-if="m.citations && m.citations.length" class="aiv-cites">
                  <p class="aiv-cites-title">Fontes citadas</p>
                  <ul class="aiv-cites-list">
                    <li v-for="(c, ci) in m.citations" :key="ci" class="aiv-cite">
                      <span class="aiv-cite-type">{{ c.source_type }}<template v-if="c.source_id"> #{{ c.source_id }}</template></span>
                      <span v-if="c.descricao" class="aiv-cite-desc">{{ c.descricao }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Rascunho proposto: confirmação humana antes de persistir — UX-CV360-009 -->
                <section v-if="m.draft && m.draftState !== 'descartado'" class="aiv-draft" :data-state="m.draftState" aria-label="Rascunho proposto pela IA">
                  <header class="aiv-draft-head">
                    <span class="aiv-draft-badge">Rascunho proposto</span>
                    <span class="aiv-draft-type">{{ draftTipoLabel(m.draft.tipo) }}</span>
                  </header>
                  <p class="aiv-draft-title">{{ m.draft.titulo || 'Rascunho' }}</p>

                  <dl class="aiv-draft-fields">
                    <div v-for="(row, ri) in draftRows(m.draft)" :key="ri" class="aiv-draft-row">
                      <dt>{{ row.label }}</dt>
                      <dd>{{ row.value }}</dd>
                    </div>
                  </dl>

                  <div v-if="m.draft.campos_principais" class="aiv-draft-sub">
                    <p class="aiv-draft-subtitle">Campos principais</p>
                    <dl class="aiv-draft-fields">
                      <div v-for="(v, k) in m.draft.campos_principais" :key="k" class="aiv-draft-row">
                        <dt>{{ humanize(k) }}</dt>
                        <dd>{{ v }}</dd>
                      </div>
                    </dl>
                  </div>

                  <div v-if="m.draft.por_categoria && m.draft.por_categoria.length" class="aiv-draft-sub">
                    <p class="aiv-draft-subtitle">Por categoria</p>
                    <ul class="aiv-draft-cats">
                      <li v-for="(cat, cti) in m.draft.por_categoria" :key="cti">
                        <span>{{ cat.categoria }} · {{ cat.tipo }}</span>
                        <span>{{ cat.total }}</span>
                      </li>
                    </ul>
                  </div>

                  <p v-if="m.draft.aviso" class="aiv-draft-aviso">{{ m.draft.aviso }}</p>

                  <p v-if="m.draftState === 'confirmado'" class="aiv-draft-done" role="status">✓ Rascunho confirmado e salvo.</p>
                  <div v-else class="aiv-draft-actions">
                    <UiButton variant="ghost" size="sm" :disabled="m.draftState === 'confirmando'" @click="discardDraft(m)">Descartar</UiButton>
                    <UiButton size="sm" :loading="m.draftState === 'confirmando'" @click="confirmDraftFor(m)">Confirmar rascunho</UiButton>
                  </div>
                </section>
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

    <template #footer><p>As respostas são geradas por IA e podem conter erros — confira valores e datas antes de agir. Os arquivos são processados só para responder à sua pergunta. Sem chave de IA o assistente fica desligado (fail-closed).</p></template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiButton, UiFormField, UiFileDrop, UiStatusBadge, UiEmptyState, UiLoadingState, useToast, useConfirm } from '../ui/index.js';
import { assistant, assistantHealth, confirmDraft, health as apiHealth } from '../api.js';

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
    // Preserva citations/draft/grounded devolvidos pela API (antes descartados — UX-CV360-009):
    // fontes viram lista de referências e o draft vira um cartão "Rascunho proposto" com
    // Confirmar/Descartar (loop de confirmação humana, mecanismo de segurança da IA).
    messages.value.push({
      id: ++mid,
      role: 'assistant',
      text: (r && (r.answer || r.text)) || 'Sem resposta.',
      files: (r && r.files) || [],
      citations: (r && r.citations) || [],
      draft: (r && r.draft) || null,
      draftState: 'proposto', // proposto | confirmando | confirmado | descartado
      grounded: !!(r && r.grounded),
      conversationId: (r && r.conversation_id) || null,
    });
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

// --- Rascunho proposto pela IA + fontes (UX-CV360-009) ---
const DRAFT_TIPO_LABEL = {
  declaracao_irpf: 'Declaração IRPF',
  guia_pagamento: 'Guia de pagamento',
  analise_contabil: 'Análise contábil',
  relatorio_receitas_despesas: 'Relatório de receitas e despesas',
};
// Campos tratados à parte (título/aviso) ou renderizados em blocos próprios (campos_principais,
// por_categoria); o resto dos primitivos vira uma lista rótulo -> valor.
const DRAFT_HIDE = new Set(['draft_id', 'tipo', 'status', 'titulo', 'aviso', 'campos_principais', 'por_categoria']);
function draftTipoLabel(t) { return DRAFT_TIPO_LABEL[t] || 'Rascunho'; }
function humanize(k) { return String(k || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
function draftRows(d) {
  return Object.entries(d || {})
    .filter(([k, v]) => !DRAFT_HIDE.has(k) && (typeof v === 'string' || typeof v === 'number'))
    .map(([k, v]) => ({ label: humanize(k), value: String(v) }));
}

async function confirmDraftFor(m) {
  if (!m || !m.draft || m.draftState === 'confirmando' || m.draftState === 'confirmado') return;
  m.draftState = 'confirmando';
  try {
    await confirmDraft({ draftId: m.draft.draft_id, draftType: m.draft.tipo, draftData: m.draft, conversationId: m.conversationId });
    m.draftState = 'confirmado';
    toast.success('Rascunho confirmado e salvo.');
  } catch (e) {
    m.draftState = 'proposto';
    toast.error(e && e.message ? e.message : 'Não foi possível confirmar o rascunho. Tente novamente.');
  }
}
function discardDraft(m) { if (m) m.draftState = 'descartado'; }

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

/* Fontes citadas (UX-CV360-009) */
.aiv-cites { margin-top: var(--ui-space-3); padding-top: var(--ui-space-2); border-top: 1px dashed rgb(var(--ui-border)); }
.aiv-cites-title { margin: 0 0 var(--ui-space-1); font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .05em; }
.aiv-cites-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.aiv-cite { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.aiv-cite-type { font-weight: 600; color: rgb(var(--ui-accent-strong)); }
.aiv-cite-desc { color: rgb(var(--ui-muted)); }

/* Cartão "Rascunho proposto" — loop de confirmação humana (UX-CV360-009) */
.aiv-draft { margin-top: var(--ui-space-3); border: 1px solid rgb(var(--ui-accent) / 0.35); border-radius: var(--ui-radius-md); background: rgb(var(--ui-accent) / 0.06); padding: var(--ui-space-3) var(--ui-space-4); }
.aiv-draft[data-state="confirmado"] { border-color: rgb(var(--ui-ok) / 0.45); background: rgb(var(--ui-ok) / 0.08); }
.aiv-draft-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.aiv-draft-badge { font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-accent-fg)); background: rgb(var(--ui-accent)); border-radius: var(--ui-radius-pill); padding: 2px 10px; }
.aiv-draft-type { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.aiv-draft-title { margin: var(--ui-space-2) 0; font-weight: 700; color: rgb(var(--ui-fg)); }
.aiv-draft-fields { margin: 0; display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 4px var(--ui-space-3); }
.aiv-draft-row { display: contents; }
.aiv-draft-fields dt { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.aiv-draft-fields dd { margin: 0; font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-fg)); }
.aiv-draft-sub { margin-top: var(--ui-space-3); }
.aiv-draft-subtitle { margin: 0 0 var(--ui-space-1); font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .05em; }
.aiv-draft-cats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.aiv-draft-cats li { display: flex; justify-content: space-between; gap: var(--ui-space-3); font-size: var(--ui-text-sm); }
.aiv-draft-aviso { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-warn)); }
.aiv-draft-done { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-ok)); }
.aiv-draft-actions { margin-top: var(--ui-space-3); display: flex; justify-content: flex-end; gap: var(--ui-space-2); }

@media (max-width: 560px) { .aiv-msg-body { max-width: 92%; } .aiv-composer-actions { flex-direction: column; align-items: stretch; } }
</style>
