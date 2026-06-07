# 00 - Orchestration

## Demanda original (resumo)

Executar uma auditoria real de navegacao na plataforma `https://mtr.cetesb.sp.gov.br/` usando automacao com Playwright e dois perfis operacionais fornecidos pelo usuario em runtime, para construir entendimento amplo da plataforma, documentar telas, componentes, acoes, requests/payloads relevantes e consolidar um roadmap completo da plataforma. A execucao deve respeitar o checkpoint humano de CAPTCHA e nao pode persistir credenciais no repositório.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "cetesb-platform-complete-navigation"
  intent: "validate"
  complexity: "complex"
  domains:
    - "source-validation"
    - "docs"
  first_agent: "auditor-navegacao-externa-mtr"
  phase_sequence:
    - phase: "01-source-validation"
      agent: "auditor-navegacao-externa-mtr"
      required: true
      reason: "A demanda depende de navegacao real no sistema externo, captura de requests/payloads, checkpoints humanos e documentacao operacional detalhada."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Apos a navegacao validada, consolidar documentacao completa e roadmap da plataforma."
```

## Parametros sensiveis em runtime

- O usuario forneceu dois perfis operacionais para a sessao atual: gerador e destino final.
- Credenciais devem ser usadas apenas em runtime e jamais persistidas em handoffs, docs, logs versionados ou arquivos de configuracao.
- Qualquer artefato persistido deve mascarar login, CPF, senha, token e cookies.

## Requisitos obrigatorios

- Navegar na plataforma real com Playwright.
- Cobrir o entendimento mais amplo possivel da plataforma sem executar mutacoes irreversiveis sem confirmacao explicita do usuario.
- Documentar telas, componentes, acoes, requests, payloads, checkpoints humanos e risco operacional.
- Construir um roadmap completo da plataforma com base na navegacao observada.
- Ao encontrar CAPTCHA, pausar e depender de apoio do usuario para continuidade.
- Se a janela/browser da sessao orquestrada for fechada ou se houver checkpoint humano pendente, manter o workstream aberto e retornar no chat apenas uma mensagem objetiva de `aguardando desbloqueio do usuario`, sem encerrar nem tratar isso como conclusao definitiva do fluxo.

## Limites operacionais

- Nao persistir credenciais.
- Nao contornar CAPTCHA.
- Nao confirmar operacoes mutaveis ou irreversiveis sem permissao explicita durante a sessao.
- Telas sensiveis podem ser abertas e exploradas ate o ponto imediatamente anterior ao envio/confirmacao final.

## Checkpoints esperados

- `docs/handoffs/cetesb-platform-complete-navigation/00-orchestration.md`
- `docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md`
- `docs/handoffs/cetesb-platform-complete-navigation/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `auditor-navegacao-externa-mtr`.

Objetivo da fase 01: executar navegacao real com os perfis fornecidos em runtime, registrar o checkpoint humano de CAPTCHA quando ele ocorrer, mapear requests/payloads/telas/componentes/acoes e produzir a trilha base para a documentacao final e o roadmap da plataforma.

Politica adicional de retomada: bloqueio por CAPTCHA ou fechamento da janela nao encerra a cadeia; o estado correto e aguardar liberacao do usuario no chat e retomar a mesma fase assim que houver nova sessao disponivel.

## Continuacao enriquecida solicitada pelo usuario

Depois do mapa inicial e da cobertura autenticada dos perfis `gerador` e `destino final`, a mesma fase pode ser retomada para enriquecimento iterativo do mapa com foco em:

- filtros por data e combinacoes de filtros em listagens e relatorios;
- popups, modais e visualizacao de manifesto/CDF quando houver massa disponivel;
- consultas reais com historico e tabelas preenchidas;
- downloads seguros, impressoes e anexos nao mutaveis quando existentes;
- comparacao mais detalhada de comportamento entre listas vazias e listas com dados.

Essa continuacao deve reutilizar o mapa ja documentado para ir direto aos fluxos ricos, evitando repeticao de navegacao basica e mantendo os mesmos limites operacionais: sem persistir segredos, sem contornar checkpoint humano e sem executar mutacoes irreversiveis sem autorizacao explicita.