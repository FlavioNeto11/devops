# ZapBridge — Documento Funcional do MVP

> Cliente mobile de mensageria que conecta à conta de WhatsApp **do próprio usuário** via
> [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).
> **Uso legítimo:** somente a conta autorizada pelo próprio usuário (QR Code / pairing code).
> **Sem** WhatsApp Business API, **sem** scraping indevido, **sem** envio em massa/spam.
> **Aviso de marca:** experiência apenas *inspirada* em mensageria moderna. Não usar marca,
> logo, nome ou identidade visual oficiais do WhatsApp.

---

## 1. Nome do sistema

**ZapBridge** — "a ponte entre você e suas conversas".
- Backend: `zapbridge-server`
- App mobile: `zapbridge-app`
- Codinome técnico: `zapbridge`

## 2. Descrição do sistema

O ZapBridge é um aplicativo mobile (Android e iOS) que funciona como um **cliente alternativo de
mensageria**. O usuário cria uma conta local no app, conecta sua própria conta de WhatsApp através
de um QR Code (ou pairing code) lido pelo aparelho dono da conta, e passa a **visualizar, organizar
e responder** suas conversas por uma interface moderna. Um backend Node.js/TypeScript mantém a
sessão ativa usando a biblioteca Baileys, persiste conversas e mensagens, e entrega tudo em tempo
real ao app por REST + WebSocket. O objetivo do MVP é uma experiência **fluida, bonita e estável**
para enviar/receber texto e mídias básicas, com sincronização de chats, contatos e grupos.

## 3. Perfis de usuário

| Perfil | Descrição | Permissões |
|---|---|---|
| **Usuário final** | Dono da conta no app e da conta de WhatsApp conectada. | Cadastrar-se, logar, conectar/desconectar WhatsApp, ver e responder conversas, enviar/receber mídia, ajustar preferências. |
| **Administrador local (opcional)** | Quem opera/instala o backend (self-host). Não é um papel dentro do app no MVP. | Configurar variáveis de ambiente, subir/derrubar o servidor, limpar dados, inspecionar logs. Sem painel administrativo no MVP. |

> No MVP **não** há multiusuário avançado nem hierarquia de papéis dentro do app. Cada usuário
> enxerga apenas a própria sessão e seus próprios dados.

## 4. Jornada principal do usuário

1. **Primeiro acesso** — abre o app, vê a Splash, segue para Login/Cadastro. Cria conta com
   e-mail + senha + nome de exibição.
2. **Conexão com WhatsApp** — na Home/tela de conexão, toca em "Conectar WhatsApp". O backend
   inicia a sessão Baileys e envia um QR Code (ou pairing code). O usuário abre o WhatsApp no
   celular dono da conta → *Aparelhos conectados* → escaneia o QR.
3. **Sincronização** — após conectar, o backend recebe contatos, chats e histórico recente,
   persiste e emite eventos. O app mostra a lista de conversas se preenchendo.
4. **Uso diário** — abre o app (sessão do app persistida), vê a lista atualizada em tempo real,
   abre conversas, lê e responde.
5. **Envio e recebimento** — digita e envia texto/mídia (aparece como *pendente* → *enviada*);
   mensagens novas chegam em tempo real via WebSocket, atualizando a conversa e o contador de
   não lidas.
6. **Desconexão** — em Configurações, "Desconectar WhatsApp" encerra a sessão Baileys; o app volta
   ao estado "desconectado" e pode reconectar com novo QR.

## 5. Telas do aplicativo mobile

> Para cada tela: **Objetivo · Componentes · Ações · Loading · Erro · Vazio.**

### 5.1 Splash
- **Objetivo:** identidade visual + decidir rota inicial (logado? sessão WhatsApp?).
- **Componentes:** logo/nome, indicador de carregamento.
- **Ações:** nenhuma (automática).
- **Loading:** spinner enquanto valida token no SecureStore e pinga `/me`.
- **Erro:** se backend indisponível → cai em tela de erro com "Tentar novamente".
- **Vazio:** n/a.

### 5.2 Login / Cadastro
- **Objetivo:** autenticar no app.
- **Componentes:** abas Login/Cadastro, inputs (e-mail, senha, nome no cadastro), botão primário,
  link alternar modo, mensagens de validação.
- **Ações:** registrar, logar, alternar modo.
- **Loading:** botão com spinner durante request.
- **Erro:** "E-mail ou senha inválidos", "E-mail já cadastrado", "Sem conexão com o servidor".
- **Vazio:** n/a.

### 5.3 Home / Status de conexão
- **Objetivo:** ponto central pós-login; mostra estado da sessão WhatsApp e atalho para conectar.
- **Componentes:** `ConnectionBanner` (connecting/qr/connected/disconnected), botão "Conectar
  WhatsApp", atalho para lista de conversas, número conectado quando houver.
- **Ações:** conectar, ir para conversas, abrir configurações.
- **Loading:** banner "Conectando…".
- **Erro:** banner vermelho "Falha na conexão — tentar novamente".
- **Vazio:** estado "Nenhuma conta conectada — conecte para começar".

### 5.4 Tela de QR Code / Pairing
- **Objetivo:** exibir QR (ou pairing code) e refletir transição para conectado.
- **Componentes:** QR renderizado (dataURL/SVG), instruções passo a passo, alternativa "Usar código
  de pareamento" (informa número, recebe código de 8 dígitos), botão cancelar.
