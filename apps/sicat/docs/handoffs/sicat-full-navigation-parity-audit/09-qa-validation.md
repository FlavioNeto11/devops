# 09 - QA Validation

## Objetivo da fase

Executar auditoria navegacional completa no ambiente local publicado, usando credenciais reais do usuario, com foco em:

- login e carregamento inicial;
- navegacao pelos modulos autenticados;
- filtros por data nas areas relevantes;
- troca entre todas as contas CETESB vinculadas ao login;
- registro de bugs, riscos UX e evidencias do que funcionou.

## Ambiente validado

- frontend: <http://127.0.0.1:5174>
- api: <http://127.0.0.1:8080>
- data da rodada: 2026-04-26
- abordagem: exploratoria + automacao via Playwright MCP

## Contas CETESB cobertas

1. MARDAN FIRE ENGENHARIA, CONSTRUCAO E EXTINTORES LTDA. - codigo 40110 - Destinador
2. Nova IT - codigo 176163 - Gerador
3. CG ENGENHARIA CONSTRUTORA LTDA - codigo 179808 - Gerador

## Escopo executado

### 1. Login e carregamento inicial

- login SICAT concluido com sucesso;
- redirecionamento para seletor CETESB concluido com sucesso;
- 3 contas salvas carregadas corretamente;
- ativacao de conta pela tela de sessao funcionou para as 3 contas.

### 2. Navegacao principal autenticada

Rotas validadas com sessao autenticada:

- /dashboard
- /manifestos
- /relatorios/mtrs
- /jobs
- /mtr-provisorio
- /dmr
- /dmr/pendentes
- /cdf
- /cdf/novo
- /operacao/dashboard
- /operacao/jobs
- /operacao/auditoria
- /operacao/cetesb-health
- /operacao/relatorios/mtr
- /operacao/command-center
- /sessao
- /conversacional/chat

Observacao:

- /admin/acessos redireciona silenciosamente para /dashboard quando o usuario nao tem acesso administrativo.

### 3. Navegacao basica repetida por conta CETESB

Para as 3 contas, foi repetida a carga basica com sucesso nas areas:

- dashboard;
- manifestos;
- jobs;
- mtr-provisorio;
- dmr;
- cdf;
- operacao/dashboard;
- sessao;
- chat operacional.

Nao foram encontrados bloqueios de troca de conta nem inconsistencias no cabecalho/contexto apos a alternancia. O nome da conta e o papel operacional foram atualizados corretamente apos cada ativacao.

### 4. Filtros por data validados

#### Manifestos (/manifestos)

- periodo valido curto: retornou dados na conta MARDAN;
- periodo invertido: nao houve validacao explicita; a tela aceitou a busca e retornou estado vazio;
- periodo sem resultados: estado vazio exibido;
- periodo amplo: comportamento incoerente; um recorte curto dentro do mesmo intervalo retorna dados, mas o intervalo mais amplo retorna zero resultados.

#### Relatorio MTR (/relatorios/mtrs)

- periodo valido curto: carregou dados;
- periodo invertido: nao houve validacao explicita; comportamento nao orienta o usuario sobre erro de periodo;
- periodo sem resultados: estado vazio exibido;
- periodo amplo: comportamento incoerente, com retorno vazio apesar de o recorte curto do mesmo intervalo ter dados.

#### CDF emitidos (/cdf)

- periodo valido curto: retornou certificados;
- periodo invertido: nao houve validacao de periodo; a tela respondeu como se nao existissem registros;
- periodo sem resultados: mensagem vazia coerente;
- periodo amplo: exibiu mensagem de limite de 31 dias, mas a API tambem respondeu 502 no console para a mesma chamada.

#### DMR (/dmr)

- periodo valido curto: sem dados para a conta ativa, mas a tela respondeu sem quebrar;
- periodo invertido: validacao explicita detectada;
- periodo sem resultados: estado vazio coerente;
- periodo amplo: sem dados, sem quebra.

#### MTR Provisorio (/mtr-provisorio)

- periodo valido curto: estado vazio sem quebra;
- periodo invertido: sem validacao explicita aparente;
- periodo sem resultados: estado vazio coerente;
- periodo amplo: estado vazio sem quebra.

## Findings priorizados

### Alta

