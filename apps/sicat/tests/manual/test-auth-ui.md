# Checklist de Teste Manual - UI de Autenticação

**Objetivo**: Validar fluxo completo de autenticação no frontend Vue.js

**Pré-requisitos**:
- Backend rodando em modo real (`npm run dev`)
- Frontend rodando (`cd frontend && npm run dev`)
- Browser DevTools aberto (Console + Network)

---

## 1. Tela de Login - Carregamento e Validação

### 1.1 Carregamento Inicial
- [ ] Acessar `http://localhost:5173/login`
- [ ] Tela carrega sem erros no console
- [ ] Formulário é exibido corretamente
- [ ] Campos de documento e senha estão visíveis
- [ ] Botão "Entrar" está desabilitado inicialmente
- [ ] Nenhum erro de CORS no Network tab

### 1.2 Validação de Campos
- [ ] Clicar em "Entrar" sem preencher → mostra mensagens de validação
- [ ] Preencher apenas documento → senha é obrigatória
- [ ] Preencher apenas senha → documento é obrigatório
- [ ] Documento deve aceitar números (CNPJ/CPF)
- [ ] Campo de senha deve ser tipo `password` (texto oculto)

### 1.3 Validação Visual
- [ ] Labels estão alinhados corretamente
- [ ] Campos têm placeholders ou hints claros
- [ ] Mensagens de erro são vermelhas e visíveis
- [ ] Botão "Entrar" muda de estado (habilitado/desabilitado)

---

## 2. Login com Credenciais Válidas

### 2.1 Fluxo de Login
- [ ] Preencher documento: `31913781000139`
- [ ] Preencher senha: `2dlzft`
- [ ] Clicar em "Entrar"
- [ ] Loading/spinner aparece durante requisição
- [ ] Network tab mostra `POST /v1/auth/login` com status 200
- [ ] Response contém `token`, `user`, `partner`
- [ ] Nenhum erro no console

### 2.2 Armazenamento de Token
- [ ] Abrir DevTools → Application → Local Storage
- [ ] Verificar que `authToken` está salvo (ou chave similar)
- [ ] Token é um JWT válido (formato `eyJ...`)
- [ ] `expiresAt` também está salvo (se aplicável)
- [ ] Dados de `user` e `partner` estão em store/localStorage

### 2.3 Redirecionamento
- [ ] Após login bem-sucedido, redireciona para dashboard ou home
- [ ] URL muda de `/login` para `/` ou `/dashboard`
- [ ] Usuário não pode voltar para `/login` sem logout

---

## 3. Estado Autenticado - Header e Dados do Usuário

### 3.1 Header de Navegação
- [ ] Header mostra nome do usuário logado
- [ ] Email ou documento do usuário é exibido (se aplicável)
- [ ] Nome do parceiro é exibido corretamente
- [ ] Botão/link de "Logout" está visível

### 3.2 Requisições Autenticadas
- [ ] Abrir Network tab
- [ ] Fazer qualquer requisição à API (ex: listar manifestos)
- [ ] Header `Authorization: Bearer <token>` está presente
- [ ] Token enviado é o mesmo do localStorage
- [ ] Requisição retorna 200 (não 401)

---

## 4. Logout

### 4.1 Fluxo de Logout
- [ ] Clicar em botão "Logout" no header
- [ ] Loading/confirmação aparece (se aplicável)
- [ ] Redireciona para `/login`
- [ ] Local Storage é limpo (token removido)
- [ ] Store de autenticação é resetado
- [ ] Header volta ao estado não-autenticado

### 4.2 Proteção de Rotas
- [ ] Após logout, tentar acessar `/dashboard` (ou rota protegida)
- [ ] Deve redirecionar para `/login`
- [ ] Mensagem de "sessão expirada" ou similar (opcional)

---

## 5. Persistência de Sessão (Refresh)

### 5.1 Refresh com Token Válido
- [ ] Fazer login com sucesso
- [ ] Navegar para uma rota protegida
- [ ] Pressionar F5 (refresh)
- [ ] Token é recuperado do localStorage
- [ ] Usuário continua autenticado (não redireciona para login)
- [ ] Dados de usuário/parceiro são restaurados