- **Ações:** atualizar QR (auto), alternar para pairing, cancelar.
- **Loading:** "Gerando QR…" até o primeiro `session.qr.updated`.
- **Erro:** "QR expirado — gerando novo", "Falha ao iniciar sessão".
- **Vazio:** n/a (sempre há QR ou loading).

### 5.5 Lista de conversas
- **Objetivo:** listar chats recentes e permitir abrir/buscar.
- **Componentes:** barra de busca, lista de `ChatListItem` (avatar, nome, prévia da última msg,
  horário, badge de não lidas, ícone de grupo), pull-to-refresh.
- **Ações:** abrir conversa, buscar, refresh.
- **Loading:** `SkeletonList` enquanto carrega.
- **Erro:** "Não foi possível carregar conversas — tentar novamente".
- **Vazio:** "Nenhuma conversa ainda. Quando sincronizar, suas conversas aparecem aqui."

### 5.6 Tela de conversa
- **Objetivo:** ler histórico e trocar mensagens.
- **Componentes:** header (avatar/nome, status de conexão), lista invertida de `MessageBubble`
  (enviadas/recebidas, data/hora, status, mídia, citação), `MessageInput` fixo (texto, anexo,
  enviar), botão "carregar mais antigas".
- **Ações:** enviar texto/mídia, anexar, responder (quoted), reenviar com falha, paginação, marcar
  como lida ao abrir.
- **Loading:** skeleton de bolhas; spinner ao paginar.
- **Erro:** bolha com ícone de falha + "Tentar novamente"; banner se sessão cair.
- **Vazio:** "Nenhuma mensagem nesta conversa ainda."

### 5.7 Detalhes do contato / grupo
- **Objetivo:** mostrar metadados do contato ou grupo.
- **Componentes:** avatar grande, nome/assunto, número (contato), descrição e lista de
  participantes com badge de admin (grupo).
- **Ações:** voltar; (futuro) silenciar/limpar.
- **Loading:** skeleton de cabeçalho/lista.
- **Erro:** "Não foi possível carregar os detalhes."
- **Vazio:** grupo sem descrição → oculta seção.

### 5.8 Pesquisa
- **Objetivo:** localizar conversas por nome ou conteúdo.
- **Componentes:** input de busca, resultados agrupados (conversas / mensagens).
- **Ações:** digitar, abrir resultado.
- **Loading:** spinner inline (debounce).
- **Erro:** "Falha na busca."
- **Vazio:** "Nenhum resultado para \"…\"".

### 5.9 Configurações
- **Objetivo:** gerenciar sessão e preferências.
- **Componentes:** número conectado, status da sessão, botão "Desconectar WhatsApp", "Limpar dados
  locais", seletor de tema (sistema/claro/escuro), seção "Sobre".
- **Ações:** desconectar, limpar dados, trocar tema, logout do app.
- **Loading:** spinner ao desconectar.
- **Erro:** "Falha ao desconectar — tentar novamente."
- **Vazio:** n/a.

### 5.10 Sessões conectadas
- **Objetivo:** ver o dispositivo/conexão atual (no MVP, 1 sessão).
- **Componentes:** card com número, status, `lastConnectedAt`, ação encerrar.
- **Ações:** encerrar sessão.
- **Loading:** skeleton de card.
- **Erro:** "Não foi possível obter o status."
- **Vazio:** "Nenhuma sessão ativa."

### 5.11 Erros de conexão
- **Objetivo:** comunicar falha de rede/sessão de forma clara e acionável.
- **Componentes:** ilustração, mensagem, botão "Tentar novamente", link "Ver status".
- **Ações:** retry, ir para status.
- **Loading:** durante o retry.
- **Erro:** é a própria tela.
- **Vazio:** n/a.

### 5.12 Mídia / anexo (visualizador + seletor)
- **Objetivo:** anexar mídia ao enviar e visualizar mídia recebida.
- **Componentes:** seletor (galeria/câmera/arquivo), preview de imagem, player de vídeo/áudio
  (`expo-av`), abrir documento, indicador de download.
- **Ações:** selecionar, enviar, baixar, abrir, salvar.
- **Loading:** progresso de upload/download.
- **Erro:** "Mídia indisponível ou expirada", "Falha no envio da mídia".
- **Vazio:** "Sem pré-visualização disponível."

## 6. Funcionalidades obrigatórias do MVP (detalhe funcional)

### Autenticação do app
- **Cadastro simples:** e-mail + senha (hash bcrypt) + nome de exibição.
- **Login:** valida credenciais, retorna JWT.
- **Logout:** invalida token no cliente (remove do SecureStore); backend é stateless quanto ao JWT.
- **Persistência de sessão:** token guardado no SecureStore; revalidado na Splash via `/me`.
- **Recuperação simples:** no MVP, reset manual (sem e-mail). Campo "Esqueci a senha" pode apenas
  orientar contato com o admin local (placeholder).

