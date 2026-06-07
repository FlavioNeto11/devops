<!--
Guia de Reprodução de Validações - Fase 3
Data: 2026-04-23
Executor da geração: tester-qa-mtr
Para: Próximos especialistas / Admin
-->

# 🧪 Guia de Reprodução - Validações Fase 3

## Como Reproduzir as Validações da QA

### Setup Rápido

```bash
# Terminal 1: Dependências e Build
cd c:\GIT\PADILHA\sicat
npm install
npm run build:ts  # ou: npm run typecheck

# Terminal 2: Frontend Build
cd frontend
npm install
npm run build
```

### 1️⃣ Smoke Test Completo (Fase 3)

**Descrição:** Valida launcher, painel, contexto operacional enriquecido, modo consultivo

```bash
cd c:\GIT\PADILHA\sicat
node tests/manual/smoke-phase-3-operational-context.js
```

**Resultado Esperado:**
```
✅ Build frontend: sucesso
✅ Diagnosticos de erro: nenhum
✅ Contexto operacional enviado: sim
✅ Validações técnicas: PASSARAM
✅ Smoke test: COMPLETO
```

**Campos Operacionais Esperados:**
```json
{
  "manifestStatus": "submitted",
  "externalStatus": "registered",
  "lastAction": "manifest.sync em 23/04/2026",
  "relatedJobs": [
    {"jobId": "...", "jobType": "manifest.submit", "status": "succeeded"},
    {"jobId": "...", "jobType": "manifest.sync", "status": "processing"}
  ],
  "availableDocuments": [
    {"name": "MTR-...", "type": "manifesto"},
    {"name": "...", "type": "attachment"},
    {"name": "...", "type": "receipt"}
  ]
}
```

### 2️⃣ Testes Unitários - Policy Service

**Descrição:** Valida bloqueio consultivo (allowActions: false)

```bash
cd c:\GIT\PADILHA\sicat
npx tsx --test tests/unit/conversation-policy-service.test.js
```

**Resultado Esperado:**
```
✅ bloqueia cancelamento sem confirmacao explicita
✅ bloqueia submit em canal whatsapp
✅ permite consulta de dashboard em qualquer canal

Pass: 3, Fail: 0
```

### 3️⃣ Build Frontend

**Descrição:** Valida TypeScript sem erros, componentes carregam

```bash
cd c:\GIT\PADILHA\sicat
npm run typecheck
cd frontend && npm run build
```

**Resultado Esperado:**
```
✅ No TypeScript errors found
✅ dist/ folder created
✅ Warnings são não-bloqueadores (chunk size)
```

### 4️⃣ Debug de Contexto Operacional (Manual)

**Descrição:** Teste manual com Playwright para inspecionar payload

```bash
node tests/manual/debug-operational-context.js
```

**Como Usar:**
1. Script abre navegador em `http://127.0.0.1:5174`
2. Mostra estado do copiloto no console
3. Intercepta POST `/v1/conversations/turns`
4. Printe contexto enviado

---

## ✅ Checklist de Revalidação Rápida (5 min)

- [ ] `npm run typecheck` → 0 erros
- [ ] `cd frontend && npm run build` → sucesso
- [ ] `node tests/manual/smoke-phase-3-operational-context.js` → PASSOU
- [ ] Confirmar arquivo `frontend/src/stores/operationalContext.js` existe
- [ ] Confirmar `inAppCopilotOperationalContextKey` não existe mais
- [ ] Verificar `frontend/src/views/ManifestDetailView.vue` tem `useOperationalContextStore`
- [ ] Verificar `frontend/src/composables/useInAppCopilot.js` tem `useOperationalContextStore`

---

## 🔍 Validação Manual com Backend Real (15-20 min)

### Setup Stack Real

```bash
# Terminal 1: Prepare
npm run stack:prepare:quick

# Terminal 2: Backend
npm run api:dev

# Terminal 3: Worker
npm run worker:run

# Terminal 4: Frontend
cd frontend && npm run dev
```

### Teste Manual de Fluxo

1. **Navegar para Detalhe de Manifesto**
   - URL: `http://localhost:5174/manifestos/<ID>`
   - Deve carregar manifesto com dados reais

2. **Abrir Copiloto**
   - Clique no launcher (ícone 💬 ou botão "Copiloto")
   - Painel deve abrir na lateral direita

3. **Validar Contexto Operacional**
   - Abrir DevTools → Network tab
   - Enviar mensagem: "Qual é o status deste manifesto?"
   - Procurar POST `/v1/conversations/turns`
   - Verificar payload inclui: `manifestStatus`, `externalStatus`, `lastAction`, `relatedJobs`, `availableDocuments`

4. **Validar Modo Consultivo**
   - Enviar: "Quero submeter este manifesto agora"
   - Copiloto deve responder que não pode fazer ações operacionais
   - Backend retorna `reasonCode: 'ACTIONS_DISABLED'`

5. **Testar Quick Actions**
   - Observar quick actions exibidas (ex: "Consultar este manifesto")
   - Clicar e validar navegação/ação

---

## 📊 Artefatos de Revalidação

| Artefato | Localização | Propósito |
|----------|-----------|----------|
| Smoke Test | `tests/manual/smoke-phase-3-operational-context.js` | Validação técnica completa |
| Debug Script | `tests/manual/debug-operational-context.js` | Troubleshooting |
| Test Unit | `tests/unit/conversation-policy-service.test.js` | Bloqueio consultivo |
| Store | `frontend/src/stores/operationalContext.js` | Contexto operacional |

---

## 🆘 Troubleshooting

### Smoke test falha: "Contexto operacional não enviado"

**Verificar:**
1. `frontend/src/views/ManifestDetailView.vue` tem `watch()` ativo?
2. `frontend/src/composables/useInAppCopilot.js` importa `useOperationalContextStore`?
3. `frontend/src/stores/operationalContext.js` existe e tem 5 campos?

**Solução:** Re-executar `npm run build` e `npm run typecheck`

### Frontend não consegue rodar

**Verificar:**
1. `npm install` executado?
2. Porta 5174 disponível?
3. Backend rodando em localhost:8080?

**Solução:** `pkill -f "npm run dev" && npm install && npm run dev`

### Policy service não bloqueia ações

**Verificar:**
1. `conversation-policy-service.ts` tem checagem `if (policy.isAction && input.allowActions === false)`?
2. Frontend envia `allowActions: false`?

**Solução:** Log POST `/v1/conversations/turns` em backend, confirmar `options.allowActions: false`

---

## 📚 Referência Rápida

**Principais Arquivos:**
- Store: `frontend/src/stores/operationalContext.js`
- View Sync: `frontend/src/views/ManifestDetailView.vue` (linhas 50-80)
- Composable: `frontend/src/composables/useInAppCopilot.js` (linhas 360-365)
- Policy: `src/services/conversation/conversation-policy-service.ts` (linhas 130-140)

**Comandos de Teste:**
```bash
npm run typecheck                    # TypeScript check
npm run build:ts                     # Build TypeScript
cd frontend && npm run build         # Build frontend
node tests/manual/smoke-...js        # Smoke test
npx tsx --test tests/unit/...test.js # Unit tests
npm run api:dev                      # Backend dev
npm run worker:run                   # Worker
cd frontend && npm run dev           # Frontend dev
```

---

**Data de Criação:** 2026-04-23  
**Válido para:** Fase 3 (Assistente Interno Consultivo)  
**Mantido por:** tester-qa-mtr
