# 00 - Orchestration

## Demanda original (resumo)

Criar uma estrutura de agente reutilizavel para acessar `https://mtr.cetesb.sp.gov.br/#/` via automacao com `microsoft/playwright`, navegar pelas telas do sistema, validar chamadas e fluxos de payload cruzando com o frontend do SICAT e produzir documentacao completa de navegacao e comportamento observado. A estrutura deve aceitar informacoes de acesso e contexto operacional como parametros do usuario, exigir apoio do usuario no ponto do CAPTCHA `nao sou um robo`, e bloquear fluxos sensiveis antes de qualquer acao que gere ou altere dados de forma definitiva, consultando o usuario antes de prosseguir.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "cetesb-playwright-navigation-audit"
  intent: "meta"
  complexity: "complex"
  domains:
    - "source-validation"
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "06-meta-evolution"
      agent: "meta-evolution-copilot"
      required: true
      reason: "A entrega solicitada e uma nova estrutura de agente/prompt parametrizavel dentro da plataforma Copilot."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "A estrutura precisa ser revisada para coerencia, seguranca operacional e aplicabilidade futura."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar como a estrutura deve ser usada, quais parametros aceita e quais limites de seguranca existem."
```

## Requisitos obrigatorios

- Navegacao automatizada via `microsoft/playwright`.
- Agente deve poder acessar o sistema externo CETESB em `https://mtr.cetesb.sp.gov.br/#/`.
- Fluxo deve aceitar parametros do usuario, incluindo credenciais e contexto de perfil operacional, sem exigir hardcode de usuarios fixos no repositorio.
- Exemplos de usuarios fornecidos pelo usuario devem servir apenas como referencia de uso, nao como dados persistidos em artefatos permanentes.
- O ponto do CAPTCHA deve prever colaboracao do usuario para destravar o fluxo.
- Fluxos sensiveis ou mutaveis devem parar antes da confirmacao final e consultar o usuario antes de executar.
- Telas de cadastro, baixa ou operacoes mutaveis podem ser navegadas apenas ate o ponto imediatamente anterior a executar a alteracao, salvo autorizacao explicita do usuario durante a sessao.
- Estrutura deve documentar passo a passo a navegacao e o fluxo observado hoje, no estilo de handoff ja usado no repositorio.
- A validacao deve cruzar chamadas/payloads observados na navegacao externa com o frontend do SICAT quando aplicavel.

## Decisoes iniciais de desenho

- Preferir um agente dedicado para navegacao/auditoria externa com Playwright, em vez de sobrecarregar agentes globais ja existentes.
- Complementar o agente com prompt parametrizado para entrada de URL, papel operacional, credenciais, limites de seguranca e contexto do teste.
- Tratar credenciais como entrada de execucao, nao como conteudo persistente em handoffs ou arquivos de configuracao permanentes.
- Persistir documentacao operacional observada sob `docs/handoffs/<work_id>/` durante a execucao de cada auditoria real.

## Criterios de pronto

- Existe agente novo ou estrutura equivalente claramente dedicada a navegacao/auditoria externa com Playwright.
- Existe forma parametrizavel de informar credenciais e contexto sem hardcode sensivel no repositorio.
- A estrutura explicita o checkpoint de pausa para CAPTCHA assistido pelo usuario.
- A estrutura explicita gates de confirmacao humana antes de operacoes mutaveis.
- A estrutura define como produzir documentacao de navegacao e validacao de payloads no formato de handoff.
- A mudanca fica validada e documentada.

## Checkpoints esperados

- `docs/handoffs/cetesb-playwright-navigation-audit/00-orchestration.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/06-meta-evolution.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/09-qa-validation.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Objetivo da fase 06: criar a estrutura de agente e prompt parametrizado para navegacao/auditoria externa com Playwright, alinhada com as regras globais do repositorio e com limites explicitos para CAPTCHA assistido e operacoes sensiveis.