### Conexão com WhatsApp via Baileys
- **Criar sessão:** `useMultiFileAuthState('storage/auth/<userId>')`, abre socket Baileys.
- **Exibir QR Code:** evento `connection.update` com `qr` → gera dataURL → emite `session.qr.updated`.
- **Pairing code (opcional):** `sock.requestPairingCode(phoneNumber)` quando o usuário escolhe.
- **Detectar conectado/desconectado:** `connection.update` (`open`/`close`).
- **Reconectar:** em `close` reconectável (não `loggedOut`), recria o socket reaproveitando as
  credenciais salvas; no boot do servidor, recarrega sessões previamente conectadas.
- **Encerrar sessão:** `sock.logout()` + remoção da pasta de credenciais → status `disconnected`.
- **Salvar credenciais com segurança:** pasta de auth por usuário, fora do versionamento; chaves
  nunca expostas ao app; comunicação app↔backend por HTTPS em produção.

### Sincronização
- **Contatos:** evento `contacts.upsert`/`contacts.update` → upsert em `Contact`.
- **Chats:** `chats.set`/`chats.upsert` → upsert em `Chat`, emite `chats.synced`/`chat.updated`.
- **Mensagens:** `messages.upsert` (notify/append) → persiste `Message` (+`Media`) **antes** de emitir.
- **Atualização em tempo real:** WebSocket empurra `chat.updated`/`message.received`.
- **Mensagens recebidas com app fechado:** o backend continua recebendo e persistindo; ao reabrir, o
  app busca via REST (deltas por `lastMessageAt`/cursor) e religa o WebSocket.

### Lista de conversas
- Foto/nome do contato ou grupo · última mensagem (prévia) · horário · badge de não lidas · ícone de
  grupo · ordenação por `lastMessageAt` desc · busca por nome/conteúdo.

### Tela de conversa
- Bolhas enviadas/recebidas · data/hora · status (pending/sent/delivered/read/error) · campo de
  digitação · botão enviar · scroll automático para a última · carregar antigas ao rolar (cursor) ·
  estados pendente/enviada/erro visíveis.

### Envio de mensagens
- Texto · imagem · vídeo curto · áudio/arquivo (se viável) · responder mensagem específica (quoted) ·
  tratamento de erro · reenvio de falha (mantém a mensagem local `error` com ação de retry).

### Recebimento em tempo real
- Baileys recebe no backend → persiste → emite `message.received` → app atualiza conversa aberta,
  contador de não lidas e prévia da última mensagem na lista.

### Contatos e grupos
- Listar contatos conhecidos · listar grupos · abrir conversa com contato existente · ver
  participantes de grupo (quando disponível via `groupMetadata`) · foto/nome quando disponível.

### Mídia
- Baixar mídia recebida (`downloadMediaMessage` → `storage/media/`) · preview de imagem · player de
  vídeo nativo · abrir documento · salvar temporariamente no backend e servir via `GET /media/:id` ·
  tratar mídia expirada/indisponível (flag `expired`).

### Configurações
- Ver número conectado · ver status · desconectar WhatsApp · limpar dados locais do app · tema
  simples (sistema/claro/escuro) · sobre o app.

## 7. Funcionalidades fora do MVP

Chamadas de voz · chamadas de vídeo · status/stories · pagamentos · comunidades · catálogo
comercial · envio em massa · automação de spam · multiusuário avançado · painel administrativo
complexo · observabilidade avançada (métricas/tracing) · escalabilidade horizontal/K8s ·
criptografia customizada além do necessário · **IA generativa** (movida para a Fase 2).

## 8. Requisitos Funcionais (RF001–RF045)

> Formato: **Nome · Descrição · Ator · Entrada · Processamento · Saída · Critérios de aceite.**

**RF001 — Cadastro de usuário**
Descrição: permitir criar conta no app. Ator: Usuário final. Entrada: e-mail, senha, nome.
Processamento: validar formato, garantir e-mail único, gerar hash bcrypt, persistir `User`.
Saída: usuário criado + JWT. Aceite: e-mail duplicado retorna 409; sucesso retorna token válido.

**RF002 — Login**
Descrição: autenticar usuário existente. Ator: Usuário final. Entrada: e-mail, senha.
Processamento: localizar usuário, comparar hash. Saída: JWT + dados básicos. Aceite: credenciais
inválidas retornam 401; sucesso retorna token aceito em rotas protegidas.

**RF003 — Logout**
Descrição: encerrar sessão do app. Ator: Usuário final. Entrada: token atual. Processamento: cliente
remove token; servidor não mantém estado. Saída: 200. Aceite: após logout o token é descartado e a
Splash leva ao Login.

**RF004 — Persistência de sessão do app**
Descrição: manter usuário logado entre aberturas. Ator: Usuário final. Entrada: token salvo.
Processamento: Splash lê SecureStore e chama `/me`. Saída: rota inicial decidida. Aceite: reabrir o
app com token válido vai direto à Home sem novo login.

**RF005 — Obter perfil (`/me`)**
Descrição: retornar dados do usuário logado. Ator: Usuário final. Entrada: JWT. Processamento:
validar token, buscar `User`. Saída: id, e-mail, nome. Aceite: token inválido retorna 401.

**RF006 — Iniciar sessão WhatsApp**
Descrição: abrir socket Baileys para o usuário. Ator: Usuário final. Entrada: JWT. Processamento:
criar/recuperar `WhatsAppSession`, abrir socket com auth state. Saída: status `connecting` e, em
seguida, QR. Aceite: chamada retorna 202/200 e o app passa a receber `session.qr.updated`.