### 5.2 Refresh Sem Token
- [ ] Limpar localStorage manualmente
- [ ] Pressionar F5
- [ ] Deve redirecionar para `/login`

---

## 6. Erros de Autenticação

### 6.1 Credenciais Inválidas
- [ ] Preencher documento inválido: `00000000000000`
- [ ] Preencher senha: `senhaerrada`
- [ ] Clicar em "Entrar"
- [ ] API retorna 400 (credenciais inválidas)
- [ ] Mensagem de erro é exibida na UI
- [ ] Formulário não é resetado (permite tentar novamente)
- [ ] Token NÃO é salvo

### 6.2 Erro de Rede (API Offline)
- [ ] Parar backend (`Ctrl+C` no terminal da API)
- [ ] Tentar fazer login
- [ ] Erro de conexão é capturado
- [ ] Mensagem amigável de erro é exibida: "Não foi possível conectar ao servidor"
- [ ] Usuário pode tentar novamente

### 6.3 Timeout
- [ ] Simular timeout (se aplicável)
- [ ] Mensagem de timeout é exibida
- [ ] Usuário pode tentar novamente

---

## 7. Token Expirado (401)

### 7.1 Logout Automático em 401
- [ ] Fazer login com sucesso
- [ ] Editar localStorage: alterar token para valor inválido
- [ ] Fazer requisição à API (listar manifestos)
- [ ] API retorna 401 Unauthorized
- [ ] Frontend detecta 401 e faz logout automático
- [ ] Redireciona para `/login`
- [ ] Mensagem de "sessão expirada" é exibida

---

## 8. Responsividade

### 8.1 Desktop (1920x1080)
- [ ] Tela de login centralizada e bem espaçada
- [ ] Campos têm largura adequada (não muito estreitos/largos)
- [ ] Header mostra todos os elementos (nome, email, logout)

### 8.2 Tablet (768x1024)
- [ ] Layout de login se ajusta corretamente
- [ ] Campos ocupam largura apropriada
- [ ] Header pode ter menu hamburguer (se aplicável)
- [ ] Botões são clicáveis (não muito pequenos)

### 8.3 Mobile (375x667)
- [ ] Formulário de login ocupa largura total (com padding)
- [ ] Campos são grandes o suficiente para toque
- [ ] Teclado não sobrepõe campos importantes
- [ ] Header compacto com menu hamburguer
- [ ] Logout acessível em menu mobile

---

## 9. Acessibilidade

### 9.1 Navegação por Teclado
- [ ] `Tab` navega entre campos na ordem correta
- [ ] `Enter` no último campo submete formulário
- [ ] Botões são focáveis
- [ ] Foco visual é claro (outline/border)

### 9.2 Screen Reader (opcional)
- [ ] Labels estão associados aos inputs (`for` attribute)
- [ ] Mensagens de erro são anunciadas
- [ ] Botões têm textos descritivos

---

## 10. Performance e UX

### 10.1 Tempo de Resposta
- [ ] Login real responde em tempo operacional aceitável
- [ ] Loading spinner aparece imediatamente
- [ ] UI não trava durante requisição

### 10.2 Feedback Visual
- [ ] Estados de loading são claros
- [ ] Mensagens de sucesso/erro são visíveis
- [ ] Transições são suaves (sem "jumps")

---

## Resultados Esperados

### ✅ Critérios de Aceitação
- Todos os itens marcados como críticos devem passar
- Nenhum erro no console em fluxo normal
- Token JWT salvo e enviado corretamente
- Logout limpa estado completamente
- Refresh mantém sessão ativa

### ⚠️ Riscos Identificados
- 401 automático depende de interceptor HTTP estar configurado

### 🔄 Próximos Passos
1. **Modo Real**: Testar com credenciais reais CETESB
2. **Testes E2E**: Automatizar este checklist com Playwright/Cypress
3. **Token Refresh**: Implementar renovação automática antes de expirar
4. **Multi-tenant**: Validar fluxo com múltiplos parceiros

---

## Notas de Execução

**Data**: __________  
**Testador**: __________  
**Ambiente**: Real  
**Browser**: Chrome / Firefox / Safari  
**Dispositivo**: Desktop / Mobile  

**Issues Encontradas**:
- 
- 

**Comentários Adicionais**:
- 
- 
