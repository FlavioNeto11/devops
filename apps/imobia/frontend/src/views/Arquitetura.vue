<script setup>
const models = [
  { name: 'Cortex', role: 'Triagem rápida e barata', desc: 'Classifica canal/intenção do WhatsApp, categoriza despesas, faz busca semântica. É o roteador do grafo (modelo barato).', cls: 'tag-cortex' },
  { name: 'GPT', role: 'Lógica e automação', desc: 'Qualifica leads, categoriza PJ/PF, transforma texto livre em agendamentos, cruza preços de mercado, simula parcelas.', cls: 'tag-gpt' },
  { name: 'Claude', role: 'Redação e análise', desc: 'Escreve laudos PTAM (ABNT NBR 14653), laudos de vistoria, relatórios de fluxo de caixa e cartas de contestação.', cls: 'tag-claude' },
  { name: 'Gemini', role: 'Documentos e visão', desc: 'Valida RG/CNH/holerite/certidões, lê Serasa e extratos, analisa fotos de vistoria (fissuras, manchas).', cls: 'tag-gemini' },
];

const roadmap = [
  { fase: 'F0', txt: 'Esqueleto no ar em /imobia + API de saúde. IA dormente.' },
  { fase: 'F1', txt: 'Postgres (pgvector) + Redis + Prisma + login local e SSO Keycloak.' },
  { fase: 'F2', txt: 'Motor multi-LLM (Cortex→GPT/Claude/Gemini) + adaptador Gemini no ai-core.' },
  { fase: 'F3', txt: 'Captação/Imóveis + Clientes/Leads com busca semântica.' },
  { fase: 'F4', txt: 'Agenda/Eventos + Documentos + Vistoria (laudo em PDF).' },
  { fase: 'F5', txt: 'Financeiro PJ/PF + Corbam/COBAN (recuperação de crédito).' },
  { fase: 'F6', txt: 'WhatsApp multi-instância + ACM (varredura de portais).' },
  { fase: 'F7', txt: 'PTAM + especialistas ao vivo (multimodal alimentando as IAs).' },
  { fase: 'F8', txt: 'Registro no Console/Portal + observabilidade + hardening.' },
];
</script>

<template>
  <section class="im-hero">
    <h1>Arquitetura</h1>
    <p>
      Uma <b>orquestração multi-modelo</b> sobre o kit <code>@flavioneto11/ai-core</code>: um roteador
      (Cortex) decide, especialistas executam ferramentas (tools) com autorização e confirmação, e tudo
      é <b>fail-soft</b> — sem chaves de API, cada módulo funciona manualmente e as IAs ficam dormentes.
    </p>
  </section>

  <h2 class="im-section-title">Os 4 modelos</h2>
  <div class="im-flow">
    <div v-for="m in models" :key="m.name" class="node">
      <h4 :class="m.cls">{{ m.name }}</h4>
      <div style="margin: 2px 0 8px; font-weight: 600">{{ m.role }}</div>
      <small>{{ m.desc }}</small>
    </div>
  </div>

  <h2 class="im-section-title">Roadmap de entrega</h2>
  <div class="im-roadmap">
    <div v-for="s in roadmap" :key="s.fase" class="step">
      <span class="fase">{{ s.fase }}</span>
      <span class="txt">{{ s.txt }}</span>
    </div>
  </div>
</template>
