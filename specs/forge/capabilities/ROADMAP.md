---
title: "Roadmap de blocos de capacidade — intenções SEM exemplar (não viram bloco)"
status: reference
applies_to: [platform]
updated: 2026-07-02
language: pt-BR
---

# Roadmap de blocos de capacidade

Registro das capacidades **planejadas** que ainda **não podem virar bloco** do catálogo: a regra
anti-fabricação (`reference[].path` validado por `fs.existsSync` no `build-products.mjs`) exige um
**exemplar REAL no monorepo**, e criar bloco sem exemplar é proibido. Quando o exemplar existir,
a entrada sai daqui e vira `blocks/<id>.json`.

## PLANNED

### `mobile-nativo` — app nativo de loja (React Native/Expo)

- **O que entrega:** aplicativo móvel NATIVO distribuído por loja (App Store/Play Store):
  React Native + Expo, build/distribuição via EAS, push nativo por FCM (Android) e APNs (iOS)
  — o degrau acima do bloco `mobile-pwa` (que cobre instalável + push web VAPID sem loja).
- **Por que ainda não é bloco:** **não há exemplar real no monorepo.** O único código Expo
  existente (`apps/zapbridge/app/`, aposentado — o frontend ativo é a SPA Vite em
  `apps/zapbridge/web/`) nunca foi empacotado para loja nem usa EAS/FCM/APNs; usá-lo como
  referência seria exemplar de fachada.
- **Gatilho para promover a bloco:** o **primeiro produto que exija presença em loja**
  (requisito real, não hipótese). A implementação desse produto cria o exemplar; o bloco
  nasce apontando para os paths reais dele.
- **Esboço do contrato futuro** (a validar quando houver exemplar):
  - `category: ui`; `tiers: [t3, t4]`; `compatible_stacks`: a stack do exemplar;
  - `scaffold_overlay.adds_env`: credenciais EAS + FCM/APNs (sempre via Sealed Secrets);
  - `verification`: build EAS reproduzível + push nativo entregue em dispositivo real +
    revisão de que nenhuma credencial de loja está em plaintext.

---
_Blocos ativos: [`blocks/`](./blocks/) · regras do catálogo: [`README.md`](./README.md) ·
build/validação: `specs/tools/build-products.mjs`._