**RF007 — Exibir QR Code**
Descrição: entregar QR para escaneamento. Ator: Sistema. Entrada: evento `connection.update.qr`.
Processamento: converter string em dataURL. Saída: `session.qr.updated{qr}`. Aceite: app renderiza
QR escaneável; novo QR substitui o anterior ao expirar.

**RF008 — Pairing code (opcional)**
Descrição: alternativa ao QR. Ator: Usuário final. Entrada: número de telefone. Processamento:
`requestPairingCode`. Saída: código de 8 dígitos. Aceite: digitar o código no WhatsApp conecta a
sessão; se indisponível, app oferece apenas QR.

**RF009 — Detectar conexão estabelecida**
Descrição: sinalizar conta conectada. Ator: Sistema. Entrada: `connection.update=open`.
Processamento: atualizar `WhatsAppSession.status=connected`, salvar `phoneNumber`. Saída:
`session.connected{phoneNumber}`. Aceite: app sai do QR para a lista de conversas.

**RF010 — Detectar desconexão**
Descrição: sinalizar queda da sessão. Ator: Sistema. Entrada: `connection.update=close`.
Processamento: avaliar `DisconnectReason`; marcar `disconnected`. Saída:
`session.disconnected{reason,canReconnect}`. Aceite: app mostra banner e oferece reconectar quando
`canReconnect`.

**RF011 — Reconexão automática**
Descrição: religar sessão recuperável sem novo QR. Ator: Sistema. Entrada: close reconectável.
Processamento: recriar socket com credenciais salvas. Saída: `session.connected` ao reabrir. Aceite:
quedas transitórias reconectam sozinhas; `loggedOut` exige novo QR.

**RF012 — Encerrar sessão WhatsApp**
Descrição: desconectar a pedido do usuário. Ator: Usuário final. Entrada: JWT. Processamento:
`logout()`, limpar credenciais, status `disconnected`. Saída: `session.disconnected`. Aceite: após
desconectar, status reflete `disconnected` e nova conexão exige QR.

**RF013 — Status da sessão**
Descrição: consultar estado atual. Ator: Usuário final. Entrada: JWT. Processamento: ler
`WhatsAppSession`. Saída: status, número, `lastConnectedAt`. Aceite: valores coerentes com os
eventos recebidos.

**RF014 — Salvar credenciais com segurança**
Descrição: persistir auth state do Baileys. Ator: Sistema. Entrada: `creds.update`. Processamento:
`saveCreds` em pasta por usuário, fora do git. Saída: credenciais reutilizáveis. Aceite: reiniciar o
backend reconecta sessão sem novo QR (se ainda válida).

**RF015 — Sincronizar contatos**
Descrição: importar contatos conhecidos. Ator: Sistema. Entrada: `contacts.upsert/update`.
Processamento: upsert `Contact`. Saída: contatos disponíveis em `/contacts`. Aceite: contatos
aparecem com nome/jid.

**RF016 — Sincronizar chats**
Descrição: importar conversas. Ator: Sistema. Entrada: `chats.set/upsert`. Processamento: upsert
`Chat`. Saída: `chats.synced{count}` + lista em `/chats`. Aceite: lista de conversas é preenchida
após conectar.

**RF017 — Sincronizar mensagens**
Descrição: persistir mensagens recebidas/históricas. Ator: Sistema. Entrada: `messages.upsert`.
Processamento: upsert `Message`/`Media`. Saída: histórico em `/chats/:id/messages`. Aceite:
mensagens persistem **antes** de qualquer emissão ao app.

**RF018 — Atualizar lista em tempo real**
Descrição: refletir nova atividade na lista. Ator: Sistema. Entrada: nova mensagem/chat.
Processamento: atualizar `Chat.lastMessage*`, emitir `chat.updated`. Saída: app reordena/atualiza
prévia. Aceite: a conversa sobe ao topo e a prévia muda sem refresh manual.

**RF019 — Listar conversas**
Descrição: retornar chats ordenados. Ator: Usuário final. Entrada: JWT. Processamento: buscar chats
por sessão, ordenar por `lastMessageAt desc`. Saída: lista paginada. Aceite: ordenação e prévia
corretas; suporta busca.

**RF020 — Abrir conversa**
Descrição: obter metadados do chat. Ator: Usuário final. Entrada: chatId. Processamento: buscar
`Chat`. Saída: nome, avatar, isGroup. Aceite: header exibe dados certos.

**RF021 — Histórico de mensagens**
Descrição: paginar mensagens de um chat. Ator: Usuário final. Entrada: chatId, cursor.
Processamento: buscar por chat, ordenar por `timestamp desc`, paginar. Saída: página + próximo
cursor. Aceite: "carregar mais antigas" traz a página seguinte sem duplicar.

**RF022 — Enviar texto**
Descrição: mandar mensagem de texto. Ator: Usuário final. Entrada: chatId, texto. Processamento:
criar `Message` `pending` → `sendMessage` → atualizar `sent`/`error`. Saída: `message.sent` ou
`error.message`. Aceite: bolha aparece imediatamente como pendente e vira enviada ao confirmar.

