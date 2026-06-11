---
title: "Contratos canônicos de portal — formato e uso"
status: canonical
applies_to: [platform, sicat]
updated: 2026-06-11
language: pt-BR
---

# Contratos canônicos de portal

> A **verdade versionada e auditável** de como uma API externa (ex.: o portal MTR/CETESB)
> realmente funciona — endpoints, métodos, payloads, respostas, auth — capturada de operações
> **reais** e normalizada. Serve de oráculo para alinhar o acesso dos nossos apps (ex.: o
> `cetesb-gateway.js` do SICAT) aos padrões do portal, e para detectar quando o portal muda.

## Por que existe

O OpenAPI do repo (`apps/sicat/backend/openapi/...`) descreve a API **interna** do SICAT, não a da
CETESB. A "verdade" da CETESB vive implícita e espalhada no `cetesb-gateway.js`. Este diretório
preenche esse vazio: um contrato datado, validável e legível pela Claude.

## Layout (multi-portal desde o dia 1)

```
docs/portal-contracts/
  README.md                       # este arquivo
  schema/                         # spec textual do formato (endpoint + manifest)
  <portal>/
    LATEST                        # arquivo-texto com a string da versão ativa (sem symlink — Windows)
    <versão>/                     # uma pasta datada por captura (ex.: 2026-06-11)
      manifest.json               # metadados + content_hash (integridade) + janela de captura
      endpoints.jsonl             # 1 linha JSON por endpoint (o "catálogo" / suíte de contrato)
      examples/                   # exemplos redigidos grandes (opcional, fora do jsonl)
      drift-report.md             # relatório do comparador vs o app consumidor (gerado, versionado)
```

Cada **nova captura** gera uma pasta datada nova. `git diff` entre versões mostra exatamente o que o
portal mudou e quando — é o detector de drift temporal do próprio portal.

## Modelo mental: contrato = suíte de testes

- Cada **linha de `endpoints.jsonl`** = um caso de contrato (um endpoint observado).
- O **validador** (`scripts/portal-contracts/validate-portal-contract.mjs`) garante que a suíte é
  bem-formada (shape, dedup, `content_hash`, cobertura). Roda no CI e **bloqueia** se inválida.
- O **comparador** (`scripts/portal-contracts/compare-sicat-cetesb.mjs`) executa a suíte contra o
  "sob-teste" (o app consumidor, via um **mapa declarativo** mantido à mão) e emite `drift-report.md`
  com os desalinhamentos por severidade.

## Procedência dos dados (segurança)

A captura crua vive **redigida** no Postgres do app `portal-recorder` (ns `apps`, nunca no git).
Aqui no repo só entram o **schema normalizado** e **exemplos redigidos** — sem token, cookie, senha
ou recaptcha (mascarados como `***`; um `sha256` correlaciona sem expor). Política de redação herda
`BUSINESS_SENSITIVE_KEY_TOKENS` do gateway do SICAT.

## Como gerar / regenerar

1. **Captura real** no `portal-recorder` (browser remoto) → normalização → exporta `endpoints.jsonl`.
2. **Seed manual** (bootstrap, sem captura): escrever os endpoints conhecidos à mão a partir do
   gateway. O contrato `cetesb/2026-06-11` nasceu assim (`observability.source = "seed-from-gateway"`).
3. **Carimbar o hash**: `node scripts/portal-contracts/validate-portal-contract.mjs --write-hash`
   recomputa o `content_hash` de cada `endpoints.jsonl` e atualiza o `manifest.json`.

## Como a Claude consome

Abra `docs/portal-contracts/<portal>/<LATEST>/drift-report.md` para ver, por endpoint, onde o app
consumidor diverge do portal real e a recomendação acionável. O contrato (`endpoints.jsonl`) é a
referência da API real; o `drift-report.md` é a lista de tarefas de alinhamento.
