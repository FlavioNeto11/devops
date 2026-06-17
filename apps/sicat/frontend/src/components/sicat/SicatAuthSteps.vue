<script setup>
/**
 * SicatAuthSteps — guia visual amigável das DUAS etapas de acesso:
 *   1) Entrar no SICAT   2) Conectar sua conta da CETESB
 * Mostrado nas duas telas de login para o operador leigo entender que são
 * dois acessos diferentes e em qual está. `current` = 1 ou 2.
 */
defineProps({
  current: { type: Number, default: 1 }
});

const STEPS = [
  { n: 1, title: 'Entrar no SICAT', desc: 'Seu acesso a este sistema' },
  { n: 2, title: 'Conectar sua conta da CETESB', desc: 'Para enviar o manifesto por você' }
];
</script>

<template>
  <ol class="sicat-auth-steps" aria-label="Etapas de acesso">
    <li
      v-for="s in STEPS"
      :key="s.n"
      class="sicat-auth-steps__item"
      :data-state="current === s.n ? 'current' : current > s.n ? 'done' : 'todo'"
      :aria-current="current === s.n ? 'step' : undefined"
    >
      <span class="sicat-auth-steps__num">
        <v-icon v-if="current > s.n" icon="mdi-check" size="18" aria-hidden="true" />
        <template v-else>{{ s.n }}</template>
      </span>
      <span class="sicat-auth-steps__body">
        <strong>{{ s.title }}</strong>
        <small>{{ s.desc }}</small>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.sicat-auth-steps {
  display: flex;
  gap: var(--space-3);
  list-style: none;
  margin: 0 0 var(--space-5);
  padding: 0;
}
.sicat-auth-steps__item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(var(--v-border-color), 0.16);
  background: rgb(var(--v-theme-surface));
}
.sicat-auth-steps__item[data-state='current'] {
  border-color: rgba(var(--v-theme-primary), 0.5);
  background: rgba(var(--v-theme-primary), 0.07);
}
.sicat-auth-steps__item[data-state='todo'] { opacity: 0.62; }

.sicat-auth-steps__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  font-weight: 800;
  font-size: 0.9rem;
  background: rgba(var(--v-theme-on-surface), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.sicat-auth-steps__item[data-state='current'] .sicat-auth-steps__num {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary-contrast, 255 255 255));
}
.sicat-auth-steps__item[data-state='done'] .sicat-auth-steps__num {
  background: rgba(var(--v-theme-success), 0.16);
  color: rgb(var(--v-theme-success));
}

.sicat-auth-steps__body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sicat-auth-steps__body strong {
  font-size: 0.92rem;
  line-height: 1.2;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.sicat-auth-steps__body small {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

@media (max-width: 560px) {
  .sicat-auth-steps__body small { display: none; }
}
</style>