**RF023 — Envio otimista**
Descrição: refletir a mensagem na UI antes da confirmação. Ator: Sistema. Entrada: ação de envio.
Processamento: inserir mensagem local `pending`. Saída: bolha pendente. Aceite: sem espera
perceptível para o usuário ver sua mensagem.

**RF024 — Tratar erro de envio**
Descrição: marcar falhas. Ator: Sistema. Entrada: exceção do `sendMessage`. Processamento: status
`error`. Saída: `error.message{messageId,reason}`. Aceite: bolha exibe ícone de falha.

**RF025 — Reenviar mensagem com falha**
Descrição: tentar novamente. Ator: Usuário final. Entrada: messageId em `error`. Processamento:
reenfileirar envio. Saída: `pending`→`sent`. Aceite: retry funciona sem duplicar a bolha.

**RF026 — Enviar imagem**
Descrição: mandar imagem. Ator: Usuário final. Entrada: chatId + arquivo. Processamento: upload
multipart, salvar `Media`, `sendMessage{image}`. Saída: `message.sent`. Aceite: destinatário recebe
a imagem; remetente vê preview.

**RF027 — Enviar vídeo curto**
Descrição: mandar vídeo. Ator: Usuário final. Entrada: chatId + vídeo. Processamento: igual imagem,
tipo `video`. Saída: `message.sent`. Aceite: vídeo enviado e reproduzível.

**RF028 — Enviar áudio/documento (se viável)**
Descrição: mandar áudio ou arquivo. Ator: Usuário final. Entrada: chatId + arquivo. Processamento:
tipo `audio`/`document`. Saída: `message.sent`. Aceite: arquivo entregue; documento abre no
destino.

**RF029 — Responder mensagem (quoted)**
Descrição: citar mensagem ao responder. Ator: Usuário final. Entrada: chatId, texto,
quotedMessageId. Processamento: `sendMessage{quoted}`. Saída: bolha com citação. Aceite: a resposta
exibe trecho citado.

**RF030 — Receber em tempo real**
Descrição: entregar mensagens novas ao app. Ator: Sistema. Entrada: `messages.upsert` (notify).
Processamento: persistir, emitir `message.received`. Saída: conversa/lista atualizadas. Aceite:
mensagem aparece na conversa aberta em < ~2s.

**RF031 — Atualizar não lidas**
Descrição: contar mensagens não lidas. Ator: Sistema. Entrada: mensagem recebida com chat fechado.
Processamento: incrementar `Chat.unreadCount`. Saída: badge atualizado. Aceite: badge reflete a
contagem; zera ao abrir o chat.

**RF032 — Marcar como lida**
Descrição: zerar não lidas ao abrir. Ator: Usuário final. Entrada: chatId. Processamento:
`readMessages` no Baileys + `unreadCount=0`. Saída: badge zerado. Aceite: abrir a conversa zera o
contador localmente e remotamente quando possível.

**RF033 — Status de mensagem**
Descrição: refletir entregue/lida. Ator: Sistema. Entrada: `messages.update`. Processamento:
mapear ack para `delivered/read`. Saída: `message.status.updated`. Aceite: ícone de status muda
conforme o ack.

**RF034 — Baixar mídia recebida**
Descrição: obter arquivo de mídia. Ator: Sistema/Usuário. Entrada: mensagem com mídia.
Processamento: `downloadMediaMessage` → `storage/media`. Saída: `media.downloaded{mediaId,localPath}`
+ `GET /media/:id`. Aceite: mídia baixa e exibe; expirada marca `expired`.

**RF035 — Visualizar mídia**
Descrição: exibir imagem/vídeo/documento. Ator: Usuário final. Entrada: mediaId. Processamento:
servir arquivo. Saída: preview/player. Aceite: imagem mostra, vídeo toca, documento abre.

**RF036 — Listar contatos**
Descrição: retornar contatos. Ator: Usuário final. Entrada: JWT. Processamento: buscar `Contact` da
sessão. Saída: lista. Aceite: nomes/jids corretos.

**RF037 — Listar grupos**
Descrição: retornar grupos. Ator: Usuário final. Entrada: JWT. Processamento: buscar `Group`. Saída:
lista. Aceite: assunto e contagem de participantes quando disponíveis.

**RF038 — Participantes de grupo**
Descrição: ver membros. Ator: Usuário final. Entrada: groupId. Processamento: ler
`GroupParticipant` (de `groupMetadata`). Saída: lista com flag admin. Aceite: participantes e admins
exibidos quando disponíveis.

**RF039 — Buscar conversas**
Descrição: filtrar por nome/conteúdo. Ator: Usuário final. Entrada: termo. Processamento: filtrar
`Chat.name`/última mensagem (e opcionalmente `Message.text`). Saída: resultados. Aceite: termo
parcial retorna correspondências; vazio mostra estado vazio.

**RF040 — Banner de conexão**
Descrição: indicar estado da sessão na UI. Ator: Sistema. Entrada: eventos de sessão.
Processamento: refletir no `ConnectionBanner`. Saída: banner colorido por estado. Aceite: cada
transição de estado muda o banner.

**RF041 — Limpar dados locais**
Descrição: apagar cache/dados do app no dispositivo. Ator: Usuário final. Entrada: confirmação.
Processamento: limpar stores/SecureStore seletivamente. Saída: app "zerado" (mantém ou não o login,
conforme escolha). Aceite: dados locais removidos; comportamento documentado.

