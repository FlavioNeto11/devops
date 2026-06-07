# Technical Decisions — DL-059

## 1) Corrigir na origem do download (backend)
**Decisão:** ajustar `getManifestDocumentStream` para resolver o nome final de arquivo no momento do download.

**Motivo:**
- O stream é a fonte de verdade do `Content-Disposition`.
- Resolve tanto documentos antigos quanto novos sem depender de ação no frontend.

## 2) Priorizar `manifestNumber` sem quebrar fallback
**Decisão:** usar `externalReference.manNumero` quando presente; caso contrário manter nome legado do documento.

**Motivo:**
- Mantém compatibilidade para manifestos ainda sem número externo.
- Garante comportamento correto pós-finalização da integração.

## 3) Preservar extensão do arquivo
**Decisão:** derivar extensão do nome existente e manter `.pdf` como fallback.

**Motivo:**
- Evita inconsistência de tipo/mime em cenários futuros.
