# 06 - Frontend UX

## Objetivo da fase

Corrigir o menu de acoes da tela de manifestos para que ele seja renderizado fora do container com overflow da grid, sem clipping visual e sem interferencia no scroll da tabela.

## Arquivos analisados

- `frontend/src/views/ManifestsView.vue`
- `frontend/tests/ui/manifests-resync.spec.js`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/00-orchestration.md`

## Causa raiz

- O menu de acoes da linha era implementado com `details/summary` dentro da celula da tabela.
- A lista do menu usava posicionamento absoluto relativo ao proprio item da grid, portanto continuava presa ao mesmo contexto de overflow horizontal da tabela (`.manifests-table-shell`).
- Como resultado, o menu era cortado pelo container rolavel e passava a competir visualmente com a area de scroll da grid.

## Delta da segunda rodada

### Causa raiz complementar da segunda rodada

- A primeira correcao removeu o clipping via `Teleport`, mas o calculo vertical continuou com heuristica incompleta.
- O menu so invertia para cima quando havia simultaneamente falta de espaco abaixo e mais espaco acima do que abaixo.
- Em triggers proximos ao rodape, isso mantinha o popover abrindo para baixo em cenarios sem altura util suficiente, deixando parte do menu fora da viewport.

### Decisoes de implementacao da segunda rodada

- Ajustar o calculo vertical para decidir a direcao pelo espaco util da viewport, priorizando abertura para cima quando a altura natural do menu nao couber abaixo e houver melhor area acima.
- Limitar a altura maxima do popover ao espaco disponivel na direcao escolhida e habilitar scroll interno do proprio menu para manter todas as acoes acessiveis.
- Expor a direcao resolvida no DOM com `data-direction` para validacao automatizada sem acoplar o teste a coordenadas fragis.

## Delta da terceira rodada

### Causa raiz complementar da terceira rodada

- O fechamento por clique externo dependia de `mousedown` em bubbling no `window`, o que deixava o popover suscetivel a cenarios em que a interacao externa nao chegava de forma confiavel ao listener global apos o `Teleport` e a mudanca de foco para dentro do menu.
- A deteccao de origem do evento tambem estava limitada a `target/contains`, sem usar `composedPath()`, reduzindo a robustez da identificacao entre clique interno e clique realmente externo.

### Decisoes de implementacao da terceira rodada

- Trocar o listener global de fechamento externo para `pointerdown` em fase de captura no `document`, cobrindo mouse e outros ponteiros antes de qualquer interrupcao de propagacao.
- Resolver a origem do evento via `composedPath()` com fallback para `contains`, preservando interacoes no trigger e no popover teletransportado e fechando apenas cliques externos.
- Persistir um teste UI dedicado para clique fora do popover e rerodar a regressao focada de overflow, abertura para cima e fechamento por `Escape`.

## Delta da quarta rodada

### Causa raiz complementar da quarta rodada

- A validacao anterior de abertura para cima nao reproduzia o caso real da tela porque a pagina de manifestos rola dentro de `.sicat-page`, nao na `window`.
- No caso real com o container scrollado ate a faixa inferior visivel, a primeira medicao do popover teletransportado podia ocorrer antes de a altura util do menu estar estabilizada, produzindo `menuHeight = 0`.
- Com isso, a view resolvia `data-direction="up"`, mas fixava `top` praticamente na linha do trigger; visualmente o menu ainda crescia para baixo e ficava parcialmente inacessivel perto do rodape visivel.

### Decisoes de implementacao da quarta rodada

- Reproduzir o defeito com Playwright MCP no scroll real de `.sicat-page`, confirmando o caso em que o menu permanecia com `bottom` fora da area visivel apos abrir.
- Medir o popover somente apos frames adicionais de layout quando a altura inicial vier zerada, evitando posicionamento com geometria incompleta do conteudo teletransportado.
- Calcular os limites seguros do popover a partir da area visivel real da tela, intersectando viewport, `.sicat-page` e a barra superior sticky, para que a abertura para cima respeite o espaco efetivamente utilizavel.
- Manter o menu oculto ate receber coordenadas finais validas, eliminando o frame inicial incorreto que fazia o popover parecer abrir para baixo.

## Delta da quinta rodada

### Causa raiz complementar da quinta rodada

- O erro de runtime restante nao estava mais na geometria em si, mas no uso inconsistente do `ref` do popover teletransportado.
- Em parte do fluxo, o codigo ainda consumia `manifestActionsMenuRef.value` cru durante o fechamento por clique externo, mesmo apos a introducao da normalizacao do elemento teletransportado.
- Como refs de elementos dentro de `Teleport` e `v-for` podem chegar como valor bruto nao-HTMLElement no ciclo inicial, a deteccao externa ficava sujeita a falha de runtime e interrompia a reposicao/fechamento subsequente do menu.

### Decisoes de implementacao da quinta rodada

- Reutilizar `resolveManifestActionsMenuElement()` tambem no handler global de `pointerdown`, garantindo um `HTMLElement` real antes de avaliar `composedPath()` ou `contains()`.
- Manter a logica de geometria da quarta rodada intacta e validar novamente no browser com o scroll real de `.sicat-page`, confirmando que o menu abre acima do trigger e permanece totalmente dentro da area visivel.
- Encerrar a fase com regressao Playwright focada e build de producao do frontend.

## Decisoes de implementacao

- Substituir o `details/summary` por um botao controlado por estado na propria view.
- Renderizar o menu com `Teleport` para `body`, removendo o popover da arvore DOM do container com overflow.
- Posicionar o menu com `position: fixed` a partir do `getBoundingClientRect()` do botao trigger.
- Recalcular a posicao em `resize` e `scroll`, incluindo scrolls aninhados.
- Fechar o menu em clique externo e `Escape`, preservando usabilidade e foco do trigger ao fechar via teclado.

## Arquivos alterados

- `frontend/src/views/ManifestsView.vue`
- `frontend/tests/ui/manifests-resync.spec.js`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/06-frontend-ux.md`

