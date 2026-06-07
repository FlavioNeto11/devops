<!--
RF-PHASE3-BLOCKER-ARCH: Rastreamento de blocker de arquitetura - Fase 3 Conversacional
Criado: 2026-04-23 por tester-qa-mtr
Status: Aberto, aguardando implementador
Prioridade: Crítica (bloqueia Fase 3)
-->

# Blocker de Arquitetura - Fase 3: Contexto Operacional Enriquecido

## Resumo

O contexto operacional enriquecido da tela de detalhe de manifesto (manifestStatus, externalStatus, lastAction, relatedJobs, availableDocuments) não está sendo enviado ao backend conversacional porque a arquitetura de provide/inject em Vue 3 viola a hierarquia ancestor-descendant necessária.

## Problema Técnico

### Situação Atual

```vue
<!-- frontend/src/App.vue -->
<template>
  <v-app>
    <main>
      <router-view />  <!-- ManifestDetailView renderiza aqui e FORNECE contexto -->
    </main>
    
    <InAppCopilotAssistant v-if="showShell" />  <!-- Tenta CONSUMIR contexto, mas é sibling -->
  </v-app>
</template>
```

**Fluxo quebrado:**
1. ManifestDetailView.vue monta → calcula `inAppCopilotContext` computed
2. ManifestDetailView.vue chama `provide(inAppCopilotOperationalContextKey, inAppCopilotContext)`
3. InAppCopilotAssistant.vue monta → chama `inject(inAppCopilotOperationalContextKey, null)`
4. ❌ Inject falha porque o consumidor é **sibling do provider**, não descendente
5. Resultado: `operationalContext = null` → contexto operacional **nunca é enriquecido**

### Validação do Problema

**Smoke test:** `tests/manual/smoke-phase-3-operational-context.js`
- Build: ✅ Sucesso
- Launcher: Visível
- Contexto básico: Enviado (manifestId, routeName, etc)
- **Contexto operacional: ❌ FALTANDO (manifestStatus, externalStatus, lastAction, relatedJobs, availableDocuments)**

**Payload POST /v1/conversations/turns esperado:**
```json
{
  "context": {
    "manifestId": "test_manifest_qa_phase3_001",
    "manifestStatus": "submitted",
    "externalStatus": "registered",
    "lastAction": "manifest.submit em 23/04/2026",
    "relatedJobs": [
      { "jobId": "job_submit_...", "jobType": "manifest.submit", "status": "succeeded" }
    ],
    "availableDocuments": [
      { "name": "MTR-...", "type": "manifesto" },
      { "name": "Anexo_001.pdf", "type": "attachment" }
    ]
  }
}
```

**Payload POST /v1/conversations/turns atual (vazio):**
```json
{
  "context": {
    "manifestId": "test_manifest_qa_phase3_001",
    "manifestStatus": null,
    "externalStatus": null,
    "lastAction": null,
    "relatedJobs": [],
    "availableDocuments": []
  }
}
```

## Soluções Possíveis

### Opção 1: Pinia Store (Recomendado)

**Vantagem:** Desacopla completamente provide/inject; permite que múltiplos componentes leiam/atualizem contexto.

**Implementação:**
1. Criar `stores/operationalContext.js`:
   ```javascript
   import { defineStore } from 'pinia';
   import { ref, computed } from 'vue';
   
   export const useOperationalContextStore = defineStore('operationalContext', () => {
     const manifestStatus = ref(null);
     const externalStatus = ref(null);
     const lastAction = ref(null);
     const relatedJobs = ref([]);
     const availableDocuments = ref([]);
     
     function setManifestContext(manifest) {
       if (!manifest) {
         manifestStatus.value = null;
         externalStatus.value = null;
         lastAction.value = null;
         relatedJobs.value = [];
         availableDocuments.value = [];
         return;
       }
       
       manifestStatus.value = manifest.status;
       externalStatus.value = manifest.externalStatus;
       lastAction.value = extractLastAction(manifest);
       relatedJobs.value = extractRelatedJobs(manifest);
       availableDocuments.value = extractAvailableDocuments(manifest);
     }
     
     return {
       manifestStatus: readonly(manifestStatus),
       externalStatus: readonly(externalStatus),
       lastAction: readonly(lastAction),
       relatedJobs: readonly(relatedJobs),
       availableDocuments: readonly(availableDocuments),
       setManifestContext
     };
   });
   ```

