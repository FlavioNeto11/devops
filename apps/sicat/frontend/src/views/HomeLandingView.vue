<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { applyAppTheme } from '../composables/useAppTheme.js';

const router = useRouter();
const theme = useTheme();
const isDarkTheme = computed(() => Boolean(theme.global.current.value.dark));

function toggleTheme() {
  applyAppTheme(theme, isDarkTheme.value ? 'light' : 'dark');
}

function goToLogin() {
  router.push('/login');
}

const capabilities = [
  { icon: 'mdi-file-document-multiple-outline', title: 'MTR', text: 'Emita, acompanhe, receba e cancele Manifestos de Transporte de Resíduos com poucos cliques.' },
  { icon: 'mdi-certificate-outline', title: 'CDF', text: 'Gere e baixe Certificados de Destinação Final a partir dos manifestos recebidos.' },
  { icon: 'mdi-file-tree-outline', title: 'DMR', text: 'Consolide e submeta Declarações de Movimentação de Resíduos por período.' },
  { icon: 'mdi-chat-processing-outline', title: 'Assistente', text: 'Tire dúvidas e execute ações operacionais com o assistente conversacional integrado.' }
];

const steps = [
  { number: '1', title: 'Acesse com sua conta', text: 'Faça login no SICAT e selecione a conta CETESB ativa.' },
  { number: '2', title: 'Opere no painel', text: 'Acompanhe pendências do dia e execute as ações da sua jornada.' },
  { number: '3', title: 'Automatize com a CETESB', text: 'O SICAT cuida das integrações assíncronas e do acompanhamento dos jobs.' }
];
</script>

<template>
  <div class="landing">
    <header class="landing__topbar">
      <div class="landing__brand">
        <v-icon color="primary" size="28">mdi-leaf-circle</v-icon>
        <div class="landing__brand-copy">
          <strong>SICAT</strong>
          <small>Automação MTR · CETESB</small>
        </div>
      </div>
      <div class="landing__topbar-actions">
        <v-btn variant="text" :icon="isDarkTheme ? 'mdi-weather-sunny' : 'mdi-weather-night'" :aria-label="isDarkTheme ? 'Tema claro' : 'Tema escuro'" @click="toggleTheme" />
        <v-btn color="primary" variant="flat" @click="goToLogin">Acessar plataforma</v-btn>
      </div>
    </header>

    <section class="landing__hero">
      <div class="landing__hero-copy">
        <span class="landing__eyebrow">Plataforma operacional de resíduos</span>
        <h1 class="landing__title">Automação MTR/CETESB que simplifica a operação diária</h1>
        <p class="landing__subtitle">
          Emita manifestos, gere certificados, declare movimentações e monitore integrações —
          tudo em um produto único, rápido e orientado à sua jornada operacional.
        </p>
        <div class="landing__hero-actions">
          <v-btn color="primary" variant="flat" size="large" prepend-icon="mdi-login" @click="goToLogin">Acessar plataforma</v-btn>
        </div>
      </div>
    </section>

    <section class="landing__section">
      <h2 class="landing__section-title">O que você faz no SICAT</h2>
      <div class="landing__cards">
        <article v-for="cap in capabilities" :key="cap.title" class="landing__card">
          <v-icon :icon="cap.icon" size="32" class="landing__card-icon" />
          <h3 class="landing__card-title">{{ cap.title }}</h3>
          <p class="landing__card-text">{{ cap.text }}</p>
        </article>
      </div>
    </section>

    <section class="landing__section landing__section--steps">
      <h2 class="landing__section-title">Como funciona</h2>
      <div class="landing__steps">
        <article v-for="step in steps" :key="step.number" class="landing__step">
          <span class="landing__step-number">{{ step.number }}</span>
          <div>
            <h3 class="landing__card-title">{{ step.title }}</h3>
            <p class="landing__card-text">{{ step.text }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="landing__cta">
      <h2 class="landing__cta-title">Pronto para operar com menos esforço?</h2>
      <p class="landing__subtitle">Entre na plataforma e veja suas pendências do dia em segundos.</p>
      <v-btn color="primary" variant="flat" size="large" @click="goToLogin">Acessar plataforma</v-btn>
    </section>

    <footer class="landing__footer">
      <span>SICAT · Automação MTR/CETESB</span>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--gradient-hero, rgb(var(--v-theme-background)));
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.landing__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px clamp(18px, 4vw, 56px);
}

.landing__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.landing__brand-copy {
  display: grid;
  line-height: 1.1;
}

.landing__brand-copy strong {
  font-size: 1.1rem;
  font-weight: 800;
}

.landing__brand-copy small {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.landing__topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.landing__hero {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(48px, 8vw, 120px) clamp(18px, 4vw, 56px);
  text-align: center;
}

.landing__hero-copy {
  max-width: 820px;
  display: grid;
  gap: 20px;
  justify-items: center;
}

.landing__eyebrow {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgba(var(--v-theme-primary), 1);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.landing__title {
  font-family: var(--font-family-display);
  font-size: clamp(2rem, 5vw, 3.4rem);
  line-height: 1.08;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.02em;
}

.landing__subtitle {
  font-size: clamp(1rem, 2vw, 1.2rem);
  color: rgba(var(--v-theme-on-surface), 0.7);
  max-width: 64ch;
  margin: 0;
}

.landing__hero-actions {
  margin-top: 8px;
}

.landing__section {
  padding: clamp(32px, 5vw, 64px) clamp(18px, 4vw, 56px);
  max-width: var(--app-max-width);
  margin: 0 auto;
  width: 100%;
}

.landing__section-title {
  font-family: var(--font-family-display);
  font-size: clamp(1.4rem, 3vw, 2rem);
  font-weight: 700;
  text-align: center;
  margin: 0 0 32px;
}

.landing__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.landing__card {
  display: grid;
  gap: 10px;
  padding: 28px 24px;
  border-radius: var(--radius-lg);
  background: rgba(var(--v-theme-surface), 0.86);
  border: 1px solid rgba(var(--v-border-color), 0.16);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(8px);
}

.landing__card-icon {
  color: rgba(var(--v-theme-primary), 1);
}

.landing__card-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.landing__card-text {
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
  margin: 0;
  line-height: 1.5;
}

.landing__steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.landing__step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.landing__step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--gradient-primary, rgb(var(--v-theme-primary)));
  color: #fff;
  font-weight: 800;
}

.landing__cta {
  display: grid;
  gap: 16px;
  justify-items: center;
  text-align: center;
  padding: clamp(48px, 7vw, 96px) clamp(18px, 4vw, 56px);
}

.landing__cta-title {
  font-family: var(--font-family-display);
  font-size: clamp(1.6rem, 3.5vw, 2.4rem);
  font-weight: 800;
  margin: 0;
}

.landing__footer {
  margin-top: auto;
  padding: 24px;
  text-align: center;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  border-top: 1px solid rgba(var(--v-border-color), 0.12);
}
</style>
