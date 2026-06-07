# 05 - Domain Rules

## Objetivo

Validar e consolidar as regras operacionais dos fluxos reais `manifest.receive`, `cdf.generate` e `cdf.download`, alinhando o worker ao comportamento observado nos HARs e corrigindo as pendencias de tipagem/consistencia sem deslocar regra de integracao para fora do gateway.

## Regras aplicadas

- Recebimento de manifesto:
  - a selecao do manifesto permanece com fallback por `manCodigo`, `manNumero` e `manHashCode` na pesquisa CETESB.
  - o `GET /api/mtr/manifesto/{manCodigo}` continua sendo a fonte base do payload de recebimento.
  - o payload enviado ao `POST /api/mtr/manifesto/recebimento/` passou a preservar o snapshot remoto completo do manifesto, com merge pontual do payload informado internamente.
  - `listaManifestoResiduo` passou a ser consolidada linha a linha, preservando o snapshot remoto e aplicando override apenas nos campos informados para a linha correspondente, incluindo `marQuantidadeRecebida`.
  - `paaCodigo` efetivo continua vindo do payload quando informado, com fallback para `partnerCode` da sessao ativa.
- Geracao de CDF:
  - quando `cdfPayload.listaManifesto` e informado, ele passou a funcionar como filtro de selecao sobre a lista remota retornada por `searchReceivedManifestsForCdf(...)`, em vez de ser reenviado cru no `POST` final.
  - o `POST /api/mtr/certificadoDestinacao/` agora usa manifestos do payload remoto fiel retornado pela CETESB, limitados aos manifestos selecionados pelo usuario quando houver filtro.
  - se algum manifesto explicitamente selecionado ainda nao apareceu na pesquisa remota, o worker responde como indisponibilidade temporaria para permitir retry consistente.
- Download de CDF:
  - o enqueue de `cdf.download` passou a persistir criterios opcionais de selecao (`cerHashCode`, `cerCodigo`, `cerNumero`, datas e observacao) junto do `documentId`.
  - o worker usa esses criterios ao consultar a listagem de certificados antes do download, mantendo o fallback por `cerHashCode/documentId` para impressao remota.

## Arquivos alterados

- `src/workers/operation-handlers.ts`
- `src/services/manifest-service.ts`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/05-domain-rules.md`

## Decisoes

- A fase 05 ficou restrita a regra funcional e consistencia de compilacao; nao houve mudanca de contrato HTTP, schema SQL ou endpoints remotos.
- A fidelidade do payload remoto foi priorizada nos fluxos de recebimento e geracao de CDF: o worker filtra e complementa, mas nao reconstrui o objeto remoto a partir de snapshots internos parciais.
- Falta de manifesto selecionado na pesquisa remota de CDF foi tratada como condicao retryable, porque o comportamento observado depende de consistencia temporal da listagem CETESB apos operacoes anteriores.
- Persistencia de criterios de download foi feita no payload do job para nao criar nova camada de estado fora da arquitetura atual.

## Validacoes

- Leitura dos checkpoints `01-source-validation`, `02-integration`, `03-backend-contracts` e `04-persistence-worker`.
- Revisao dos fluxos implementados em `src/workers/operation-handlers.ts`, `src/services/manifest-service.ts` e `src/gateways/cetesb-gateway.js`.
- `npm run typecheck`
  - resultado: sucesso.

## Handoff para 09-qa-validation

- Proxima fase: `09-qa-validation`
- Objetivo do QA:
  - validar recebimento com selecao por `manCodigo`, `manNumero` e `manHashCode`
  - validar recebimento com payload parcial de residuos, confirmando `marQuantidadeRecebida` no payload remoto final
  - validar geracao de CDF com lista explicita de manifestos e confirmar que o `POST` remoto recebe apenas itens presentes na pesquisa CETESB
  - validar download de CDF por `cerHashCode` puro e por criterios auxiliares com listagem previa
- Resultado esperado:
  - jobs `manifest.receive`, `cdf.generate` e `cdf.download` concluem com `payload.jobResults` consistente e PDFs persistidos corretamente