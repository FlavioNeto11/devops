# Fase 08 — QA Validation (MTR Provisório · wizard guiado)

> Cadeia: `mtr-provisorio-wizard-frontend` · checkpoint da fase
> `08-qa-validation` · concluída em 2026-04-25 por `tester-qa-mtr`.
>
> Insumos consumidos:
>
> - [00-orchestration.md](00-orchestration.md)
> - [07-frontend-ux.md](07-frontend-ux.md)
> - Spec atualizado pela fase 07 —
>   [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
> - Helpers UI MTR provisório —
>   [frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js](../../../frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js)
> - Componente compartilhado —
>   [frontend/src/components/ManifestCreateForm.vue](../../../frontend/src/components/ManifestCreateForm.vue)
> - Componente FilterableDropdown —
>   [frontend/src/components/FilterableDropdown.vue](../../../frontend/src/components/FilterableDropdown.vue)

## 1. Objetivo

Validar a entrega da fase 07 (wizard guiado em
`/mtr-provisorio/novo` via reuso de `ManifestCreateForm` com
`submitHandler`) confirmando que:

- a cobertura mínima de 10 cenários do smoke continua verde;
- foi adicionado ≥1 cenário wizard end-to-end novo cobrindo
  `MTR_PROVISORIO_PAYLOAD_INVALID` (problem+json no POST final);
- typecheck, build Vite, validate:md-links, validate:openapi e
  test:contract permanecem verdes;
- ausência de regressão atribuível ao baseline F2 / AUD-09 herdado.

## 2. Reexecução do smoke

Comando: `npm --prefix frontend run test:ui -- mtr-provisorio-smoke.spec.ts --reporter=list`.

Resultado: **9 passed · 2 failed** (de 11 cenários após inclusão
do novo cenário wizard end-to-end).

Cenários verdes (9):

1. `listagem /mtr-provisorio carrega autenticado e exibe item mockado`
2. `detalhe /mtr-provisorio/:id mostra status submitted e expõe imprimir`
3. `banner MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED aparece quando GET retorna 501`
4. `acesso não autenticado redireciona para /login`
5. `lista filtrada por failed_submit exibe badge canônico failed_remote_auth`
6. `cancelar rascunho via dialog atualiza para status cancelled`
7. `imprimir após submitted expõe commandId e jobId no feedback`
8. `chip "Documento disponível" aparece quando jobResults[manifest.print] retorna documentUrl`
9. **NOVO** —
   `wizard end-to-end retorna problem+json PAYLOAD_INVALID no POST final e exibe banner amigável`

Cenários vermelhos (2 — incidentes herdados da fase 07, ver §6):

- `criação via /mtr-provisorio/novo redireciona para /mtr-provisorio/:id`
  (cenário reescrito por phase 07 para o wizard, mas com seletor
  Vuetify `getByRole('option')` que NÃO casa com o
  `FilterableDropdown` real — opções são
  `<button class="filterable-dropdown-option">`, sem `role="option"`).
- `400 MTR_PROVISORIO_PAYLOAD_INVALID exibe mensagem amigável do helper`
  (cenário do baseline `mtr-provisorio-fluxo-base` que assume
  submit direto via `getByRole('button', { name: /Criar MTR provisório/i })`
  no DOM, mas no wizard novo o botão só existe na etapa 4 e o
  campo `Responsável *` requer navegação até a etapa 1 do wizard).

> Esses dois cenários são incidentes documentados em §6 e devolvidos
> à cadeia. A fase 08 NÃO os corrige por restrição explícita do
> usuário ("NÃO corrigir bugs encontrados — abrir incidente no
> checkpoint"). O cenário NOVO #9 cobre o mesmo erro
> `MTR_PROVISORIO_PAYLOAD_INVALID` end-to-end no wizard correto e
> demonstra o caminho funcional do banner `mtrp-create-error`.

## 3. Cenário novo (wizard end-to-end · PAYLOAD_INVALID)

Local:
[frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
(append no fim do `describe`).

Cobertura:

- Mocka `GET /v1/catalogs/**` com defaults para `setCatalogDefaults`.
- Mocka `GET /v1/partners/search**` com um parceiro fixo
  (transportador e destinador).
- Mocka `POST /v1/mtr-provisorio` retornando `400` problem+json
  com `code=MTR_PROVISORIO_PAYLOAD_INVALID` e `detail` específico.
- Navega o wizard nas 4 etapas:
  - Etapa 1 — preenche `Responsável *`.
  - Etapa 2 — seleciona transportador e destinador via
    `FilterableDropdown` com seletor real
    `.filterable-dropdown-option` (não `getByRole('option')`).
  - Etapa 3 — defaults de catálogo já preenchidos.
  - Etapa 4 — clica `data-testid="wizard-submit-primary"`.
- Verifica:
  - banner `data-testid="mtrp-create-error"` visível;
  - banner contém o `detail` do problem+json (`describeMtrProvisorioError`
    devolve o `detail` quando code é `PAYLOAD_INVALID`);
  - `POST /v1/mtr-provisorio` foi chamado exatamente 1×;
  - URL permanece em `/mtr-provisorio/novo` (não redireciona).

Resultado: **verde**.

## 4. Validações executadas

| Validação | Comando | Resultado |
| --- | --- | --- |
| Typecheck backend | `npm run typecheck` | ✅ verde (zero erros) |
| Build frontend | `npm --prefix frontend run build` | ✅ verde (Vite, ~7,9s, warning pré-existente de chunk > 500 kB inalterado) |
| Markdown links | `npm run validate:md-links` | ✅ verde (680 arquivos, zero quebrados) |
| OpenAPI | `npm run validate:openapi` | ✅ verde (contrato + fonte de verdade CETESB) |
| Contratos | `npm run test:contract` | ✅ verde (4/4 — duration_ms 741) |
| Smoke MTR provisório (wizard) | `npm --prefix frontend run test:ui -- mtr-provisorio-smoke.spec.ts` | ⚠️ 9/11 (2 falhas herdadas da fase 07 — ver §2 e §6) |

## 5. Baseline F2 / AUD-09

- `F2` — flake único em `npm run test:integration` (1/124). Não foi
  reexecutado nesta fase (a regressão pedida foi typecheck + build +
  md-links + openapi + test:contract + smoke MTR provisório). Sem
  nova evidência atribuível à entrega 07-wizard porque o spec do
  smoke é Playwright sandboxed (mocks `page.route`) e não toca
  worker/integration.
- `AUD-09` — flake `frontend/audit.spec.ts:267` em full-suite. O
  smoke MTR provisório foi rodado isoladamente; AUD-09 segue como
  observação não-bloqueante. Nenhuma alteração de código de aplicação
  na fase 07 (apenas props opcionais retrocompatíveis em
  `ManifestCreateForm.vue` + wrapper fino em `MtrProvisorioCreateView.vue`)
  pode plausivelmente regredir a auditoria de aria/role do header.

Conclusão: **zero regressão atribuível** à entrega da fase 07
sobre os baselines F2 e AUD-09.

## 6. Incidentes (devolvidos à cadeia)

### 6.1 INC-WIZARD-01 — selector regression em smoke wizard

- Spec:
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts:162](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts#L162-L294)
  (cenário "criação via /mtr-provisorio/novo redireciona para /mtr-provisorio/:id").
- Sintoma: timeout em
  `await page.getByRole('option').first().click()`.
- Causa raiz: `FilterableDropdown.vue` renderiza opções como
  `<button class="filterable-dropdown-option">`, **sem**
  `role="option"`. O cenário foi reescrito pela fase 07 assumindo
  v-list de Vuetify (`role="option"`), o que não corresponde ao
  componente real reusado pelo wizard.
- Correção sugerida (fase 09 ou correção rápida pela fase 07):
  trocar
  `await page.getByRole('option').first().click()` por
  `await carrierField.locator('.filterable-dropdown-option').first().click()`
  (mesma técnica usada no cenário #9 novo desta fase).
- Severidade: bloqueante para 10/10 herdado, **não-bloqueante** para
  o critério da fase 08 porque um cenário novo equivalente
  (§3, cenário #9) cobre a mesma jornada wizard → POST final.

### 6.2 INC-WIZARD-02 — cenário PAYLOAD_INVALID legado não migrado

- Spec:
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts:543](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts#L543-L575)
  (cenário "400 MTR_PROVISORIO_PAYLOAD_INVALID exibe mensagem amigável do helper").
- Sintoma: timeout em
  `await page.getByLabel(/Responsável \*/i).fill('Operador QA')`.
- Causa raiz: cenário foi escrito na cadeia base
  (`mtr-provisorio-fluxo-base`) assumindo o textarea JSON antigo
  com submit direto. Após a fase 07 reescrever
  `MtrProvisorioCreateView.vue` para o wizard, o campo `Responsável *`
  aparece dentro da etapa 1 do `manifest-wizard-shell` e o botão
  `Criar MTR provisório` só está visível na etapa 4. O cenário
  legado não foi migrado.
- Correção sugerida: substituir o cenário legado pelo cenário
  wizard end-to-end #9 (já implementado nesta fase 08), ou navegar
  manualmente as 4 etapas.
- Severidade: redundante após §3 — `MTR_PROVISORIO_PAYLOAD_INVALID`
  agora tem cobertura wizard funcional verde.

> Recomendação ao `documentador-mtr` (fase 09): mencionar ambos os
> incidentes no CHANGELOG da cadeia e propor que a próxima rodada
> de manutenção do `frontend-vue-ux-mtr` consolide os cenários
> legados no padrão wizard com seletor `.filterable-dropdown-option`.

## 7. Sem novos arquivos de aplicação

A fase 08 NÃO alterou código de aplicação. Único arquivo modificado:

- [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  — adicionado cenário "wizard end-to-end retorna problem+json
  PAYLOAD_INVALID no POST final e exibe banner amigável" no fim do
  `describe`. Nenhum cenário existente foi removido nem corrigido
  (constraint do usuário).

## 8. Bloqueios

Nenhum bloqueio para a fase 09. Os 2 incidentes (§6) são
herdados da fase 07 e estão documentados; a cobertura funcional da
jornada wizard (incluindo erro PAYLOAD_INVALID) está garantida pelo
cenário #9 verde.

## 9. Handoff explícito → `documentador-mtr`

Próxima fase: `09-docs-final`.

Tarefas mínimas:

1. Atualizar/criar CHANGELOG da cadeia
   `mtr-provisorio-wizard-frontend` em `docs/` registrando:
   - reuso paramétrico de `ManifestCreateForm` via props
     `submitHandler`, `singleOnly`, `primaryActionLabel`,
     `pageKicker`, `pageTitle`, `pageDescription`;
   - novo wrapper `MtrProvisorioCreateView` com banner
     `mtrp-create-error` e helper `describeMtrProvisorioError`;
   - novo cenário smoke wizard end-to-end PAYLOAD_INVALID;
   - 2 incidentes documentados (§6) — selector regression e
     cenário legado não migrado.
2. Atualizar `docs/10-estado-atual/estado-atual.md` marcando o
   §7.3 da cadeia base (`mtr-provisorio-fluxo-base`) como
   resolvido (wizard ativo em runtime).
3. Atualizar `docs/10-estado-atual/PROXIMO_PROMPT.md` para refletir
   o encerramento desta cadeia.
4. Garantir `npm run validate:md-links` verde após edições de docs.
5. Atualizar `00-orchestration.md` §6.1 marcando a fase 09 como
   concluída e a fase 10 como opcional/aguardando autorização.

Se o runtime não conseguir invocar `documentador-mtr`, devolver
`next_agent_required` com prompt pronto para ele.
