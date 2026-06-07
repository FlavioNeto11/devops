---
name: validar-fluxo-cetesb
description: 'Analisa ou fortalece um fluxo integrado com a CETESB, incluindo token, payload, persistência e fallback.'
agent: orquestrador-mtr
argument-hint: 'Informe o fluxo: login, submit, print, cancel, partner search, catalog sync...'
---

# Validar Fluxo CETESB

**Contexto:** analisar ou fortalecer fluxo integrado com a CETESB.

**Agente:** `orquestrador-mtr` (delega para `integrador-cetesb-mtr` + `tester-qa-mtr`)

**Leitura obrigatória:**
- `docs/copilot/07-integracao-cetesb.md`
- `docs/copilot/04-fluxos-operacionais.md`
- `docs/copilot/08-riscos-e-lacunas.md`

## Fluxo alvo

${input:fluxo:Escolha o fluxo (login, submit, print, cancel, partner search, catalog sync, cadastro.submit)}

## Foco da validação

${input:focus:Áreas de foco (Token/autenticação, Payload e validação, Persistência e auditoria, Retry e fallback, Testes)}

Quero que você:
1. localize o fluxo no código
2. explique estado atual
3. identifique riscos e hipóteses frágeis
4. delegue para `integrador-cetesb-mtr` quando houver mudança de integração real
5. delegue para `tester-qa-mtr` para cobertura de sucesso/falha
6. entregue checklist de validação
