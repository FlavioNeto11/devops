import { query } from '../db/pool.js';
import { ensureAccessControlBaseData } from './access-control-seed.js';

export async function ensureBaseData() {
  await query(
    `insert into integration_accounts(id, account_name, partner_code, partner_document, state_code)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       account_name = excluded.account_name,
       partner_code = excluded.partner_code,
       partner_document = excluded.partner_document,
       state_code = excluded.state_code,
       updated_at = now()`,
    ['acc_nova_it_prod', 'Nova IT - Produção', 176163, '31913781000139', 26]
  );

  // Catálogo RBAC da superfície conversacional (fase 4.5). Aqui dentro para herdar o gate
  // `config.autoSeed` — que é o kill switch por Deployment, já provado em `k8s/backend.yaml`.
  //
  // Falha NÃO derruba o boot: derrubar api + worker por causa de uma feature do CHAT seria
  // desproporcional (MTR/DMR/CETESB, que é o produto, continuam no ar), e o gate de 3 estados já
  // protege contra o lockout — chave ausente é insatisfazível por qualquer um, então leitura passa e
  // ação nega. Mas NUNCA silenciosa: erro alto no log, e o passo de verificação read-only é
  // BLOQUEANTE do flip de `observe` para `enforce`.
  //
  // ⚠️ Assimetria deliberada, fácil de implementar ao contrário: falha do GRANT no login é
  // best-effort (degrada para zero permissões = fail-CLOSED); falha do SEED é ruidosa. Inverter as
  // duas reproduz o modo de falha que a fase 4.5 existe para eliminar.
  try {
    const seedResult = await ensureAccessControlBaseData();
    console.log(`[access-control-seed] catalogo reconciliado ${JSON.stringify(seedResult)}`);
  } catch (error: unknown) {
    console.error(
      '[access-control-seed] FALHA ao reconciliar o catalogo RBAC. O gate conversacional opera em modo '
        + 'DEGRADADO (leitura passa, acao nega) ate o proximo boot bem-sucedido. NAO promova o '
        + `enforcement enquanto isto nao estiver verde: ${error instanceof Error ? error.stack || error.message : String(error)}`
    );
  }
}
