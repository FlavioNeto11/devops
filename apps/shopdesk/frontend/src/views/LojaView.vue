<template>
  <section>
    <h1>Loja — Checkout, Nota Fiscal e Assistente</h1>
    <div class="grid">
      <div class="card">
        <h2>Checkout (pagamento)</h2>
        <form class="new" @submit.prevent="pay">
          <label>Pedido<input v-model="orderId" required /></label>
          <label>Valor (R$)<input v-model="amount" type="number" min="1" required /></label>
          <button class="btn" type="submit" :disabled="busy">Pagar</button>
        </form>
        <p v-if="payResult" class="ok">✓ {{ payResult.status }} — transação {{ payResult.transactionId }} ({{ payResult.provider }})</p>
        <p v-if="payResult" class="row">
          <button class="btn ghost" @click="invoice" :disabled="busy">Emitir Nota Fiscal</button>
          <span v-if="nf" class="ok">NF-e {{ nf.status }} · protocolo {{ nf.protocol }}</span>
        </p>
      </div>
      <div class="card">
        <h2>Assistente do lojista (IA)</h2>
        <form class="new" @submit.prevent="ask">
          <label>Pergunta / produto<input v-model="q" placeholder="Sugira um preço para..." /></label>
          <button class="btn" type="submit" :disabled="busy">Perguntar</button>
        </form>
        <p v-if="aiAnswer" class="answer">{{ aiAnswer }}</p>
        <p v-if="aiOff" class="muted">Assistente indisponível (sem chave de IA — fail-closed).</p>
      </div>
    </div>
    <p v-if="error" class="state-error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import { ref } from 'vue';
import { store } from '../api.js';
const orderId = ref('PED-' + Math.floor(Date.now() / 1000) % 100000);
const amount = ref(5000);
const q = ref('');
const busy = ref(false), error = ref(''), aiOff = ref(false);
const payResult = ref(null), nf = ref(null), aiAnswer = ref('');
async function pay() { busy.value = true; error.value = ''; nf.value = null; try { payResult.value = await store.checkout(orderId.value, amount.value); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
async function invoice() { busy.value = true; error.value = ''; try { nf.value = await store.emitInvoice(orderId.value, amount.value); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
async function ask() { if (!q.value) return; busy.value = true; error.value = ''; aiOff.value = false; aiAnswer.value = ''; try { const r = await store.assistant(q.value); aiAnswer.value = r.answer || ''; } catch (e) { if (e.status === 503) aiOff.value = true; else error.value = e.message; } finally { busy.value = false; } }
</script>
<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
.card h2 { font-size: 1.05rem; margin: 0 0 .6rem; }
.ok { color: var(--p-ok); }
.answer { white-space: pre-wrap; background: var(--p-bg); border: 1px solid var(--p-line); border-radius: 8px; padding: .8rem; margin-top: .6rem; }
.row { display: flex; gap: .8rem; align-items: center; flex-wrap: wrap; }
.btn.ghost { background: transparent; border: 1px solid var(--p-accent); }
</style>
