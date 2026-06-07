# Catalogo inicial de telas

## Objetivo

Criar a base de conhecimento minima para o assistente interno entender a plataforma autenticada e a home publica.

## Telas atuais mapeadas

### Home publica
- Rota: `/`
- View: `HomeLandingView.vue`
- Papel para IA: discurso institucional, explicacao do produto, diferenciais

### Login SICAT
- Rota: `/login`
- Papel: autenticar usuario no ecossistema SICAT

### Selecao de conta CETESB
- Rota: `/login/cetesb`
- Papel: escolher ou cadastrar contexto operacional CETESB

### Dashboard
- Rota: `/dashboard`
- Papel: saude operacional, leitura rapida do ecossistema de jobs e manifestos

### Manifestos
- Rota: `/manifestos`
- Papel: busca, filtros, listagem, operacao ampla

### Relatorio MTR
- Rota: `/relatorios/mtrs`
- Papel: consulta consolidada e auditoria

### Novo manifesto
- Rota: `/manifestos/novo`
- Papel: fluxo guiado de criacao

### Detalhe do manifesto
- Rota: `/manifestos/:id`
- Papel: contexto profundo de manifesto, participantes, residuos, documentos e acoes

### Jobs
- Rota: `/jobs`
- Papel: fila, monitoramento, DLQ, troubleshooting

### Sessao / Conta
- Rota: `/sessao`
- Papel: contexto autenticado, conta ativa, troca de conta, diagnostico

### Administracao de acessos
- Rota: `/admin/acessos`
- Papel: perfis, permissoes, sessoes, governanca admin

## Contexto minimo que o copiloto interno deve receber por tela

### Global
- routeName
- routePath
- breadcrumbs
- pageTitle
- pageDescription
- activeAccount
- activeAccountType
- sessionContextId
- integrationAccountId

### Tela de detalhe de manifesto
- manifestId
- manifest status
- external status
- ultima acao
- jobs relacionados
- documentos disponiveis

### Tela de novo manifesto
- etapa atual
- campos preenchidos
- validacoes em andamento
- erros visiveis

## Proximos passos recomendados

Completar este catalogo com:
- componentes principais de cada tela
- areas clicaveis relevantes
- acoes primarias
- erros comuns
- explicacoes curtas por tela
