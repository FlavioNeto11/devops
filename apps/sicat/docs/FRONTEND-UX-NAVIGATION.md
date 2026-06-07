<!-- markdownlint-disable MD013 MD024 MD033 MD036 MD040 -->

# Frontend UX Navigation

## Objetivo

Documentar o mapa de navegacao do frontend autenticado do SICAT sob a base
da DL-098 e da DL-099, com foco em organizacao por modulo de produto,
composicao entre desktop/mobile e compatibilidade de rotas legadas.

Fonte declarativa canonica:

- [frontend/src/config/navigation.js](../frontend/src/config/navigation.js)

## Mapa por modulo

| Modulo | Grupos | Rotas-chave |
| --- | --- | --- |
| Operacao | Início, Operação MTR, MTR Provisório, DMR, Certificados (CDF) | `/dashboard`, `/manifestos`, `/manifestos/novo`, `/manifestos/:id`, `/relatorios/mtrs`, `/jobs`, `/mtr-provisorio`, `/mtr-provisorio/novo`, `/dmr`, `/dmr/pendentes`, `/dmr/novo`, `/cdf`, `/cdf/novo` |
| Monitoramento | Centro Operacional | `/operacao/dashboard`, `/operacao/jobs`, `/operacao/auditoria`, `/operacao/auditoria/:correlationId`, `/operacao/cetesb-health`, `/operacao/relatorios/mtr`, `/operacao/command-center` |
| Inteligencia | Chat operacional | `/conversacional/chat` |
| Administracao | Administração | `/admin/acessos` |

## Regras de composicao

- A navegacao principal e declarada por grupos em
  [frontend/src/config/navigation.js](../frontend/src/config/navigation.js).
- Cada grupo declara `module`, `kind`, metadados visuais e rotas-alvo.
- O router continua sendo a fonte autoritativa de guards; a navegacao apenas
  espelha o que faz sentido exibir.
- RBAC admin continua aplicado em duas camadas:
  filtro visual em `filterNavigationGroups({ canAccessAdmin })` e bloqueio
  real em [frontend/src/router.js](../frontend/src/router.js).

## Modulos, grupos e rotas principais

### Operacao

| Grupo | Papel | Rotas principais |
| --- | --- | --- |
| Início | Central de indicadores e atalhos | `/dashboard` |
| Operação MTR | Fluxo do parceiro para MTR | `/manifestos`, `/manifestos/novo`, `/manifestos/:id`, `/relatorios/mtrs`, `/jobs` |
| MTR Provisório | Fluxo emergencial | `/mtr-provisorio`, `/mtr-provisorio/novo`, `/mtr-provisorio/:id` |
| DMR | Declarações e pendências | `/dmr`, `/dmr/pendentes`, `/dmr/novo`, `/dmr/:dmrId` |
| Certificados (CDF) | Consulta, emissão e download de certificados | `/cdf`, `/cdf/novo` |

Nota operacional:

O modulo CDF convive com o fluxo embutido em Manifestos. O atalho em
[frontend/src/views/ManifestDetailView.vue](../frontend/src/views/ManifestDetailView.vue)
abre `/cdf/novo?manifestId=:id`, mantendo a jornada contextual sem manter o
CDF invisivel no menu.

### Monitoramento

| Grupo | Papel | Rotas principais |
| --- | --- | --- |
| Centro Operacional | Consolida observabilidade, auditoria, console de jobs e relatorios sob a otica operacional | `/operacao/dashboard`, `/operacao/jobs`, `/operacao/auditoria`, `/operacao/cetesb-health`, `/operacao/relatorios/mtr`, `/operacao/command-center` |

### Inteligencia

| Grupo | Papel | Rotas principais |
| --- | --- | --- |
| Chat operacional | Assistente conversacional autenticado | `/conversacional/chat` |

### Administracao

| Grupo | Papel | Rotas principais |
| --- | --- | --- |
| Administração | Perfis, permissoes e acessos administrativos | `/admin/acessos` |

Nota contextual:

A rota `/sessao` continua existente para troca/gestao de conta CETESB, mas
fica fora do menu principal e segue acessivel pelo user menu do shell.

## Compatibilidade de rotas legadas

As mudancas de UX desta cadeia **nao quebram URLs existentes**. Rotas que
continuam validas e relevantes para bookmarks, favoritos e acessos externos:

- `/jobs`
- `/relatorios/mtrs`
- `/operacao/jobs`
- `/operacao/relatorios/mtr`
- `/sessao`

Regra de produto:

- reorganizacao de menu nao implica remocao imediata de rota;
- compatibilidade e preservada enquanto a aprendizagem do usuario migra do
  modelo antigo para o mapa modular atual.

## Desktop e mobile

Breakpoint estrutural: **1180 px**.

- `>= 1180 px`: navegacao desktop em topbar via
  [frontend/src/components/shell/SicatNavigation.vue](../frontend/src/components/shell/SicatNavigation.vue).
- `< 1180 px`: drawer mobile via
  [frontend/src/components/shell/SicatMobileDrawer.vue](../frontend/src/components/shell/SicatMobileDrawer.vue),
  com agrupamento por modulo gerado por `groupNavigationByModule()`.

Consequencia de UX:

- no desktop, a prioridade e estabilidade visual e velocidade de acesso aos
  grupos declarativos da DL-098;
- no mobile, a prioridade e orientacao por dominio, reduzindo a leitura de
  uma lista longa e tornando a hierarquia do produto explicita.

## Componentes e utilitarios-chave

- [frontend/src/components/shell/SicatNavigation.vue](../frontend/src/components/shell/SicatNavigation.vue)
- [frontend/src/components/shell/SicatMobileDrawer.vue](../frontend/src/components/shell/SicatMobileDrawer.vue)
- [frontend/src/views/CdfListView.vue](../frontend/src/views/CdfListView.vue)
- `frontend/src/components/DestinadorCdfWorkspace.vue` (removido; CDF unificado em [frontend/src/views/CdfCreateView.vue](../frontend/src/views/CdfCreateView.vue))
- [frontend/src/lib/status-map.js](../frontend/src/lib/status-map.js)

## Direcao futura registrada

- manter `navigation.js` como fonte unica de grupos e modulos;
- evoluir a hierarquia modular para outras superficies quando houver ganho
  claro sem regredir a estabilidade do shell;
- convergir badges e estados operacionais em torno de
  [frontend/src/lib/status-map.js](../frontend/src/lib/status-map.js);
- ~~decompor `frontend/src/components/DestinadorCdfWorkspace.vue`~~ — resolvido: componente removido e CDF
  unificado na tela dedicada `frontend/src/views/CdfCreateView.vue`.