# 00 - Orchestration

## Demanda resumida

Revalidar a situacao atual de `docs/` e `docs/copilot/`, especialmente a pasta historica `docs/copilot/handoffs/`, e reorganizar a documentacao para refletir a estrutura vigente do repositório e da camada Copilot. O objetivo e remover incoerencias estruturais, consolidar materiais obsoletos, mover documentos para destinos coerentes e deixar a discoverability alinhada ao modelo atual.

## Classificacao

```yaml
orchestration:
  work_id: "docs-structure-current-reorg"
  intent: "document"
  complexity: "complex"
  domains:
    - "docs"
    - "meta"
    - "qa"
  first_agent: "documentador-mtr"
  phase_sequence:
    - phase: "10-documentation-reorg"
      agent: "documentador-mtr"
      required: true
      reason: "auditar e reorganizar documentos, guias e artefatos historicos para a estrutura atual"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar coerencia estrutural, discoverability e ausencia de links quebrados apos a reorganizacao"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar mapa do que foi reorganizado, o que permaneceu historico e a nova leitura canônica"
```

## Fontes de verdade iniciais

- `docs/`
- `docs/copilot/`
- `docs/copilot/handoffs/`
- `docs/handoffs/`
- `.github/instructions/documentation.instructions.md`
- `docs/copilot/README.md`
- `docs/copilot/14-estrutura-copilot.md`

## Criterios de pronto

- `docs/copilot/` passa a refletir a estrutura atual, sem mistura confusa de trilha canônica e materiais soltos legados
- materiais antigos em `docs/copilot/handoffs/` passam a fazer sentido como guias, artefatos por decisao ou historico explicitamente mantido
- `docs/` raiz deixa de concentrar documentos avulsos que hoje ja deveriam estar absorvidos por trilhas canônicas, historico ou guias mais atuais
- a discoverability em READMEs aponta para a nova organizacao de forma clara
- links e referencias internas permanecem validos

## Checkpoints esperados

- `docs/handoffs/docs-structure-current-reorg/10-documentation-reorg.md`
- `docs/handoffs/docs-structure-current-reorg/09-qa-validation.md`
- `docs/handoffs/docs-structure-current-reorg/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `documentador-mtr`.

Objetivo: auditar `docs/` e `docs/copilot/`, identificar o que esta canônico, legível e útil na estrutura atual, e aplicar a reorganização documental necessária com o menor atrito possível para discoverability e rastreabilidade histórica.