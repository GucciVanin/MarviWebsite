// Demo data for trying the portals on the LOCAL dev stack only (http://localhost:8080). Idempotent.
// Run from the project root:  node deploy/seed-demo.mjs   (the stack must be up; the admin comes from deploy/.env.example).
// Creates categories, priced products with stock, a warehouse, a customer and an employee. The accounts below are throwaway dev values.
//   customer  cliente@demo.marvi.test      / Demo-Cliente-1!
//   employee  funcionario@demo.marvi.test  / Demo-Func-1!
const API = 'http://localhost:8080';
const call = async (method, path, token, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
};
const admin = (await call('POST', '/api/auth/login', null, { email: 'admin@marvi.local', password: 'Marvi-Dev-Admin-1!' })).json.token;
const existing = (await call('GET', '/api/admin/products', admin)).json;
if (existing.some((p) => p.sku === 'DEMO-COLA')) { console.log('demo data already present'); process.exit(0); }
const tiers = (await call('GET', '/api/admin/pricing-tiers', admin)).json;
const std = tiers.find((t) => t.isDefault) ?? (await call('POST', '/api/admin/pricing-tiers', admin, { name: 'Standard', isDefault: true })).json;
const cats = {};
for (const name of ['Refrigerantes', 'Águas', 'Cervejas']) cats[name] = (await call('POST', '/api/admin/categories', admin, { name, sortOrder: 1, isActive: true })).json;
const wh = (await call('POST', '/api/admin/warehouses', admin, { name: 'CD São Paulo', address: 'Av. Industrial 100', latitude: -23.55, longitude: -46.63 })).json;
for (const [sku, name, cat, price, qty] of [['DEMO-COLA', 'Refrigerante Cola 2L', 'Refrigerantes', 8.5, 120], ['DEMO-LARANJA', 'Refrigerante Laranja 2L', 'Refrigerantes', 7.9, 0], ['DEMO-AGUA', 'Água Mineral 500ml', 'Águas', 2.1, 500], ['DEMO-LAGER', 'Cerveja Lager 350ml', 'Cervejas', 3.4, 300], ['DEMO-SEMPRECO', 'Produto sem preço', 'Cervejas', null, 10]]) {
  const p = (await call('POST', '/api/admin/products', admin, { sku, name, description: null, categoryId: cats[cat].id, imageUrl: null, isActive: true, attributes: {} })).json;
  if (price !== null) await call('PUT', `/api/admin/products/${p.id}/pricing`, admin, { pricingTierId: std.id, unitPrice: price, minQty: 1 });
  await call('PUT', '/api/admin/inventory', admin, { productId: p.id, warehouseId: wh.id, qtyOnHand: qty, reorderPoint: 10 });
}
console.log('registered customer:', (await call('POST', '/api/auth/register', null, { email: 'cliente@demo.marvi.test', password: 'Demo-Cliente-1!', companyName: 'Bar do Demo', billingAddress: 'Rua Demo, 1' })).status);
console.log('employee:', (await call('POST', '/api/admin/employees', admin, { email: 'funcionario@demo.marvi.test', password: 'Demo-Func-1!', employeeCode: 'DEMO-1', department: 'Vendas', hireDate: new Date().toISOString() })).status);
