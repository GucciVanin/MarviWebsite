// Demo data for trying the portals on the LOCAL dev stack only (http://localhost:8080), created through the real API.
// Run from the project root:  node deploy/seed-demo.mjs   (the stack must be up and its database EMPTY: see deploy/reset-dev.sh).
// The admin comes from deploy/.env (or deploy/.env.example). All accounts below are throwaway dev values.
//
//   admin     admin@marvi.local               (see deploy/.env.example)
//   employee  funcionario@demo.marvi.test     / Demo-Func-1!
//   customers (all with password Demo-Cliente-1!)
//     cliente@demo.marvi.test    Bar do Demo                      Approved, Standard tier, has a priced quote and a quote in the queue
//     mercado@demo.marvi.test    Mercado Atacadão Demo            Approved, Atacado tier, has an order
//     pendente@demo.marvi.test   Mercearia Aguardando Aprovação   Pending (try "Aprovar" in the admin area)
//     suspenso@demo.marvi.test   Loja Suspensa Demo               Suspended
//     pessoa@demo.marvi.test     João da Silva (conta pessoal)    Approved, Standard tier, a personal account with CPF and birth date
//   Business accounts carry a CNPJ and the rest of the company data (the Pending one has only a CNPJ, so the completeness indicator shows what is missing;
//   the wholesale market has the Receita's alphanumeric CNPJ example). The numbers are the usual public test numbers, not real people or companies.
//
// Catalog: 4 categories, 8 products (one without a price, one out of stock), prices in two tiers, stock in two warehouses
// with coverage areas, and one running deal.

import { readFileSync } from 'node:fs';

const API = 'http://localhost:8080';
// The stack uses deploy/.env when it exists (that is where the admin the API really seeds comes from), else the example values.
const envText = (() => {
  for (const file of ['./.env', './.env.example']) {
    try { return readFileSync(new URL(file, import.meta.url), 'utf8'); } catch { /* try the next one */ }
  }
  return '';
})();
const env = (name, fallback) => new RegExp(`^${name}=(.*)$`, 'm').exec(envText)?.[1]?.trim() ?? fallback;
const ADMIN = { email: env('SEED_ADMIN_EMAIL', 'admin@marvi.local'), password: env('SEED_ADMIN_PASSWORD', '') };
const CUSTOMER_PASSWORD = 'Demo-Cliente-1!';
const EMPLOYEE = { email: 'funcionario@demo.marvi.test', password: 'Demo-Func-1!' };

