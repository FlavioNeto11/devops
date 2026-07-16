# Kit de vendas do SICAT — decks, battlecard e material de parceria

> **Para o vendedor:** os arquivos prontos estão nesta pasta. Edite apenas os campos
> `[CONTATO — …]` / `[ENDEREÇO DO TRIAL — …]` no PowerPoint antes de apresentar.
> **Nunca altere preço na mão** — preço vive na fonte única e o material é regenerado.

## Os 4 artefatos

| Arquivo | Público | Uso |
|---|---|---|
| `deck-vendas-sicat.pptx` | **Cliente** (venda direta) | Apresentação de 12 slides: dor → produto → IA → personas → a conta que fecha → planos → incluído → roadmap fiscal → contrato/recebimento → compromissos → próximos passos |
| `battlecard-vendas-sicat.pdf` | **USO INTERNO** | Cola do vendedor (2 págs): tabela com faixas de negociação, alçada de desconto, qualificação em 5 perguntas, objeções e respostas, o que NUNCA prometer, concorrência em 30s |
| `deck-parceria-embedded-sicat.pptx` | **Parceiro** (B2B2B) | SICAT Embedded em 11 slides: oportunidade → conceito white-label/API → exemplo seguro de transporte → verticais → integração (hoje × roadmap) → monitoramento → preço por documento → SLA → timeline |
| `one-pager-parceria-sicat.pdf` | **Parceiro** (leave-behind) | Resumo A4 do deck de parceria para enviar por e-mail |

## Regras de uso (inegociáveis)

1. O **battlecard não sai da empresa** — é a nossa margem e a nossa alçada.
2. A seção 5 do battlecard ("o que NUNCA prometer") vale mais que qualquer meta:
   DMR completa, "uptime de emissão", fiscal disponível e integração SINIR **não existem hoje**.
3. O add-on fiscal só se vende como **design partnership de roadmap** (contrato específico).
4. Desconto fora da alçada (anual + piloto-fundador) = aprovação do fundador antes de ofertar.

## Como regenerar (quando a tabela de preços mudar)

Os 4 artefatos leem a fonte única [`../tools/premissas.json`](../tools/premissas.json) —
mudou preço/regra lá, regenere aqui:

```powershell
cd apps\sicat\docs\20-comercial\vendas\tools
npm install          # 1ª vez apenas (pptxgenjs; node_modules é git-ignorado)
node gen_decks.js    # gera os 2 .pptx
python gen_pdfs_vendas.py  # gera battlecard + one-pager de parceria
```

QA antes de commitar: converta os pptx para PDF no LibreOffice e confira slide a slide
(`& "C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to pdf <arquivo>`);
valide a estrutura com o `validate.py` da skill pptx (`PYTHONUTF8=1`).

## Identidade visual

Paleta e tipografia transcritas dos design tokens do app SICAT
(`apps/sicat/frontend/src/styles/tokens.generated.css`): monocromático slate + acento único
verde-petróleo `#0E6E5C`, superfícies lisas, raios contidos, sem gradientes chamativos.
Fonte nos decks: Calibri (segura em qualquer Windows/Office; o app usa Public Sans/Manrope,
que não são garantidas na máquina do vendedor).

---
_Relacionados: [00-plano-comercial-pricing.md](../00-plano-comercial-pricing.md) (plano completo) ·
[01-pesquisa-mercado.md](../01-pesquisa-mercado.md) (benchmark) ·
[tools/README.md](../tools/README.md) (calculadora e fonte única)_
