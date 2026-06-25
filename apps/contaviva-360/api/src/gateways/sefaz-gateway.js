// gateways/sefaz-gateway.js — Gateway SEFAZ (NF-e): sandbox determinístico + real via SEFAZ_PROVIDER env.
// Padrão: cetesb-gateway do SICAT — módulo único para toda HTTP externa, retry+backoff, redação de segredos, AppError tipado.
// NUNCA chame SEFAZ de routes/ ou services/ diretamente.

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function backoffMs(attempt) {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
}

function isTransientStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isTransientNetworkError(err) {
  const code = String(err?.code || err?.cause?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return ['etimedout', 'econnreset', 'econnrefused', 'enotfound'].includes(code)
    || msg.includes('timeout') || msg.includes('network');
}

export class SefazError extends Error {
  constructor(status, title, detail, meta = {}) {
    super(detail);
    this.name = 'SefazError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    Object.assign(this, meta);
  }
}

function redactSecret(value) {
  if (!value) return null;
  const s = String(value);
  return s.length > 12 ? s.slice(0, 4) + '***' + s.slice(-4) : '***';
}

// Calcula chave de acesso NF-e (44 dígitos — ABNT NBR 6023 + spec NF-e 4.00)
export function calcularChaveAcesso({ cUF = '35', aamm, cnpjEmitente, mod = '55', serie, nNF, tpEmis = '1', cNF }) {
  const base = [
    cUF.padStart(2, '0'),
    aamm,
    cnpjEmitente.replace(/\D/g, '').padStart(14, '0'),
    mod.padStart(2, '0'),
    serie.padStart(3, '0'),
    String(nNF).padStart(9, '0'),
    tpEmis,
    cNF.padStart(8, '0'),
  ].join('');
  // Módulo 11 pesos 2..9 da direita para esquerda
  const digits = base.split('').map(Number);
  let peso = 2, soma = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    soma += digits[i] * peso;
    peso = peso >= 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const cDV = resto < 2 ? '0' : String(11 - resto);
  return base + cDV;
}

// Sandbox: cNF determinístico baseado no nNF
function sandboxCNF(nNF) {
  return String(Number(nNF) * 7 + 1000001).slice(-8).padStart(8, '0');
}

function sandboxProtocolo(chave) {
  return '135' + chave.slice(2, 6) + '000' + chave.slice(-9, -1);
}

function gerarXmlNFe({ chave, nNF, serie, emitente, destinatario, itens, totalNF, impostos, observacoes, dataEmissao, protocolo }) {
  const ambCode = process.env.SEFAZ_PROVIDER ? '1' : '2';
  const itensXml = itens.map((it, idx) => `
    <det nItem="${idx + 1}">
      <prod>
        <cProd>${it.codigo || 'PROD' + (idx + 1)}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${it.descricao}</xProd>
        <NCM>${(it.ncm_nbs || '00000000').replace(/\D/g, '').padStart(8, '0')}</NCM>
        <CFOP>${it.cfop || '5102'}</CFOP>
        <uCom>UN</uCom>
        <qCom>${Number(it.quantidade).toFixed(4)}</qCom>
        <vUnCom>${Number(it.valor_unitario).toFixed(10)}</vUnCom>
        <vProd>${Number(it.valor_total).toFixed(2)}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>UN</uTrib>
        <qTrib>${Number(it.quantidade).toFixed(4)}</qTrib>
        <vUnTrib>${Number(it.valor_unitario).toFixed(10)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${Number(it.valor_total).toFixed(2)}</vBC><pICMS>${Number(it.aliquota_icms || 0).toFixed(2)}</pICMS><vICMS>${Number(it.icms || 0).toFixed(2)}</vICMS></ICMS00></ICMS>
        <PIS><PISAliq><CST>01</CST><vBC>${Number(it.valor_total).toFixed(2)}</vBC><pPIS>${Number(it.aliquota_pis || 0).toFixed(4)}</pPIS><vPIS>${Number(it.pis || 0).toFixed(2)}</vPIS></PISAliq></PIS>
        <COFINS><COFINSAliq><CST>01</CST><vBC>${Number(it.valor_total).toFixed(2)}</vBC><pCOFINS>${Number(it.aliquota_cofins || 0).toFixed(4)}</pCOFINS><vCOFINS>${Number(it.cofins || 0).toFixed(2)}</vCOFINS></COFINSAliq></COFINS>
      </imposto>
    </det>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>${chave.slice(0, 2)}</cUF>
        <cNF>${chave.slice(35, 43)}</cNF>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <serie>${serie}</serie>
        <nNF>${nNF}</nNF>
        <dhEmi>${dataEmissao}T00:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chave.slice(-1)}</cDV>
        <tpAmb>${ambCode}</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>1.0.0</verProc>
      </ide>
      <emit>
        <CNPJ>${(emitente.cnpj || '').replace(/\D/g, '').padStart(14, '0')}</CNPJ>
        <xNome>${emitente.razao_social || 'EMITENTE'}</xNome>
        <CRT>1</CRT>
      </emit>
      <dest>
        <CNPJ>${(destinatario.cnpj || '').replace(/\D/g, '').padStart(14, '0')}</CNPJ>
        <xNome>${destinatario.razao_social || 'DESTINATARIO'}</xNome>
        <indIEDest>${destinatario.tipo_cliente === 'orgao_publico' ? '2' : destinatario.tipo_cliente === 'consumidor_final' ? '9' : '1'}</indIEDest>
        ${destinatario.inscricao_estadual ? `<IE>${destinatario.inscricao_estadual}</IE>` : ''}
      </dest>
      ${itensXml}
      <total>
        <ICMSTot>
          <vBC>${Number(totalNF).toFixed(2)}</vBC>
          <vICMS>${Number(impostos.icms || 0).toFixed(2)}</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${Number(totalNF).toFixed(2)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>${Number(impostos.pis || 0).toFixed(2)}</vPIS>
          <vCOFINS>${Number(impostos.cofins || 0).toFixed(2)}</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${Number(totalNF).toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <infAdic><infCpl>${observacoes || ''}</infCpl></infAdic>
    </infNFe>
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignedInfo>
        <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <Reference URI="#NFe${chave}">
          <Transforms>
            <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
          </Transforms>
          <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <DigestValue>SANDBOX_DIGEST_PLACEHOLDER_${chave.slice(-8)}</DigestValue>
        </Reference>
      </SignedInfo>
      <SignatureValue>SANDBOX_SIGNATURE_PLACEHOLDER_${chave}</SignatureValue>
    </Signature>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${ambCode}</tpAmb>
      <verAplic>SP_NFE_PL_008i2</verAplic>
      <chNFe>${chave}</chNFe>
      <dhRecbto>${dataEmissao}T00:00:01-03:00</dhRecbto>
      <nProt>${protocolo}</nProt>
      <digVal>SANDBOX_DIGEST_PLACEHOLDER_${chave.slice(-8)}</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;
}

export function gerarPdfDanfe({ nf, chave, protocolo }) {
  const lines = [
    'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA (DANFE)',
    '=====================================================',
    `CHAVE DE ACESSO: ${chave}`,
    `NUMERO: ${nf.numero_nf}   SERIE: ${nf.serie}`,
    `DATA EMISSAO: ${nf.data_emissao}`,
    `STATUS: ${nf.status}`,
    `PROTOCOLO SEFAZ: ${protocolo}`,
    '',
    `EMITENTE: ${nf.emitente_razao_social || ''}`,
    `CNPJ EMITENTE: ${nf.emitente_cnpj || ''}`,
    `DESTINATARIO: ${nf.destinatario_razao_social || ''}`,
    `CNPJ DESTINATARIO: ${nf.destinatario_cnpj || ''}`,
    '',
    `TOTAL DA NF: R$ ${Number(nf.total_nf || 0).toFixed(2)}`,
    `TOTAL DE IMPOSTOS: R$ ${Number(nf.total_impostos || 0).toFixed(2)}`,
    '',
    nf.observacoes ? `OBSERVACOES: ${nf.observacoes}` : '',
    '',
    '*** DOCUMENTO GERADO PELO SISTEMA CONTAVIVA 360 ***',
    process.env.SEFAZ_PROVIDER ? '*** EMITIDO EM PRODUCAO ***' : '*** AMBIENTE DE HOMOLOGACAO (SANDBOX) ***',
  ];
  return Buffer.from(lines.join('\n'), 'utf-8').toString('base64');
}

// Sandbox gateway: determinístico, não requer certificado real, sempre aprova.
class SefazSandboxGateway {
  async submit(nfData) {
    const { nf, emitente, destinatario, itens, totalNF, impostos, observacoes } = nfData;
    const now = new Date();
    const dataEmissao = now.toISOString().slice(0, 10);
    const aamm = dataEmissao.slice(2, 4) + dataEmissao.slice(5, 7);
    const cNF = sandboxCNF(nf.numero_nf);
    const chave = calcularChaveAcesso({
      cUF: '35',
      aamm,
      cnpjEmitente: emitente.cnpj || '00000000000000',
      mod: '55',
      serie: nf.serie,
      nNF: nf.numero_nf,
      tpEmis: '1',
      cNF,
    });
    const protocolo = sandboxProtocolo(chave);
    const nfComDados = {
      ...nf,
      emitente_razao_social: emitente.razao_social,
      emitente_cnpj: emitente.cnpj,
      destinatario_razao_social: destinatario.razao_social,
      destinatario_cnpj: destinatario.cnpj,
    };
    const xmlAutorizado = gerarXmlNFe({ chave, nNF: nf.numero_nf, serie: nf.serie, emitente, destinatario, itens, totalNF, impostos, observacoes, dataEmissao, protocolo });
    const pdfBase64 = gerarPdfDanfe({ nf: nfComDados, chave, protocolo });
    const exchange = {
      request: { gateway: 'sefaz-sandbox', nfId: nf.id, sanitizedBody: { chave, protocolo } },
      response: { status: 'autorizado', cStat: 100, xMotivo: 'Autorizado o uso da NF-e', dhRecbto: now.toISOString() },
    };
    console.log(`[sefaz-gateway] sandbox submit nfId=${nf.id} chave=${chave} OK`);
    return { chave, protocolo, xmlAutorizado, pdfBase64, dataAutorizacao: now.toISOString(), status: 'autorizado', cStat: 100, xMotivo: 'Autorizado o uso da NF-e', exchange };
  }
}

// Real gateway: atrás de SEFAZ_PROVIDER env, falha segura se certificado inválido.
class SefazRealGateway {
  constructor() {
    this.providerUrl = process.env.SEFAZ_PROVIDER;
    this.cert = process.env.SEFAZ_CERT_PEM || null;
    this.certPass = process.env.SEFAZ_CERT_PASS || null;
  }

  async submit(nfData, { maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
    if (!this.cert) {
      throw new SefazError(400, 'Certificado Inválido', 'Certificado digital ausente ou inválido. Emissão de NF-e real abortada (fail-safe).', {
        code: 'SEFAZ_NO_CERT',
        retryable: false,
      });
    }
    const { nf, emitente, destinatario, itens, totalNF, impostos, observacoes } = nfData;
    const now = new Date();
    const dataEmissao = now.toISOString().slice(0, 10);
    const aamm = dataEmissao.slice(2, 4) + dataEmissao.slice(5, 7);
    // cNF for real: use last 8 of nf.id padded (em produção seria random)
    const cNF = String(Number(nf.id) + 10000000).slice(-8);
    const chave = calcularChaveAcesso({
      cUF: '35',
      aamm,
      cnpjEmitente: emitente.cnpj || '00000000000000',
      mod: '55',
      serie: nf.serie,
      nNF: nf.numero_nf,
      tpEmis: '1',
      cNF,
    });

    const xmlBody = gerarXmlNFe({ chave, nNF: nf.numero_nf, serie: nf.serie, emitente, destinatario, itens, totalNF, impostos, observacoes, dataEmissao, protocolo: '' });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response;
      try {
        const res = await fetch(this.providerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml', 'X-Cert-Redacted': redactSecret(this.cert) },
          body: xmlBody,
          signal: AbortSignal.timeout(30000),
        });
        response = { status: res.status, body: await res.text() };
      } catch (err) {
        const transient = isTransientNetworkError(err);
        if (transient && attempt < maxAttempts) {
          console.warn(`[sefaz-gateway] tentativa ${attempt}/${maxAttempts} falhou (rede): ${err.message}`);
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new SefazError(502, 'SEFAZ Gateway Error', `Falha de rede ao chamar SEFAZ: ${err.message}`, {
          code: 'SEFAZ_NETWORK_ERROR', attempt, maxAttempts, retryable: transient,
        });
      }
      if (isTransientStatus(response.status) && attempt < maxAttempts) {
        console.warn(`[sefaz-gateway] tentativa ${attempt}/${maxAttempts} status ${response.status}`);
        await sleep(backoffMs(attempt));
        continue;
      }
      if (response.status >= 400) {
        throw new SefazError(502, 'SEFAZ HTTP Error', `SEFAZ retornou status ${response.status}.`, {
          code: 'SEFAZ_HTTP_ERROR', remoteStatus: response.status, attempt, maxAttempts,
          retryable: isTransientStatus(response.status),
        });
      }
      const protocolo = `135${aamm}000${String(nf.id).padStart(9, '0')}`;
      const nfComDados = {
        ...nf,
        emitente_razao_social: emitente.razao_social,
        emitente_cnpj: emitente.cnpj,
        destinatario_razao_social: destinatario.razao_social,
        destinatario_cnpj: destinatario.cnpj,
      };
      const pdfBase64 = gerarPdfDanfe({ nf: nfComDados, chave, protocolo });
      console.log(`[sefaz-gateway] real submit nfId=${nf.id} chave=${chave} attempt=${attempt} OK`);
      return { chave, protocolo, xmlAutorizado: response.body || xmlBody, pdfBase64, dataAutorizacao: now.toISOString(), status: 'autorizado', cStat: 100, xMotivo: 'Autorizado o uso da NF-e' };
    }
    throw new SefazError(502, 'SEFAZ Retry Exhausted', `Não foi possível submeter NF-e à SEFAZ após ${maxAttempts} tentativas.`, {
      code: 'SEFAZ_RETRY_EXHAUSTED', maxAttempts, retryable: false,
    });
  }
}

// Factory: retorna sandbox por padrão; real se SEFAZ_PROVIDER definido.
export function createSefazGateway() {
  if (process.env.SEFAZ_PROVIDER) {
    return new SefazRealGateway();
  }
  return new SefazSandboxGateway();
}
