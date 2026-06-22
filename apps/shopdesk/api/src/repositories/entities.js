// repositories/entities.js — declaração canônica das entidades de domínio do ShopDesk.
// Fonte única para (a) a migração (DDL + seed em db.js) e (b) os repos CRUD + rotas finas em server.js.
// Cada entidade: route (segmento da URL), table (tabela física), columns (campos gravaveis + tipo SQL), seed (linhas exemplo).
// Tipos do contrato (text/longtext/currency/number/boolean/status/enum/datetime) → tipo SQL coluna.

const TYPE_SQL = {
  text: 'TEXT',
  longtext: 'TEXT',
  currency: 'NUMERIC(14,2)',
  number: 'INTEGER',
  boolean: 'BOOLEAN',
  status: 'TEXT',
  enum: 'TEXT',
  datetime: 'TIMESTAMPTZ',
};

// camelCase → snake_case (coluna física). As rotas/repos expõem snake_case do Postgres, como em records.
export function colName(name) {
  return name.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

export function sqlType(type) {
  return TYPE_SQL[type] || 'TEXT';
}

// As entidades. `createdAt/updatedAt/at/lastLoginAt` viram colunas próprias do tipo datetime
// (além das created_at/updated_at de auditoria que TODA tabela ganha).
export const ENTITIES = [
  {
    route: 'products',
    table: 'products',
    columns: [
      { name: 'sku', type: 'text', required: true },
      { name: 'name', type: 'text', required: true },
      { name: 'description', type: 'longtext', required: false },
      { name: 'category', type: 'text', required: false },
      { name: 'price', type: 'currency', required: true },
      { name: 'cost', type: 'currency', required: false },
      { name: 'stockQty', type: 'number', required: true },
      { name: 'active', type: 'boolean', required: true },
      { name: 'status', type: 'status', required: false },
    ],
    seed: [
      { sku: 'SKU-001', name: 'Camiseta Básica', description: 'Algodão pima', category: 'Vestuário', price: 79.9, cost: 30, stock_qty: 120, active: true, status: 'publicado' },
      { sku: 'SKU-002', name: 'Caneca Cerâmica', description: '350ml', category: 'Casa', price: 39.9, cost: 12, stock_qty: 40, active: true, status: 'publicado' },
      { sku: 'SKU-003', name: 'Tênis Runner', description: 'Edição limitada', category: 'Calçados', price: 299.9, cost: 140, stock_qty: 0, active: false, status: 'arquivado' },
    ],
  },
  {
    route: 'orders',
    table: 'orders',
    columns: [
      { name: 'code', type: 'text', required: true },
      { name: 'customerName', type: 'text', required: true },
      { name: 'customerEmail', type: 'text', required: false },
      { name: 'total', type: 'currency', required: true },
      { name: 'itemsCount', type: 'number', required: false },
      { name: 'status', type: 'status', required: true },
      { name: 'paymentStatus', type: 'status', required: false },
      { name: 'trackingCode', type: 'text', required: false },
    ],
    seed: [
      { code: 'PED-1001', customer_name: 'Ana Souza', customer_email: 'ana@exemplo.com', total: 119.8, items_count: 2, status: 'pago', payment_status: 'aprovado', tracking_code: null },
      { code: 'PED-1002', customer_name: 'Bruno Lima', customer_email: 'bruno@exemplo.com', total: 299.9, items_count: 1, status: 'em_separacao', payment_status: 'aprovado', tracking_code: null },
      { code: 'PED-1003', customer_name: 'Carla Dias', customer_email: 'carla@exemplo.com', total: 39.9, items_count: 1, status: 'pendente', payment_status: 'aguardando', tracking_code: null },
    ],
  },
  {
    route: 'carts',
    table: 'carts',
    columns: [
      { name: 'customerName', type: 'text', required: false },
      { name: 'itemsCount', type: 'number', required: false },
      { name: 'subtotal', type: 'currency', required: false },
      { name: 'status', type: 'status', required: true },
    ],
    seed: [
      { customer_name: 'Ana Souza', items_count: 3, subtotal: 199.7, status: 'aberto' },
      { customer_name: 'Visitante', items_count: 1, subtotal: 79.9, status: 'abandonado' },
      { customer_name: 'Bruno Lima', items_count: 2, subtotal: 119.8, status: 'convertido' },
    ],
  },
  {
    route: 'inventory',
    table: 'inventory',
    columns: [
      { name: 'sku', type: 'text', required: true },
      { name: 'productName', type: 'text', required: true },
      { name: 'quantity', type: 'number', required: true },
      { name: 'reorderPoint', type: 'number', required: false },
      { name: 'location', type: 'text', required: false },
      { name: 'status', type: 'status', required: false },
    ],
    seed: [
      { sku: 'SKU-001', product_name: 'Camiseta Básica', quantity: 120, reorder_point: 20, location: 'CD-SP', status: 'ok' },
      { sku: 'SKU-002', product_name: 'Caneca Cerâmica', quantity: 8, reorder_point: 15, location: 'CD-SP', status: 'baixo' },
      { sku: 'SKU-003', product_name: 'Tênis Runner', quantity: 0, reorder_point: 10, location: 'CD-RJ', status: 'esgotado' },
    ],
  },
  {
    route: 'reorders',
    table: 'reorders',
    columns: [
      { name: 'sku', type: 'text', required: true },
      { name: 'productName', type: 'text', required: false },
      { name: 'quantity', type: 'number', required: true },
      { name: 'supplier', type: 'text', required: false },
      { name: 'status', type: 'status', required: true },
    ],
    seed: [
      { sku: 'SKU-002', product_name: 'Caneca Cerâmica', quantity: 50, supplier: 'Cerâmica Vale', status: 'solicitada' },
      { sku: 'SKU-003', product_name: 'Tênis Runner', quantity: 30, supplier: 'Runner Co', status: 'rascunho' },
    ],
  },
  {
    route: 'users',
    table: 'users',
    columns: [
      { name: 'email', type: 'text', required: true },
      { name: 'name', type: 'text', required: false },
      { name: 'role', type: 'enum', required: true },
      { name: 'active', type: 'boolean', required: true },
      { name: 'lastLoginAt', type: 'datetime', required: false },
    ],
    seed: [
      { email: 'owner@shopdesk.local', name: 'Dono da Loja', role: 'owner', active: true, last_login_at: null },
      { email: 'admin@shopdesk.local', name: 'Administrador', role: 'admin', active: true, last_login_at: null },
      { email: 'op@shopdesk.local', name: 'Operador', role: 'operador', active: true, last_login_at: null },
    ],
  },
  {
    route: 'audit-logs',
    table: 'audit_logs',
    columns: [
      { name: 'actor', type: 'text', required: false },
      { name: 'action', type: 'text', required: true },
      { name: 'resource', type: 'text', required: false },
      { name: 'tenant', type: 'text', required: false },
      { name: 'at', type: 'datetime', required: false },
    ],
    seed: [
      { actor: 'owner@shopdesk.local', action: 'order.paid', resource: 'PED-1001', tenant: 'default', at: null },
      { actor: 'admin@shopdesk.local', action: 'product.published', resource: 'SKU-001', tenant: 'default', at: null },
    ],
  },
];

// DDL de uma entidade: id serial, tenant_id, colunas, created_at/updated_at de auditoria.
export function ddlFor(entity) {
  const cols = entity.columns
    .map((c) => `${colName(c.name)} ${sqlType(c.type)}`)
    .join(', ');
  return `CREATE TABLE IF NOT EXISTS ${entity.table} (id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, ${cols}, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());`;
}

// INSERT de seed de uma linha (colunas já em snake_case no objeto seed).
export function seedInsertFor(entity, row) {
  const keys = Object.keys(row);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  return {
    sql: `INSERT INTO ${entity.table}(${keys.join(',')}) VALUES (${placeholders.join(',')})`,
    params: keys.map((k) => row[k]),
  };
}