**RF042 — Preferência de tema**
Descrição: alternar tema. Ator: Usuário final. Entrada: opção sistema/claro/escuro. Processamento:
persistir `AppSetting.theme`. Saída: UI re-tematizada. Aceite: escolha persiste após reabrir.

**RF043 — Sobre o app**
Descrição: exibir versão e avisos legais. Ator: Usuário final. Entrada: abrir seção. Processamento:
ler metadados. Saída: versão, aviso de uso legítimo e de marca. Aceite: informações visíveis.

**RF044 — Bloquear envio em massa**
Descrição: impedir automação de spam. Ator: Sistema. Entrada: tentativas de envio. Processamento:
rate-limit por usuário/destino e ausência de API de broadcast. Saída: bloqueio/erro ao exceder.
Aceite: não há endpoint de disparo em massa; excesso é barrado.

**RF045 — Operar apenas com conta autorizada**
Descrição: garantir legitimidade. Ator: Sistema/Usuário. Entrada: sessão criada via QR/pairing pelo
dono. Processamento: nenhuma conexão sem o pareamento explícito do usuário. Saída: sessão legítima.
Aceite: não há mecanismo de acesso oculto; conexão sempre exige ação do dono no aparelho.

## 9. Regras de negócio

- **RN01:** cada usuário do app tem **no máximo uma** sessão WhatsApp ativa no MVP.
- **RN02:** sessão desconectada (reconectável) **deve** permitir reconexão sem novo QR; `loggedOut`
  exige novo QR.
- **RN03:** mensagem recebida **deve** ser persistida **antes** de ser emitida ao app.
- **RN04:** mensagem enviada **deve** aparecer imediatamente como `pending` (otimista).
- **RN05:** em erro de envio, a mensagem **deve** oferecer "tentar novamente".
- **RN06:** o sistema **não** disponibiliza envio em massa automatizado (sem broadcast/scheduler de
  disparo); aplica rate-limit básico.
- **RN07:** o sistema **só** opera com conta autorizada pelo próprio usuário (QR/pairing); sem acesso
  oculto.
- **RN08:** credenciais Baileys nunca trafegam para o app; ficam apenas no backend.
- **RN09:** abrir uma conversa zera seu `unreadCount`.
- **RN10:** mídia indisponível/expirada é marcada `expired` e a UI comunica claramente.

## 10. Modelo de dados funcional

> Detalhe técnico (campos/tipos exatos) em `server/prisma/schema.prisma`.

- **User** — dono da conta no app. Campos: id, email(único), passwordHash, displayName, createdAt.
  Relações: 1:1 `WhatsAppSession`, 1:1 `AppSetting`.
- **WhatsAppSession** — vínculo com a conta de WhatsApp. Campos: id, userId, status, phoneNumber?,
  authFolderPath, lastConnectedAt. Relações: pertence a `User`; possui `Contact`/`Chat`/`Group`/
  `DeviceConnection`.
- **Contact** — contato conhecido. Campos: id, sessionId, jid, name, pushName?, avatarUrl?.
  Serve para resolver nomes/avatares e iniciar conversas.
- **Chat** — uma conversa (1:1 ou grupo). Campos: id, sessionId, jid, name?, isGroup, unreadCount,
  lastMessageId?, lastMessageAt, archived. Base da lista de conversas.
- **Message** — mensagem. Campos: id, chatId, waMessageId?, fromMe, senderJid, type, text?, mediaId?,
  quotedMessageId?, status, timestamp, createdAt. Conteúdo das conversas.
- **Media** — arquivo anexo. Campos: id, messageId, type, mimeType, fileName, localPath?, size?,
  downloaded, expired. Armazena/serve mídia.
- **Group** — metadados de grupo. Campos: id, sessionId, jid, subject, description?, ownerJid?.
- **GroupParticipant** — membro de grupo. Campos: id, groupId, jid, isAdmin.
- **DeviceConnection** — estado runtime da conexão. Campos: id, sessionId, lastEventAt, socketState.
- **AppSetting** — preferências do app. Campos: id, userId, theme, notificationsEnabled.

## 11. Eventos em tempo real (WebSocket / Socket.IO)

> Conexão autenticada por JWT (handshake `auth.token`). Cada usuário entra numa room `user:<id>`.

| Evento | Direção | Payload |
|---|---|---|
| `session.qr.updated` | server→app | `{ qr: string /* dataURL */ }` |
| `session.connected` | server→app | `{ phoneNumber: string }` |
| `session.disconnected` | server→app | `{ reason: string, canReconnect: boolean }` |
| `chats.synced` | server→app | `{ count: number }` |
| `chat.updated` | server→app | `{ chat: Chat }` |
| `message.received` | server→app | `{ chatId: string, message: Message }` |
| `message.sent` | server→app | `{ message: Message }` |
| `message.status.updated` | server→app | `{ messageId: string, status: MessageStatus }` |
| `media.downloaded` | server→app | `{ mediaId: string, localPath: string }` |
| `error.connection` | server→app | `{ message: string }` |
| `error.message` | server→app | `{ messageId: string, reason: string }` |

> O app→server usa REST para ações (enviar mensagem, marcar lida etc.); o WebSocket é
> predominantemente de leitura/notificação no MVP.

## 12. API funcional (REST)

