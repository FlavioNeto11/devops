# Diagrama de Sequência: Autenticação Completa

```mermaid
sequenceDiagram
    participant Cliente
    participant API Backend
    participant CETESB Portal
    participant Vault
    participant PostgreSQL

    Note over Cliente,PostgreSQL: 1. Buscar Info do Parceiro (Opcional)
    
    Cliente->>API Backend: GET /v1/auth/partner-info?document=31913781000139
    API Backend->>PostgreSQL: SELECT partner WHERE document=...
    alt Parceiro em cache
        PostgreSQL-->>API Backend: Partner Data
    else Não está em cache
        API Backend->>CETESB Portal: GET /api/partners/search?document=...
        CETESB Portal-->>API Backend: Partner Data
        API Backend->>PostgreSQL: INSERT partner cache
    end
    API Backend-->>Cliente: 200 OK { partnerCode, users[] }

    Note over Cliente,PostgreSQL: 2. Login com Usuário/Senha

    Cliente->>API Backend: POST /v1/auth/login<br/>{ document, password, recaptchaToken }
    
    alt reCAPTCHA Token Fornecido
        API Backend->>CETESB Portal: POST /api/auth/login<br/>{ login, password, recaptchaToken }
        
        alt Login Sucesso
            CETESB Portal-->>API Backend: 200 OK { token, user, partner }
            API Backend->>Vault: Store JWT Token
            Vault-->>API Backend: vault://mtr/tokens/{tokenId}
            API Backend-->>Cliente: 200 OK<br/>{ token, expiresAt, user, partner }
        else Credenciais Inválidas
            CETESB Portal-->>API Backend: 401 Unauthorized
            API Backend-->>Cliente: 400 Bad Request<br/>{ code: INVALID_CREDENTIALS }
        end
        
    else Sem reCAPTCHA Token
        API Backend-->>Cliente: 400 Bad Request<br/>{ code: RECAPTCHA_REQUIRED,<br/>recaptchaSiteKey, loginUrl }
        Note over Cliente: Cliente precisa resolver<br/>reCAPTCHA manualmente
    end

    Note over Cliente,PostgreSQL: 3. Criar Session Context

    Cliente->>API Backend: POST /v1/session-contexts<br/>{ authMode: "manual-token",<br/>jwtToken: "...", ... }
    API Backend->>PostgreSQL: INSERT session_contexts
    API Backend->>Vault: Store JWT Token
    Vault-->>API Backend: vault://mtr/session-contexts/{id}
    API Backend->>PostgreSQL: UPDATE session_contexts<br/>SET jwtTokenRef=...
    API Backend-->>Cliente: 201 Created<br/>{ id: "scx_...", status: "active" }

    Note over Cliente,PostgreSQL: 4. Usar em Operações

    Cliente->>API Backend: POST /v1/manifestos/{id}/submit<br/>{ sessionContextId }
    API Backend->>PostgreSQL: SELECT session_contexts WHERE id=...
    PostgreSQL-->>API Backend: Session Context Data
    API Backend->>Vault: Retrieve JWT Token
    Vault-->>API Backend: JWT Token
    API Backend->>CETESB Portal: PUT /api/mtr/manifesto<br/>Authorization: Bearer {token}
    CETESB Portal-->>API Backend: 200 OK { manCodigo, ... }
    API Backend->>PostgreSQL: UPDATE manifests<br/>SET status=submitted
    API Backend-->>Cliente: 202 Accepted<br/>{ jobId, commandId }

    Note over Cliente,PostgreSQL: 5. Renovação de Token (24h)

    alt Token Expirado
        Cliente->>API Backend: POST /v1/manifestos/{id}/submit
        API Backend->>PostgreSQL: SELECT session_contexts
        API Backend->>Vault: Retrieve JWT Token
        Note over API Backend: Detecta expiração<br/>(expiresAt < now)
        API Backend->>PostgreSQL: UPDATE session_contexts<br/>SET status=expired
        API Backend-->>Cliente: 401 Unauthorized<br/>{ code: SESSION_EXPIRED }
        Cliente->>API Backend: POST /v1/auth/login<br/>{ document, password, ... }
        Note over Cliente,API Backend: Repetir fluxo completo
    end
```

## Fluxo Alternativo: Sem Automação de reCAPTCHA

```mermaid
sequenceDiagram
    participant Usuário
    participant Browser
    participant API Backend
    participant CETESB Portal
    
    Note over Usuário,CETESB Portal: Resolução Manual do reCAPTCHA
    
    Usuário->>Browser: Acessar https://sistemas.cetesb.sp.gov.br/sigor-mtr/login
    Browser->>CETESB Portal: GET /login
    CETESB Portal-->>Browser: HTML Form + reCAPTCHA
    
    Usuário->>Browser: Preencher login/senha<br/>Resolver CAPTCHA
    Browser->>CETESB Portal: POST /api/auth/login<br/>{ login, password, recaptchaToken }
    CETESB Portal-->>Browser: 200 OK { token }
    
    Note over Usuário: Extrair token do<br/>DevTools/Storage
    
    Usuário->>Browser: DevTools → Application → Storage<br/>Copiar JWT Token
    
    Usuário->>API Backend: POST /v1/session-contexts<br/>{ jwtToken: "<token copiado>" }
    API Backend-->>Usuário: 201 Created<br/>{ id: "scx_..." }
    
    Note over Usuário: Usar sessionContextId<br/>por até 24h
```

## Estados de Session Context

```mermaid
stateDiagram-v2
    [*] --> pending_auth: POST /session-contexts<br/>(authMode=bootstrap sem token)
    [*] --> active: POST /session-contexts<br/>(authMode=manual-token)
    
    pending_auth --> active: Token fornecido manualmente
    active --> expired: expiresAt < now
    active --> invalid: Token revogado/inválido
    expired --> active: Renovação de token
    invalid --> [*]: Deletar contexto
    expired --> [*]: Timeout (sem renovação)
```

## Códigos de Erro

| Código | HTTP | Descrição | Ação |
|--------|------|-----------|------|
| `RECAPTCHA_REQUIRED` | 400 | reCAPTCHA não resolvido | Resolver CAPTCHA e reenviar |
| `INVALID_CREDENTIALS` | 400 | Usuário/senha incorretos | Verificar credenciais |
| `PARTNER_NOT_FOUND` | 404 | CNPJ/CPF não cadastrado | Verificar documento ou cadastrar |
| `SESSION_EXPIRED` | 401 | Token expirado | Refazer login |
| `SESSION_INVALID` | 401 | Token revogado/corrompido | Criar nova sessão |

## Tempo de Vida dos Recursos

| Recurso | TTL | Renovação |
|---------|-----|-----------|
| JWT Token | 24h | Não (refazer login) |
| Session Context | 24h | Atualizar com novo token |
| Partner Info Cache | 7 dias | Automática em background |
| Manifest Draft | Ilimitado | N/A |