const call = async (method, path, token, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`.slice(0, 300));
  return json;
};
const login = async (account) => (await call('POST', '/api/auth/login', null, account)).token;

const admin = await login(ADMIN);
if ((await call('GET', '/api/admin/categories', admin)).length > 0) {
  console.log('The database already has data. Run deploy/reset-dev.sh --yes to wipe the dev database and seed it again.');
  process.exit(1);
}

// ---- pricing tiers (the default one, "Standard", is created by the API itself)
const tiers = await call('GET', '/api/admin/pricing-tiers', admin);
const standard = tiers.find((t) => t.isDefault);
const atacado = await call('POST', '/api/admin/pricing-tiers', admin, { name: 'Atacado', isDefault: false });

// ---- categories
const category = {};
for (const [order, name] of [[1, 'Cervejas'], [2, 'Refrigerantes'], [3, 'Águas'], [4, 'Energéticos']]) {
  category[name] = await call('POST', '/api/admin/categories', admin, { name, sortOrder: order, isActive: true });
}

// ---- warehouses and coverage
const sp = await call('POST', '/api/admin/warehouses', admin, { name: 'CD São Paulo', address: 'Av. Industrial, 100, São Paulo, SP', latitude: -23.5505, longitude: -46.6333 });
const campinas = await call('POST', '/api/admin/warehouses', admin, { name: 'CD Campinas', address: 'Rod. dos Bandeirantes, km 90, Campinas, SP', latitude: -22.9099, longitude: -47.0626 });
for (const warehouse of [sp, campinas]) {
  await call('POST', '/api/admin/coverage-areas', admin, { warehouseId: warehouse.id, type: 'Radius', radiusMiles: 30, polygonGeoJson: null });
}

// ---- products: sku, name, category, Standard price, Atacado price, stock in São Paulo / Campinas, attributes
const products = {};
const catalog = [
  ['CERV-LAGER-600', 'Cerveja Lager 600ml', 'Cervejas', 9.0, 7.8, 200, 150, { Marca: 'Serra Azul', Volume: '600 ml' }],
  ['CERV-PILSEN-350', 'Cerveja Pilsen 350ml', 'Cervejas', 4.2, 3.6, 300, 0, { Marca: 'Serra Azul', Volume: '350 ml' }],
  ['REFRI-COLA-2L', 'Refrigerante Cola 2L', 'Refrigerantes', 8.5, 7.4, 150, 80, { Volume: '2 L' }],
  ['REFRI-LARANJA-2L', 'Refrigerante Laranja 2L', 'Refrigerantes', 7.9, 6.9, 0, 0, { Volume: '2 L' }],
  ['AGUA-500', 'Água Mineral 500ml', 'Águas', 2.1, 1.7, 600, 400, { Volume: '500 ml' }],
  ['AGUA-GAS-500', 'Água com Gás 500ml', 'Águas', 2.6, 2.1, 250, 0, { Volume: '500 ml' }],
  ['ENERG-250', 'Energético 250ml', 'Energéticos', 6.5, 5.6, 120, 60, { Volume: '250 ml' }],
  ['MIXER-TONICA', 'Água Tônica 350ml (sem preço cadastrado)', 'Águas', null, null, 40, 0, { Volume: '350 ml' }],
];
for (const [sku, name, categoryName, standardPrice, atacadoPrice, stockSp, stockCampinas, attributes] of catalog) {
  const product = await call('POST', '/api/admin/products', admin, { sku, name, description: null, categoryId: category[categoryName].id, imageUrl: null, isActive: true, attributes });
  products[sku] = product;
  if (standardPrice !== null) {
    await call('PUT', `/api/admin/products/${product.id}/pricing`, admin, { pricingTierId: standard.id, unitPrice: standardPrice, minQty: 1 });
    await call('PUT', `/api/admin/products/${product.id}/pricing`, admin, { pricingTierId: atacado.id, unitPrice: atacadoPrice, minQty: 1 });
  }
  await call('PUT', '/api/admin/inventory', admin, { productId: product.id, warehouseId: sp.id, qtyOnHand: stockSp, reorderPoint: 20 });
  if (stockCampinas > 0) await call('PUT', '/api/admin/inventory', admin, { productId: product.id, warehouseId: campinas.id, qtyOnHand: stockCampinas, reorderPoint: 20 });
}

// ---- a running deal: 10% off every beer
const day = 86400000;
await call('POST', '/api/admin/deals', admin, {
  name: 'Cervejas -10%', discountType: 'Percent', discountValue: 10, startDate: new Date(Date.now() - day).toISOString(), endDate: new Date(Date.now() + 30 * day).toISOString(),
  productIds: [], categoryIds: [category.Cervejas.id], minQty: 1,
});

// ---- people
await call('POST', '/api/admin/employees', admin, { email: EMPLOYEE.email, password: EMPLOYEE.password, employeeCode: 'FUNC-001', department: 'Vendas', hireDate: new Date().toISOString() });
const customers = {};
// Registration data (MRV-9.4): the account type and its fields. The CNPJs and the CPF are public test numbers with valid check digits.
const company = (over) => ({
  phone: '(11) 3333-4444', invoiceEmail: 'nfe@demo.marvi.test', legalName: 'Demo Comércio de Bebidas Ltda', tradeName: 'Demo', stateRegistrationStatus: 'Contributor',
  stateRegistration: '110.042.490.114', municipalRegistration: '1.234.567-8', mainCnae: '4723-7/00', taxRegime: 'SimplesNacional', openingDate: '2012-03-15', contactName: 'Responsável Demo', ...over,
});
// Each customer registers with a structured billing address (MRV-9.3): [key, email, name, street, number, district, CEP, account type, registration].
for (const [key, email, companyName, street, number, district, postalCode, accountType, registration] of [
  ['bar', 'cliente@demo.marvi.test', 'Bar do Demo', 'Rua Augusta', '1200', 'Consolação', '01304-001', 'Business', company({ cnpj: '11.222.333/0001-81', tradeName: 'Bar do Demo', legalName: 'Bar do Demo Ltda' })],
  ['mercado', 'mercado@demo.marvi.test', 'Mercado Atacadão Demo', 'Avenida Paulista', '900', 'Bela Vista', '01310-100', 'Business', company({ cnpj: '12.ABC.345/01DE-35', legalName: 'Mercado Atacadão Demo S.A.', tradeName: 'Atacadão Demo', taxRegime: 'LucroPresumido' })],
  ['pendente', 'pendente@demo.marvi.test', 'Mercearia Aguardando Aprovação', 'Rua da Consolação', '45', 'Centro', '01302-000', 'Business', { cnpj: '11.444.777/0001-61' }],
  ['suspenso', 'suspenso@demo.marvi.test', 'Loja Suspensa Demo', 'Rua Oscar Freire', '300', 'Jardins', '01426-001', 'Business', company({ stateRegistrationStatus: 'Exempt', stateRegistration: null })],
  ['pessoa', 'pessoa@demo.marvi.test', 'João da Silva', 'Rua Haddock Lobo', '595', 'Cerqueira César', '01414-001', 'Personal', { cpf: '111.444.777-35', birthDate: '1990-03-02', phone: '(11) 98888-7777', invoiceEmail: 'joao@demo.marvi.test' }],
]) {
  const { id } = await call('POST', '/api/auth/register', null, {
    email, password: CUSTOMER_PASSWORD, companyName,
    billingAddress: { label: 'Matriz', postalCode, street, number, district, city: 'São Paulo', state: 'SP' },
    accountType, registration,
  });
  customers[key] = { id, email, token: await login({ email, password: CUSTOMER_PASSWORD }) };
}
// Registration leaves a customer Pending: the admin approves, choosing the tier (nobody is approved by default).
await call('PUT', `/api/admin/clients/${customers.bar.id}/approve`, admin, { pricingTierId: standard.id });
await call('PUT', `/api/admin/clients/${customers.mercado.id}/approve`, admin, { pricingTierId: atacado.id });
await call('PUT', `/api/admin/clients/${customers.pessoa.id}/approve`, admin, { pricingTierId: standard.id });
await call('PUT', `/api/admin/clients/${customers.suspenso.id}/approve`, admin, { pricingTierId: standard.id });
await call('PUT', `/api/admin/clients/${customers.suspenso.id}/suspend`, admin);
// The bar keeps a second address of each kind besides its headquarters (Both: billing and default delivery): a delivery point and a branch.
await call('POST', '/api/client/addresses', customers.bar.token, {
  label: 'Filial Campinas', kind: 'Delivery', postalCode: '13010-111', street: 'Avenida das Flores', number: '200', complement: 'Loja 2', district: 'Centro', city: 'Campinas', state: 'SP',
  deliveryNotes: 'Entregas de segunda a sexta, das 8h às 12h.',
});
await call('POST', '/api/client/addresses', customers.bar.token, {
  label: 'Depósito Guarulhos', kind: 'Delivery', postalCode: '07190-100', street: 'Rua do Depósito', number: 's/n', district: 'Cumbica', city: 'Guarulhos', state: 'SP',
});

// ---- quotes and orders
const employee = await login(EMPLOYEE);
const quote = (token, lines) => call('POST', '/api/quotes', token, { lineItems: lines.map(([sku, qty]) => ({ productId: products[sku].id, qty })) });
const priceQuote = (q, discount = 0) => call('PUT', `/api/employee/quotes/${q.id}/price`, employee, {
  lineItems: q.lineItems.map((line) => ({ lineItemId: line.id, finalUnitPrice: Math.round((line.suggestedUnitPrice ?? 0) * (1 - discount) * 100) / 100 })),
});
// A priced quote waiting for the customer to accept it, and a new one waiting in the employee's queue.
await priceQuote(await quote(customers.bar.token, [['REFRI-COLA-2L', 12], ['AGUA-500', 24]]), 0.05);
await quote(customers.bar.token, [['CERV-LAGER-600', 10]]);
// An accepted quote (an order made by the customer) and an order the employee placed directly.
const accepted = await priceQuote(await quote(customers.mercado.token, [['CERV-PILSEN-350', 48], ['ENERG-250', 12]]));
await call('POST', `/api/quotes/${accepted.id}/accept`, customers.mercado.token);
await call('POST', '/api/employee/orders', employee, { clientId: customers.bar.id, deliveryAddress: 'Rua Augusta, 1200, Consolação, São Paulo, SP, CEP 01304-001', lineItems: [{ productId: products['AGUA-GAS-500'].id, qty: 36 }] });

console.log('Demo data created: 4 categories, 8 products, 2 warehouses, 1 deal, 1 employee, 5 customers (4 companies, 1 person), quotes and orders.');
console.log(`Sign in as the admin (${ADMIN.email}), the employee (${EMPLOYEE.email}) or a customer (cliente@, mercado@, pendente@, suspenso@, pessoa@demo.marvi.test).`);
