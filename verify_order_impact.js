// Verificar o impacto real da ordem nas chaves dos agregadores

const fs = require('fs');
const path = require('path');

// Ler a baseline atual
const baselinePath = 'C:\devops\specs\baseline\current-baseline.json';
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

console.log('=== BASELINE ATUAL (by_product) ===');
console.log('Keys ordem atual:', Object.keys(baseline.counts.by_product));
console.log('JSON:', JSON.stringify(baseline.counts.by_product, null, 2).split('\n').slice(0, 10).join('\n'));

console.log('\n=== by_status ===');
console.log('Keys:', Object.keys(baseline.counts.by_status));
console.log('JSON:', JSON.stringify(baseline.counts.by_status, null, 2));

console.log('\n=== by_type ===');
console.log('Keys:', Object.keys(baseline.counts.by_type));
console.log('JSON:', JSON.stringify(baseline.counts.by_type, null, 2));

// Pergunta: se ordenássemos alphabéticamente, seria diferente?
console.log('\n=== SE FOSSE ORDENADO ALFABETICAMENTE ===');
const sortedByProduct = {};
Object.keys(baseline.counts.by_product).sort().forEach(k => {
  sortedByProduct[k] = baseline.counts.by_product[k];
});
console.log('Keys alfabético:', Object.keys(sortedByProduct));
console.log('Seria diferente?', JSON.stringify(baseline.counts.by_product) !== JSON.stringify(sortedByProduct));