2. Em `ManifestDetailView.vue`, após carregar manifesto:
   ```javascript
   const operationalContextStore = useOperationalContextStore();
   watch(() => manifest.value, (newManifest) => {
     operationalContextStore.setManifestContext(newManifest);
   });
   ```

3. Em `useInAppCopilot.js`, ler do store:
   ```javascript
   const operationalContextStore = useOperationalContextStore();
   const currentScreenContext = computed(() => buildConversationScreenContext({
     // ...
     operationalContext: {
       manifestStatus: operationalContextStore.manifestStatus,
       externalStatus: operationalContextStore.externalStatus,
       lastAction: operationalContextStore.lastAction,
       relatedJobs: operationalContextStore.relatedJobs,
       availableDocuments: operationalContextStore.availableDocuments
     }
   }));
   ```

### Opção 2: Mover Provide para App.vue (Mais simples)

**Vantagem:** Menos invasivo; mantém o padrão atual.

**Implementação:**
1. Em `App.vue`, criar um ref reativo:
   ```javascript
   const operationalContext = ref(null);
   provide(inAppCopilotOperationalContextKey, operationalContext);
   ```

2. Em `ManifestDetailView.vue`, atualizar o ref ao invés de fazer provide:
   ```javascript
   const operationalContext = inject(inAppCopilotOperationalContextKey);
   watch(() => manifest.value, (newManifest) => {
     if (operationalContext && newManifest) {
       operationalContext.value = {
         manifestStatus: newManifest.status,
         externalStatus: newManifest.externalStatus,
         lastAction: extractLastAction(newManifest),
         relatedJobs: extractRelatedJobs(newManifest),
         availableDocuments: extractAvailableDocuments(newManifest)
       };
     }
   });
   ```

3. Em `useInAppCopilot.js`, ler do contexto injetado:
   ```javascript
   const operationalContext = inject(inAppCopilotOperationalContextKey, null);
   // ...
   operationalContext?.value || null  // Ler o `.value` se ref
   ```

### Opção 3: Usar Teleport (Menos comum)

Mover `<InAppCopilotAssistant />` para estar renderizado dentro de `<router-view>` via teleport.

## Recomendação

**Usar Opção 1 (Pinia Store)** por:
- Desacoplamento total
- Reutilizável por outros componentes futuros
- Padrão de estado centralizado estabelecido no projeto
- Maior testabilidade

**Fallback:** Opção 2 se Pinia não estiver disponível ou preferir mudança mínima.

## Testes de Validação Pós-Correção

Executar após implementação:
```bash
node tests/manual/smoke-phase-3-operational-context.js
```

Resultado esperado:
```
📋 Contexto enviado:
  - manifestStatus: ✅ submitted
  - externalStatus: ✅ registered
  - lastAction: ✅ manifest.submit em ...
  - relatedJobs: ✅ Present (2)
  - availableDocuments: ✅ Present (2)
```

## Impacto

- **Fase 3:** Desbloqueada
- **Fase 4+:** Pode iniciar normalmente
- **Documentação:** Atualizar [09-qa-validation.md](09-qa-validation.md) com evidência de resolução

## Cronograma

- **Hoje:** Identificação (2026-04-23)
- **Próximo:** Implementação (domain specialist)
- **Revalidação:** Post-implementação (tester-qa-mtr)
- **Merge:** Após revalidação e documentação final
