# ADR-007 — Gate regulatório bloqueante em código

Status: DECISÃO — revisar

Contexto: o checklist de tokenização instanciado por caso contém 7 itens regulatórios marcados
`requiresLegal: true` (`api/src/domain.js:188-194` — `is_security`, `offer_registration`,
`fidc_structure`, `vasp_bcb`, `kyc_aml_pldft`, `lgpd`, `taxation`; detalhados no
ESCOPO-FUNCIONAL.md §6.2). Hoje são perguntas de levantamento: nascem `nao_avaliado` e não travam
nada. A evolução para marketplace (fases 0–4 do [09-roadmap](../09-roadmap.md)) constrói emissão,
portais e receita em regime de demonstração — e a fronteira entre demonstração e operação real é
exatamente o enquadramento regulatório, que hoje não tem nenhum enforcement.

Decisão: elevar os 7 itens a **bloqueantes formais de plataforma**: entidade `regulatory_gate_item`
(uma linha por chave, global — não por caso) que só sai de `pending` com **parecer externo anexado
de profissional habilitado e identificado**; aprovação do conjunto registrada em
`regulatory_gate_approval` (append-only, com snapshot dos pareceres); flag global
`go_live_enabled` **derivado** (nunca editável) que permanece `false` até a aprovação completa e,
enquanto `false`, o besc-api **recusa em código** (guard fail-closed, `403`): (1) marcar
investidor como apto a operar valor real; (2) remover o watermark de demonstração; (3) emitir
fatura fora do piloto; (4) emissão on-chain com valor real. Reabertura de qualquer item ou
revogação da aprovação derruba o flag e re-trava as operações imediatamente. Especificação
completa em [10-gate-regulatorio](../10-gate-regulatorio.md).

Alternativas rejeitadas:
- **Gate processual/manual sem enforcement** (checklist num doc/planilha + disciplina do operador):
  num sistema de operador único não há segundo par de olhos — a trava que protege contra o erro ou
  a pressa é justamente a que o código impõe; um processo sem enforcement é indistinguível de não
  ter gate.
- **Manter só o checklist por caso** (status quo): o enquadramento é da plataforma/produto, não de
  cada dossiê; 7 respostas `nao_avaliado` por caso jamais bloqueariam a operação real.
- **Flag manual por env/config** (`GO_LIVE=true` no Deployment): liga/desliga sem evidência, sem
  trilha e sem vínculo com os pareceres; o Argo aplicaria a mudança sem nenhum registro do porquê.

Consequências: nenhuma operação de valor real é alcançável antes dos pareceres — o risco de
"escorregar para produção" vira erro de compilação institucional, não deslize operacional; a
decisão de go-live fica reconstituível para sempre (snapshot dos pareceres na aprovação, tudo na
trilha hash-chain do doc [07-trilha-auditoria](../07-trilha-auditoria.md)); o desenvolvimento das
fases 0–4 fica desacoplado do calendário jurídico (tudo funciona em demonstração). Custo: mais um
fluxo administrativo (registro de pareceres) e a lista de operações travadas precisa ser mantida
fechada e testada — item novo de valor real que nasça sem `requireGoLive()` seria furo de gate
(mitigação: teste de cobertura da lista + revisão de PR).

Revisão pendente: **contratação da assessoria jurídica/regulatória e emissão dos 7 pareceres**
(operador + assessoria a contratar — pode iniciar imediatamente, em paralelo às fases). Com a
assessoria: confirmar a composição da lista de operações travadas e definir a política de
validade/reavaliação periódica dos pareceres. Prazos de retenção por categoria (PLD-FT/COAF ×
LGPD) — definir com jurídico (referenciado por 07-trilha-auditoria §8 e Apêndice B
kyc_record.retention_until).
