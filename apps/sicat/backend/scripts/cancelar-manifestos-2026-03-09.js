#!/usr/bin/env node
/**
 * DL-020: Cancelar todos os manifestos do dia 09/03/2026 encontrados na pesquisa CETESB
 */

import https from 'https';

const TOKEN = process.env.CETESB_JWT_TOKEN || '';
const partnerCode = 176163;
const stateCode = 26;
const tipoManifesto = 8;
const date = '09-03-2026';
const status = 0;
const kind = 'all';

function getManifestos() {
  return new Promise((resolve, reject) => {
    const path = `/api/mtr/pesquisaManifesto/${partnerCode}/${stateCode}/${tipoManifesto}/${date}/${date}/${status}/${kind}`;
    const options = {
      hostname: 'mtrr.cetesb.sp.gov.br',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${TOKEN}`,
        'Origin': 'https://mtr.cetesb.sp.gov.br',
        'Referer': 'https://mtr.cetesb.sp.gov.br/',
        'Content-Type': 'application/json;charset=UTF-8'
      },
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.objetoResposta || []);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Timeout')));
    req.end();
  });
}

function cancelarManifesto(manCodigo, manNumero) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      manCodigo: Number(manCodigo),
      manNumero: String(manNumero),
      manJustificativaCancelamento: 'Cancelamento em lote DL-020'
    });
    const options = {
      hostname: 'mtrr.cetesb.sp.gov.br',
      port: 443,
      path: '/api/mtr/manifesto/cancelaManifesto',
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Authorization': `Bearer ${TOKEN}`,
        'Origin': 'https://mtr.cetesb.sp.gov.br',
        'Referer': 'https://mtr.cetesb.sp.gov.br/',
        'Content-Type': 'application/json;charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData)
      },
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, response: json });
        } catch (e) {
          resolve({ status: res.statusCode, response: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  if (!TOKEN) {
    throw new Error('CETESB_JWT_TOKEN nao definido. Configure a variavel de ambiente para executar este script.');
  }

  console.log('🔎 Buscando manifestos do dia 09/03/2026 na CETESB...');
  const manifestos = await getManifestos();
  console.log(`Encontrados: ${manifestos.length}`);
  let cancelados = 0;
  for (const m of manifestos) {
    if (!m.manCodigo || !m.manNumero) continue;
    console.log(`Cancelando: manCodigo=${m.manCodigo}, manNumero=${m.manNumero}...`);
    try {
      const result = await cancelarManifesto(m.manCodigo, m.manNumero);
      if (result.status === 200 && result.response && result.response.erro === false) {
        console.log(`  ✅ Sucesso: ${result.response.mensagem}`);
        cancelados++;
      } else {
        console.log(`  ❌ Falha:`, result.response);
      }
    } catch (e) {
      console.log(`  ❌ Erro:`, e.message);
    }
  }
  console.log(`\nTotal cancelados: ${cancelados} de ${manifestos.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
