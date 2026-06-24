// Teste: ordem de inserção em objetos JavaScript vs. ordem de chave
// Simulando exatamente o que build-baseline.mjs faz nas linhas 194-201

// Caso 1: requisitos em ordem de id (como no build-baseline.mjs:191)
const mockReqs = [
  { id: 'REQ-002', scope: { product_scope: 'product-b' }, status: 'in-progress', type: 'functional' },
  { id: 'REQ-001', scope: { product_scope: 'product-a' }, status: 'approved', type: 'nfr' },
  { id: 'REQ-003', scope: { product_scope: 'product-c' }, status: 'draft', type: 'constraint' },
];

// Ordenar por id (como faz a linha 191)
const reqs = mockReqs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
console.log('Requisitos ordenados por id:');
reqs.forEach(r => console.log(`  ${r.id} - ${r.scope?.product_scope}, status=${r.status}, type=${r.type}`));

// Construir agregações (linhas 194-201)
const byProduct = {};
const byStatus = {};
const byType = {};
for (const r of reqs) {
  const p = r.scope?.product_scope ?? 'unknown';
  byProduct[p] = (byProduct[p] ?? 0) + 1;
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  byType[r.type] = (byType[r.type] ?? 0) + 1;
}

console.log('\n=== OBJETOS SEM SORT EXPLÍCITO ===');
console.log('byProduct keys:', Object.keys(byProduct));
console.log('byProduct:', byProduct);
console.log('byStatus keys:', Object.keys(byStatus));
console.log('byStatus:', byStatus);
console.log('byType keys:', Object.keys(byType));
console.log('byType:', byType);

// Agora com JSON.stringify (como stable() faz)
console.log('\n=== JSON.stringify (como baseline) ===');
console.log('byProduct JSON:', JSON.stringify(byProduct, null, 2));
console.log('byStatus JSON:', JSON.stringify(byStatus, null, 2));
console.log('byType JSON:', JSON.stringify(byType, null, 2));

// Teste de determinismo: fazer 3x
console.log('\n=== TESTE DE DETERMINISMO (3 iterações) ===');
for (let i = 0; i < 3; i++) {
  const test = {};
  for (const r of reqs) {
    const p = r.scope?.product_scope ?? 'unknown';
    test[p] = (test[p] ?? 0) + 1;
  }
  console.log(`Iteração ${i+1} keys:`, Object.keys(test).join(','));
}

// Teste: verificar se JSON.stringify mantém ordem
console.log('\n=== JSON.stringify PRESERVA INSERTION ORDER? ===');
const testObj = {};
testObj['z'] = 1;
testObj['a'] = 2;
testObj['m'] = 3;
console.log('testObj:', testObj);
console.log('JSON.stringify:', JSON.stringify(testObj));
console.log('Object.keys:', Object.keys(testObj));
