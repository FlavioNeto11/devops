# @flavioneto11/fiscal-kit

Emissao de **nota fiscal brasileira (NF-e / NFCe)**, **sandbox-first** e
**fail-closed**. Funciona **sem certificado** (modo sandbox, determinista e sem
rede); a SEFAZ real fica atras de configuracao e e um esforco isolado futuro.

Zero dependencias de runtime. ESM (`type: module`). Tipos escritos a mao.

## Emissao como job assincrono

A emissao real e assincrona (submete, depois consulta a autorizacao por recibo).
Este kit fornece **passos puros** — `build -> sign -> submit -> queryStatus` — e a
**app os orquestra no seu worker** transacional/retentavel. **O kit nao possui
fila** (use o bloco `worker-queue` da app). Veja o exemplar em
[`example/usage.js`](./example/usage.js).

## Uso

```js
import { createFiscalGateway } from '@flavioneto11/fiscal-kit';

const gw = createFiscalGateway({ mode: process.env.FISCAL_MODE || 'sandbox' });
const xml = gw.buildNfeXml(invoice);
const signed = gw.signXml(xml);
const { receipt } = gw.submit(signed);     // -> { receipt, status: 'received' }
const res = gw.queryStatus(receipt);       // -> { status: 'authorized', protocol, receipt }
```

Import do sandbox direto (offline, deterministico):

```js
import { sandboxSefaz } from '@flavioneto11/fiscal-kit/sandbox';
```

## Variaveis de ambiente

| Var | Descricao |
|---|---|
| `FISCAL_MODE` | `sandbox` (default) ou `real`. |
| `FISCAL_UF` | UF da SEFAZ (modo real). |
| `FISCAL_ENVIRONMENT` | `homologacao` / `producao` (modo real). |
| `FISCAL_CERT_PFX` | Certificado A1 (.pfx) — caminho/base64 conforme a app (modo real). |
| `FISCAL_CERT_PASSWORD` | Senha do certificado (modo real). |

A app le essas vars e monta `createFiscalGateway({ mode, certificate, uf, environment })`.

## Fail-closed

- **Modo real sem certificado** -> `createFiscalGateway(...)` lanca
  `FiscalConfigError`. Nunca se emite em producao sem certificado.
- **Assinatura real (xmldsig)** ainda nao esta conectada: com certificado em
  modo real, `signXml` lanca um `FiscalConfigError` documentado. Uma lib real de
  xmldsig seria uma **`peerDependency` OPCIONAL** (documentada, nao instalada).
- **SEFAZ real** e um stub `FiscalConfigError('SEFAZ real nao conectado...')`.

A SEFAZ real (SOAP + mTLS com certificado A1, por UF/ambiente) e um esforco
isolado futuro — este kit nao implementa o webservice real.

## Erros

`FiscalError` (`FISCAL_ERROR`) · `FiscalConfigError` (`FISCAL_CONFIG`) ·
`FiscalRejectedError` (`FISCAL_REJECTED`).

## Testes

```bash
node --test
```
