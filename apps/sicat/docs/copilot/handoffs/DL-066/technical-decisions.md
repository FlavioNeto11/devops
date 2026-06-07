# Technical Decisions — DL-066

## Decisão 1: Tornar filtros textuais tolerantes ao shape CETESB
- **Implementação:** consulta SQL de `carrierQuery`/`receiverQuery` expandida para campos locais e snapshot externo.
- **Racional:** dados podem chegar com variação de shape/semântica entre cadastro interno e espelho CETESB.

## Decisão 2: Filtro de número MTR com fontes múltiplas
- **Implementação:** `manifestNumber` consulta `external_reference.manNumero` e `payload.externalSnapshot`.
- **Racional:** evitar falso negativo em registros sincronizados de formas diferentes.

## Decisão 3: Remover `Impresso` do filtro de status
- **Implementação:** opção removida do select de status na listagem.
- **Racional:** estado não representa status operacional final esperado para permanência de MTR.

## Decisão 4: Grid responsivo dedicado para filtros
- **Implementação:** 4 colunas no desktop, 2 no tablet e 1 no mobile no bloco de filtros.
- **Racional:** manter `Data inicial` e `Data final` em disposição consistente e melhorar escaneabilidade.

## Decisão 5: Label semântico para parceiro numérico
- **Implementação:** quando descrição vier numérica (11-14 dígitos), UI apresenta como `CNPJ/CPF ...`.
- **Racional:** reduzir ambiguidade para operadores em cenários de cadastro inconsistente de origem.