> Base: `/`. Auth via `Authorization: Bearer <jwt>` (exceto register/login). Erros padrão:
> `400` validação, `401` não autenticado, `403` sem sessão WhatsApp, `404` não encontrado,
> `409` conflito, `500` interno.

| Método/Rota | Objetivo | Request | Response | Erros |
|---|---|---|---|---|
| `POST /auth/register` | Criar conta | `{email,password,displayName}` | `{token,user}` | 400, 409 |
| `POST /auth/login` | Autenticar | `{email,password}` | `{token,user}` | 400, 401 |
| `POST /auth/logout` | Encerrar app | — | `{ok:true}` | 401 |
| `GET /me` | Perfil atual | — | `{user}` | 401 |
| `POST /whatsapp/session/start` | Iniciar sessão | — | `{status}` | 401, 500 |
| `GET /whatsapp/session/status` | Status sessão | — | `{status,phoneNumber?,lastConnectedAt?}` | 401 |
| `POST /whatsapp/session/disconnect` | Encerrar sessão | — | `{status:'disconnected'}` | 401 |
| `GET /chats` | Listar conversas | `?search=&cursor=` | `{chats[],nextCursor?}` | 401, 403 |
| `GET /chats/:id` | Detalhe do chat | — | `{chat}` | 401, 404 |
| `GET /chats/:id/messages` | Histórico | `?cursor=&limit=` | `{messages[],nextCursor?}` | 401, 404 |
| `POST /chats/:id/messages` | Enviar texto | `{text,quotedMessageId?}` | `{message}` | 400, 401, 403 |
| `POST /chats/:id/media` | Enviar mídia | multipart `file`,`type`,`caption?` | `{message}` | 400, 401, 403 |
| `GET /contacts` | Listar contatos | `?search=` | `{contacts[]}` | 401, 403 |
| `GET /groups` | Listar grupos | — | `{groups[]}` | 401, 403 |
| `GET /media/:id` | Baixar/servir mídia | — | binário (stream) | 401, 404, 410(expired) |

## 13. Arquitetura sugerida (MVP)

```
┌────────────────────┐        REST (Axios)         ┌──────────────────────────────┐
│  ZapBridge App     │  ─────────────────────────▶ │   zapbridge-server (Node/TS) │
│  (Expo / RN / TS)  │                              │  Express  ──  REST controllers│
│                    │  ◀───────  WebSocket  ─────  │  Socket.IO ──  realtime gateway│
│  Zustand, Nav,     │      (Socket.IO client)      │  Baileys manager (1 sock/user)│
│  SecureStore       │                              │  Prisma ── SQLite (dev.db)    │
└────────────────────┘                              │  storage/media + storage/auth │
                                                     └──────────────┬───────────────┘
                                                                    │ WhiskeySockets/Baileys
                                                                    ▼
                                                            WhatsApp (conta do usuário,
                                                            pareada via QR/pairing)
```

- **App RN** fala REST para ações e ouve WebSocket para tempo real.
- **Backend** é um único processo: Express (REST) + Socket.IO (WS) + Baileys manager + Prisma.
- **Baileys manager** mantém um socket por usuário, persiste eventos e emite por room.
- **SQLite** (Prisma) para MVP; troca para PostgreSQL alterando o `datasource`.
- **Storage local**: `storage/auth/<userId>` (credenciais) e `storage/media` (arquivos).
- Camada de auth simples (JWT) e camada de persistência (Prisma) — sem filas, sem cache externo.

## 14. Estrutura de pastas

**Backend (`server/`)**
```
server/
  package.json  tsconfig.json  .env.example  .gitignore  README.md
  prisma/schema.prisma
  storage/{auth,media}/.gitkeep
  src/
    index.ts
    config/env.ts
    lib/prisma.ts
    middleware/auth.ts
    realtime/io.ts
    modules/
      auth/{auth.controller,auth.service,auth.routes}.ts
      whatsapp/{baileys.manager,whatsapp.controller,whatsapp.routes}.ts
      chats/{chats.controller,chats.service,chats.routes}.ts
      contacts/{contacts.controller,contacts.routes}.ts
      groups/{groups.controller,groups.routes}.ts
      media/{media.controller,media.routes}.ts
    utils/{jid,asyncHandler}.ts
    types/index.ts
```

**Mobile (`app/`)**
```
app/
  package.json  app.json  tsconfig.json  babel.config.js  README.md  .env.example
  index.ts
  src/
    App.tsx
    navigation/RootNavigator.tsx
    api/client.ts
    realtime/socket.ts
    store/{auth,session,chats}.store.ts
    screens/{Splash,Login,Register,ConnectWhatsApp,ChatList,Chat,Contacts,Groups,Settings,MediaViewer}Screen.tsx
    components/{ChatListItem,MessageBubble,MessageInput,ConnectionBanner,EmptyState,SkeletonList}.tsx
    theme/theme.ts
    types/index.ts
```

## 15. Stack recomendada (com justificativa)

**Backend**
- **Node.js + TypeScript** — Baileys é Node/TS; tipos ajudam num domínio com muitos eventos.
- **Express** — mínimo e direto para um MVP; menos boilerplate que NestJS.
- **Baileys** — requisito do produto; conecta sem Business API.
- **Prisma + SQLite** — zero-config para começar; migrável a PostgreSQL trocando o datasource.
- **Socket.IO** — reconexão automática, rooms por usuário, fallback robusto.
- **JWT (jsonwebtoken) + bcrypt** — auth simples e stateless.
- **multer** (upload) + **qrcode** (dataURL do QR).

