# Technical Decisions — DL-036

## 1) Aderência ao HAR sem quebrar contrato interno
**Decisão:** manter integração frontend através dos endpoints internos `/v1/*`, reproduzindo a mesma sequência funcional observada no HAR.

**Justificativa:**
- O HAR é fonte de verdade para a ordem operacional.
- O backend já encapsula a complexidade CETESB em contratos internos estáveis.
- Evita acoplamento do frontend a endpoints externos `mtrr.cetesb.sp.gov.br`.

## 2) Reuso obrigatório de sessão/contexto autenticado
**Decisão:** usar `integrationAccountId` e `sessionContextId` do estado autenticado para criação/submissão.

**Justificativa:**
- Reduz falhas por bootstrap incompleto de sessão real.
- Mantém rastreabilidade e consistência com os fluxos já existentes.

## 3) Componente dedicado para criação (`ManifestCreateForm`)
**Decisão:** implementar formulário em componente isolado, integrado ao `ManifestsView`.

**Justificativa:**
- Preserva coesão e legibilidade da tela principal.
- Facilita evolução de UX sem impactar a listagem/detalhe já existentes.

## 4) Busca de parceiros com fallback de papéis
**Decisão:** buscar com papéis alternativos (`transportador`/`carrier`, `destinador`/`receiver`).

**Justificativa:**
- Maior robustez contra variações de role esperadas entre camadas.
- Aderente ao comportamento observado no gateway CETESB.

## 5) Submissão opcional em duas etapas
**Decisão:** separar ações de “criar rascunho” e “criar e submeter”.

**Justificativa:**
- Respeita fluxo operacional real (salvar antes de enviar).
- Permite uso em cenários de revisão antes da submissão.
