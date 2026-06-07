# Technical Decisions — DL-061

## 1) Uso de input de data nativo com styling
**Decisão:** usar `type=date` para permitir calendário com melhor usabilidade, mantendo estilo visual consistente com a UI.

**Motivo:**
- Garante seleção de data sem digitação manual.
- Evita dependência externa adicional para calendário.

## 2) Navegação por dia com botões dedicados
**Decisão:** adicionar botões para `-1` e `+1` dia em cada campo de data.

**Motivo:**
- Facilita ajuste fino de período sem abrir calendário repetidamente.

## 3) Compatibilidade de formatos
**Decisão:** manter estado dos filtros em BR (`dd/mm/yyyy`) e converter internamente para ISO ao interagir com `type=date`.

**Motivo:**
- Evita regressão no restante da tela/store já adaptados para parsing BR.