## Validacoes executadas nesta fase

- `Playwright MCP`: reproducao manual em `http://127.0.0.1:5174/manifestos` com `.sicat-page` scrollado ate o trigger baixo, medindo `triggerRect`, `scrollerRect` e `menuRect` no caso real.
- `npm run test:ui -- tests/ui/manifests-resync.spec.js --grep "menu de ações do manifesto abre fora do container com overflow da grid|menu de ações do manifesto abre para cima quando não há espaço útil abaixo do trigger|menu de ações do manifesto fecha com Escape sem perder usabilidade|manifesto impresso permanece cancelável e com status visual de sucesso"`
- `npm run test:ui -- tests/ui/manifests-resync.spec.js --grep "menu de ações do manifesto abre fora do container com overflow da grid|menu de ações do manifesto abre para cima quando não há espaço útil abaixo do trigger|menu de ações do manifesto fecha ao clicar fora do popover|menu de ações do manifesto fecha com Escape sem perder usabilidade" --reporter=line`
- `Playwright MCP`: reproducao manual final em `http://127.0.0.1:5175/manifestos` com mocks da view, `.sicat-page` scrollado ate o rodape util e verificacao de `data-direction="up"`, `menu.bottom < trigger.top`, `menu.top >= scroller.top + 8` e `menu.bottom <= scroller.bottom - 8`.
- `npm run test:ui -- tests/ui/manifests-resync.spec.js --grep "menu de ações do manifesto abre fora do container com overflow da grid|menu de ações do manifesto abre para cima quando não há espaço útil abaixo do trigger|menu de ações do manifesto fecha ao clicar fora do popover|menu de ações do manifesto fecha com Escape sem perder usabilidade|manifesto impresso permanece cancelável e com status visual de sucesso" --reporter=line`
- `npm run build`

## Resultado das validacoes

- Primeira rodada validada previamente para escape do overflow.
- Segunda rodada validada com sucesso no cenário focado de flip vertical e nas verificacoes de nao regressao do menu.
- Terceira rodada validada com sucesso no cenário focado de clique externo e nas regressoes de overflow, abertura para cima e fechamento por `Escape` (`4 passed`).
- Quarta rodada reproduziu a falha real no browser com `.sicat-page` scrollado: o menu marcava direcao para cima, mas permanecia com `bottom` fora da area visivel por causa de medicao inicial zerada do Teleport. A regressao automatizada foi ajustada para cobrir esse caminho real.
- Quinta rodada validada com sucesso no browser via Playwright MCP: `scrollTop = 1641`, `data-direction = up`, `menu.top = 669`, `menu.bottom = 873`, `trigger.top = 881.17`, `scroller.top = 76` e `scroller.bottom = 945`, mantendo o popover integralmente dentro da area util e acima do trigger.
- Regressao Playwright final concluida com sucesso (`5 passed`, 7.9s).
- Build final do frontend concluido com sucesso em producao (`vite build`); permaneceu apenas o warning conhecido de chunk acima de `500 kB`, sem erro de compilacao.

## Handoff para proxima fase

Proximo agente obrigatorio: `tester-qa-mtr`.

Objetivo da fase 09: validar o comportamento corrigido do menu de acoes na tela de manifestos, confirmando que ele nao fica mais preso ao overflow da grid, que abre para cima quando faltar area util abaixo, que fecha ao clicar fora e que as acoes continuam acessiveis.