1. Manifestos retorna zero no periodo amplo mesmo contendo o periodo curto que retorna dados
   - area/rota: /manifestos
   - reproducao:
     1. ativar a conta MARDAN (codigo 40110)
     2. abrir Manifestos
     3. buscar de 20/04/2026 a 26/04/2026
     4. observar retorno com dados
     5. buscar de 01/01/2026 a 26/04/2026
     6. observar retorno zerado
   - esperado: o periodo amplo deveria conter pelo menos os mesmos registros do recorte curto, salvo mensagem explicita de limite/erro
   - observado: o periodo curto retorna manifestos; o periodo amplo retorna 0 manifestos sem explicacao clara
   - confirmacao: reproduzido mais de uma vez

2. Relatorio MTR repete a incoerencia de periodo amplo x recorte curto
   - area/rota: /relatorios/mtrs
   - reproducao:
     1. ativar a conta MARDAN (codigo 40110)
     2. abrir Relatorio dos MTRs
     3. consultar 20/04/2026 a 26/04/2026
     4. consultar 01/01/2026 a 26/04/2026
   - esperado: o periodo amplo deveria conter os dados do recorte curto ou informar limite operacional de forma explicita
   - observado: o recorte curto carrega dados e o periodo amplo zera/entra em estado inconsistente de retorno
   - confirmacao: reproduzido mais de uma vez

### Media

1. Manifestos aceita periodo invertido sem orientar o usuario
   - area/rota: /manifestos
   - reproducao:
     1. abrir Manifestos
     2. informar data inicial 26/04/2026
     3. informar data final 20/04/2026
     4. aplicar filtros
   - esperado: bloquear a consulta com mensagem explicita de periodo invalido
   - observado: a tela executa a busca e cai em estado vazio, sem explicar que o periodo e invalido

2. Relatorio MTR aceita periodo invertido sem validacao clara
   - area/rota: /relatorios/mtrs
   - reproducao:
     1. abrir Relatorio dos MTRs
     2. informar data inicial maior que a final
     3. atualizar a consulta
   - esperado: validacao imediata ou mensagem clara de periodo invalido
   - observado: nao ha orientacao objetiva sobre o erro de preenchimento

3. CDF emitidos trata periodo invertido como vazio, nao como erro de entrada
   - area/rota: /cdf
   - reproducao:
     1. abrir Certificados emitidos
     2. informar data inicial 2026-04-20
     3. informar data final 2026-04-01
     4. consultar certificados
   - esperado: validacao de periodo invalido antes da consulta
   - observado: mensagem "Nenhum CDF encontrado para a janela informada"

### Baixa

1. Rota administrativa redireciona silenciosamente para o dashboard
   - area/rota: /admin/acessos
   - reproducao:
     1. acessar /admin/acessos com este usuario nao administrador
   - esperado: pagina de acesso negado ou feedback de permissao insuficiente
   - observado: redirecionamento silencioso para /dashboard

2. CDF acima de 31 dias exibe mensagem funcional, mas a API ainda devolve 502 no console
   - area/rota: /cdf
   - reproducao:
     1. abrir Certificados emitidos
     2. consultar de 2026-01-01 a 2026-04-20
   - esperado: validacao antecipada sem erro de backend ou resposta controlada sem 502
   - observado: UI mostra "O intervalo entre as datas nao pode ser maior que 31 dias.", mas o navegador registra 502 em /v1/cdf/certificates

## O que funcionou corretamente

- login SICAT e entrada no seletor CETESB;
- listagem das 3 contas salvas;
- ativacao de conta pela tela /sessao;
- atualizacao do contexto operacional apos troca de conta;
- carga basica dos modulos principais em todas as 3 contas;
- chat operacional carregando com acoes guiadas e contexto da conta ativa;
- DMR com tratamento explicito para periodo invertido;
- CDF emitidos com retorno consistente para janela curta valida e para janela sem resultados.

## Riscos residuais e limites da rodada

- MTR Provisorio e DMR nao apresentaram massa de dados relevante nas contas testadas; a validacao temporal nesses modulos focou estabilidade e resposta da interface, nao qualidade do retorno funcional.
- Nao foram executadas acoes destrutivas ou de submissao operacional real; a rodada focou navegacao, filtros e contexto de conta.

## Arquivos alterados

- docs/handoffs/sicat-full-navigation-parity-audit/09-qa-validation.md

## Handoff para a proxima fase

- proximo agente: documentador-mtr
- status: next_agent_required
- prompt sugerido: Consolidar o checkpoint docs/handoffs/sicat-full-navigation-parity-audit/09-qa-validation.md em relatorio final da rodada, preservando findings priorizados, cobertura por conta CETESB, comportamento validado e riscos residuais. Nao executar nova rodada de QA.
