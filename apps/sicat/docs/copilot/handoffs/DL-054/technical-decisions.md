# Decisões técnicas — DL-054

## 1) Validação em duas frentes
- **Frente HAR:** garante presença de entradas reais por operação e chaves estruturais mínimas de request/response.
- **Frente Gateway:** garante que endpoints/padrões essenciais de mapeamento estejam presentes na implementação.

## 2) Shape real de submit priorizado
- Evidência HAR de `PUT /api/mtr/manifesto` retorna:
  - `mensagem` com hash do manifesto,
  - `objetoResposta: null`.
- O validador foi ajustado para esse formato, evitando falso negativo por suposição de campos não observados.

## 3) Teste dedicado com cenários positivo e negativo
- O teste não cobre apenas “passou”; também valida que o verificador realmente quebra quando:
  - falta chave obrigatória no request HAR;
  - gateway não contém padrões mínimos esperados.

## 4) Integração operacional
- O check HAR→Gateway foi incluído em `validate:cetesb-source` para ampliar o gate de qualidade sem alterar contratos públicos.
