# Technical Decisions — DL-044

## 1) UX da etapa CETESB no padrão de login
**Decisão:** substituir layout de card-grid + painel separado por card único no estilo login.

**Motivo:** reduzir fricção, manter consistência visual com a experiência anterior e atender preferência operacional do usuário.

## 2) Dupla opção no mesmo fluxo
**Decisão:** manter na mesma tela:
- entrada com conta salva
- entrada com conta nova

**Motivo:** evitar navegação extra e tornar explícita a escolha entre reutilizar conta existente ou autenticar outra conta CETESB.

## 3) Ativação automática da conta nova
**Decisão:** após adicionar conta nova, ativar imediatamente e redirecionar ao dashboard.

**Motivo:** comportamento esperado de “logar com conta nova” sem etapa manual adicional.

## 4) Ajuste de teste por texto
**Decisão:** usar asserção parcial/regex para subtítulo da etapa CETESB no smoke test.

**Motivo:** reduzir fragilidade de teste por variações textuais sem perder validação funcional da tela.
