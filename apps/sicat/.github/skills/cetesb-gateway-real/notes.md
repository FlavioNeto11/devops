# Notas rápidas

- Login real depende de recaptcha fornecido externamente.
- HAR confirmou retorno de JWT, mas não provou de forma definitiva o header utilizado nas chamadas seguintes.
- Estratégia atual: suportar `x-access-token`, `Authorization: Bearer` ou ambos, de forma configurável.
- Toda mudança aqui deve considerar impacto em bootstrap de sessão e renovação controlada.
