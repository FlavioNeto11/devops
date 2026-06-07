# Orchestration — Visual Refinement R3

**work_id:** `frontend-visual-refinement-r3`  
**date:** 2026-04-21  
**initiated_by:** orquestrador-mtr

## Demand Summary

User navigation of all SICAT screens identified systematic visual/UX issues:
- Dashboard: excessive spacing
- Manifestos screen: calendar buttons breaking layout  
- Relatório: calendar button Layout issues
- Login (CETESB + app): Must match Vuexy demo-6 login pattern
- Tables: Must match Vuexy data-table pattern (all views)
- Typography: All fonts currently wrong — must follow Vuexy typography standard

User request: **Validate ALL screens against Vuexy demo-6 reference (login, data-table, typography) and correct spacing, fonts, calendar layouts systematically.**

## Orchestration Classification

```yaml
orchestration:
  work_id: frontend-visual-refinement-r3
  intent: validate + fix
  complexity: moderate
  domains:
    - frontend-ux
    - typography-tokens
    - spacing-layout
    - component-calendar
    - table-styling
    - login-parity
    - qa-visual
  
  phase_sequence:
    - phase: "02-localhost-availability"
      agent: estrutura-vscode-mtr
      required: true
      reason: "stack must be running (postgres, api, worker, frontend) for visual QA"
    
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "navigate all screens, capture full-viewport screenshots vs Vuexy reference, identify font/spacing/component gaps"
    
    - phase: "06-frontend-ux-r3"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "systematically correct: fonts (typography tokens), spacing/layout, calendar button overflow, login styling, table formatting"
    
    - phase: "09-rerun-validation"
      agent: tester-qa-mtr
      required: true
      reason: "re-screenshot all screens, validate against Vuexy reference, confirm visual parity"
    
    - phase: "10-final-documentation"
      agent: documentador-mtr
      required: true
      reason: "consolidate decisions, document typography scale, spacing utilities, component reference links, handoff"

success_criteria:
  - All screens visually validated by screenshot  
  - Fonts match Vuexy typography standard (weights, sizes, line-height)
  - Spacing/layout consistent with Vuexy demo-6 patterns
  - Calendar buttons do not break layout in any view
  - Login (app + CETESB) visually identical to Vuexy demo-6 reference
  - Tables follow Vuexy data-table styling
  - Zero layout/spacing/font regressions
  - Build succeeds (npm run build)
  - All tests pass

reference_links:
  - Vuexy Login: https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6/login
  - Vuexy Table: https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6/tables/data-table
  - Vuexy Typography: https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6/pages/typography
```

## Phase 1 Status: Localhost Availability

**Status:** pending  
**Owner:** estrutura-vscode-mtr  
**Task:** Ensure postgres, API, worker, and frontend are running on localhost for live QA navigation

---

## Phase 2 Status: QA Visual Validation

**Status:** pending  
**Owner:** tester-qa-mtr  
**Expected Deliverable:** 
- Full-viewport screenshots of all SICAT screens (1440px wide, light + dark themes)
- Side-by-side comparison grid vs Vuexy reference
- Documented gaps: typography, spacing, calendar rendering, table layout
- Prioritized list of issues by severity

**Checkpoint File:** `09-qa-validation.md`

---

## Phase 3 Status: Frontend UX Refinement

**Status:** pending  
**Owner:** frontend-vue-ux-mtr  
**Scope:**
- Typography: Audit all font sizes, weights, line-heights; align to Vuexy scale via Vuetify tokens
- Spacing: Dashboard layout, manifest/relatório card spacing, calendar button overflow
- Login styling: Match Vuexy demo-6 login layout (dual-panel, showcase side, card side)
- Table formatting: Replace custom table CSS with Vuexy data-table styling
- Calendar buttons: Ensure buttons don't break layout on small callendar triggers

**Checkpoint File:** `06-frontend-ux-r3.md`

---

## Phase 4 Status: Revalidation

**Status:** pending  
**Owner:** tester-qa-mtr  
**Task:** Re-screenshot all screens, confirm fixes, validate visual parity

**Checkpoint File:** `09-rerun-validation.md`

---

## Phase 5 Status: Documentation

**Status:** pending  
**Owner:** documentador-mtr  
**Task:** Consolidate decisions, document typography scale, spacing utilities, design rationale

**Checkpoint File:** `10-final-documentation.md`

---

## Continuation

**Next Agent:** `estrutura-vscode-mtr` (Phase 1 — ensure localhost stack running)