**Mobile**
- **Expo (RN + TS)** — roda Android/iOS sem Xcode/Android Studio local; EAS Build; ótimo DX.
- **React Navigation** — navegação padrão da comunidade.
- **Zustand** — store simples e enxuta (menos cerimônia que Redux para o MVP).
- **Axios** — REST com interceptors de JWT.
- **socket.io-client** — par do backend.
- **expo-secure-store** — token seguro; **expo-image-picker**/**expo-av** — mídia.

## 16. UX desejada

Lista de conversas limpa; bolhas de mensagem; campo de texto fixo no rodapé; anexos por botão;
feedback visual de conexão (`ConnectionBanner`); feedback de envio (pending/sent/erro); loading
skeletons onde fizer sentido; estados vazios com texto acolhedor. Sem copiar marca/identidade do
WhatsApp — paleta e ícones próprios, apenas *inspirados* em mensageria.

## 17. Fluxos críticos

**Conectar pela primeira vez**
App → `POST /whatsapp/session/start` → backend abre socket Baileys → `connection.update.qr` →
`session.qr.updated` → app renderiza QR → usuário escaneia → `connection.update=open` →
`session.connected` → sincronização (`chats.synced`, `chat.updated`) → app mostra conversas.

**Reconexão**
`connection.update=close` (reconectável) → backend recria socket com credenciais salvas →
`session.connected` → app limpa o banner. Se `loggedOut` → `session.disconnected{canReconnect:false}`
→ app pede novo QR.

**Recebimento de mensagem**
Baileys `messages.upsert(notify)` → persiste `Message`(+`Media`) → atualiza `Chat` →
`message.received` + `chat.updated` → app atualiza conversa aberta, prévia e `unreadCount`.

**Envio de mensagem**
App insere bolha `pending` → `POST /chats/:id/messages` → backend cria `Message pending` →
`sendMessage` → `sent` → `message.sent` → app concilia a bolha.

**Envio com erro**
`sendMessage` lança → status `error` → `error.message` → app marca a bolha com falha e botão
"tentar novamente" → retry repete o envio sem duplicar.

**Mídia recebida**
Mensagem com mídia → `downloadMediaMessage` → salva em `storage/media` → `media.downloaded` →
app baixa via `GET /media/:id` e exibe; se expirada → `expired` e aviso na UI.

**Desconexão**
Usuário em Configurações → `POST /whatsapp/session/disconnect` → `logout()` + limpa credenciais →
`session.disconnected` → app volta ao estado desconectado.

## 18. Critérios de aceite do MVP

- [ ] Usuário cria conta e faz login no app.
- [ ] Usuário conecta a conta de WhatsApp via QR Code.
- [ ] App exibe status da conexão claramente (connecting/qr/connected/disconnected).
- [ ] Conversas sincronizadas aparecem na lista, ordenadas por recência.
- [ ] Usuário abre uma conversa e vê o histórico de mensagens.
- [ ] Usuário envia mensagem de texto (pending → sent).
- [ ] Usuário recebe mensagens novas em tempo real.
- [ ] Usuário envia uma imagem.
- [ ] Mensagem com falha mostra opção de "tentar novamente".
- [ ] Contador de não lidas atualiza e zera ao abrir o chat.
- [ ] Usuário desconecta a sessão do WhatsApp.
- [ ] App mantém sessão (login) após fechar e reabrir.
- [ ] App comunica erros de conexão de forma clara e acionável.

## 19. Fase futura (opcional — Fase 2)

- **IA:** respostas sugeridas, detecção do estilo de escrita do usuário, resumo de conversa,
  templates inteligentes — usando os modelos Claude mais recentes (ex.: `claude-opus-4-8`/
  `claude-sonnet-4-6`) via Anthropic API.
- **Busca semântica** (embeddings) sobre o histórico.
- **Organização automática** de conversas (categorias/labels).
- **Multi-sessão** por usuário e **backup** de dados.
- **Painel web** administrativo.
- (Infra) Onboarding na esteira DevOps local (`devops.yaml`, Traefik, GHCR, Argo CD) quando fizer
  sentido publicar o backend.

## 20. Resultado esperado / entregáveis

1. Este **documento funcional** (`docs/MVP-FUNCIONAL.md`).
2. **Backend** rodável (`server/`) — Express + Prisma/SQLite + Socket.IO + Baileys: auth, sessão/QR,
   chats, mensagens, mídia, eventos em tempo real.
3. **App mobile** rodável (`app/`) — Expo/RN: auth, conectar (QR), lista de conversas, conversa,
   envio otimista, recebimento em tempo real, configurações.
4. **READMEs** com passos de execução e verificação end-to-end.

---

> **Aviso legal/ético:** o ZapBridge destina-se a uso pessoal e legítimo da própria conta do
> usuário. Não se destina a automação de spam, disparo em massa, coleta indevida de dados ou
> qualquer uso que viole os Termos de Serviço de terceiros. O responsável pelo uso é o próprio
> usuário que pareia sua conta.
