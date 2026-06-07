# Validation Report - DL-050

## Validações executadas

### 1) Worker submit (área alterada)
- **Comando:** `node --test tests/worker/manifest-submit-handler.test.js`
- **Resultado:** ✅ 7/7 testes passando

### 2) Frontend build
- **Comando:** `cd frontend && npm run build`
- **Resultado:** ✅ build concluído com sucesso

## Observações de ambiente
- Testes de integração de listagem que consultam CETESB real falharam com `401` de autenticação no ambiente atual.
- Esses erros são de dependência externa/credencial e não invalidam a correção local aplicada ao fluxo.

## Revalidação pós-feedback do usuário
- Ajustes aplicados para regressões de UX/fluxo:
	- data padrão restaurada para hoje;
	- `forceSync=true` voltou a reportar erro CETESB em vez de mascarar com sucesso local;
	- botões de ação bloqueados para drafts/processando/sem hash externo.
- Evidências:
	- `node --test tests/worker/manifest-submit-handler.test.js` ✅ (7/7)
	- `cd frontend && npm run build` ✅

## Revalidação incremental (badge clicável de cache)
- Ajustes aplicados:
	- inclusão de `fallbackAt` no `syncWarning` do backend;
	- persistência de `syncWarningMeta` na store;
	- badge `Dados em cache` clicável com modal de detalhes.
- Evidência:
	- `cd frontend && npm run build` ✅

## Revalidação incremental (HAR + Ressinc. estrito)
- Ajustes aplicados:
	- `searchManifests` com refresh forçado de sessão em `500` persistente antes do erro final;
	- dashboard enviando `sessionContextId` em `listManifests`.
- Evidências:
	- `node --test tests/unit/cetesb-gateway.test.js` ✅ (9/9, incluindo novo teste de refresh em `searchManifests`)
	- `npx playwright test tests/ui/manifests-resync.spec.js --reporter=line` ✅ (1/1)

## Revalidação via Playwright MCP (ambiente real)
- Fluxo executado: login SICAT → seleção de conta CETESB → tela de manifestos → clique em `Ressinc. CETESB`.
- Resultado observado:
	- request `GET /v1/manifestos?...forceSync=true...` com `sessionContextId` presente ✅
	- resposta `502` com detalhe remoto `A CETESB retornou 500 para GET /api/mtr/pesquisaManifesto/.../0/0`.
- Contraprova adicional via MCP (fetch direto): mesmo erro ao variar `status=0..4` e janela de datas, indicando indisponibilidade/erro externo persistente na CETESB para a conta/período testados.

## Revalidação incremental (evidência curl CETESB + ajuste de janela)
- Nova evidência recebida: chamada manual direta para `https://mtrr.cetesb.sp.gov.br/api/mtr/pesquisaManifesto/176163/26/8/12-03-2026/13-03-2026/0/all` retornou sucesso com `erro=false` e `objetoResposta` populado.
- Ajuste aplicado:
	- `forceSync=true` sem datas explícitas passou a usar janela padrão curta configurável (`CETESB_MANIFEST_FORCE_SYNC_DAYS_BACK`, default `1`).
- Evidência de regressão local:
	- `node --test tests/unit/cetesb-gateway.test.js` ✅ (9/9)

## Evidência funcional coletada no banco
- Verificado manifesto em estado `submitted` sem `manNumero/manCodigo` pré-correção, confirmando o falso positivo reportado.
- Verificado job informado pelo usuário em `job_dead_letter_queue` com operação `manifest.create` (registro de DLQ existente no ambiente).

## Revalidação incremental (submit hash-only)
- Evidência de diagnóstico (`localhost.har` + logs):
	- `POST /v1/manifestos/{id}/submit` retorna `202` com `jobId`;
	- worker conclui com sucesso (`job ... concluído`);
	- manifesto permanecia em `processing` por regra de promoção dependente de `manCodigo/manNumero`.
- Ajuste aplicado:
	- promoção para `submitted` quando CETESB retornar `manHashCode` (ACK de submissão) mesmo sem número/código imediato.
- Validação automatizada:
	- `node --test tests/worker/manifest-submit-handler.test.js` ✅ (8/8, incluindo cenário novo de hash-only)
