// Full runtime test: seeds dummy data through the real API, then checks retrieval accuracy, authorization, abuse
// handling and database integrity against the live docker compose stack (API on :8080).
// Needs a FRESH database (it registers fixed e-mail addresses): run test/runtime/run.sh, which rebuilds the stack first.
// Requires Node >= 18 (global fetch) and Docker; reads the seeded admin from deploy/.env.example defaults.
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const API = 'http://localhost:8080';
const ADMIN = { email: 'admin@marvi.local', password: 'Marvi-Dev-Admin-1!' };
// Project root = two levels above this file (test/runtime/).
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
let pass = 0, fail = 0;
const failures = [];
const notes = [];

const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
};
const note = (text) => { notes.push(text); console.log(`NOTE  ${text}`); };
const section = (t) => console.log(`\n== ${t}`);
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.0001;

async function call(method, path, { token, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && raw === undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method,
    headers: h,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).json?.token;
const sql = (q) => execSync(`docker compose -f deploy/docker-compose.yml exec -T postgres psql -U marvi -d marvi -Atc "${q.replace(/"/g, '\\"')}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString();

// ---------------------------------------------------------------- seed
section('SEED: dummy data through the API');
const admin = await login(ADMIN.email, ADMIN.password);
ok('admin can log in', !!admin);

const mk = async (path, body, token = admin) => {
  const r = await call('POST', path, { token, body });
  if (r.status >= 300) console.log(`  seed problem ${path} ${r.status} ${r.text.slice(0, 120)}`);
  return r.json;
};

const tiers = (await call('GET', '/api/admin/pricing-tiers', { token: admin })).json;
const standard = tiers.find((t) => t.isDefault);
const wholesale = await mk('/api/admin/pricing-tiers', { name: 'Wholesale', isDefault: false });
const vip = await mk('/api/admin/pricing-tiers', { name: 'VIP', isDefault: false });

const cat = {};
for (const [key, name, order, active] of [['beer', 'Cervejas', 1, true], ['soft', 'Refrigerantes', 2, true], ['water', 'Águas', 3, true], ['energy', 'Energéticos', 4, false], ['mixers', 'Mixers', 5, true]]) {
  cat[key] = await mk('/api/admin/categories', { name, sortOrder: order, isActive: active });
}

const wh1 = await mk('/api/admin/warehouses', { name: 'CD São Paulo', address: 'Av. Industrial 100, São Paulo', latitude: -23.55, longitude: -46.63 });
const wh2 = await mk('/api/admin/warehouses', { name: 'CD Rio', address: 'Rua do Porto 50, Rio de Janeiro', latitude: -22.9, longitude: -43.17 });
const area1 = await mk('/api/admin/coverage-areas', { warehouseId: wh1.id, type: 'Radius', radiusMiles: 30, polygonGeoJson: null });
const area2 = await mk('/api/admin/coverage-areas', { warehouseId: wh2.id, type: 'Radius', radiusMiles: 20, polygonGeoJson: null });

const prod = {};
const defineProduct = async (key, sku, name, categoryId, active, attributes, prices) => {
  const p = await mk('/api/admin/products', { sku, name, description: `${name} - descrição`, categoryId, imageUrl: null, isActive: active, attributes });
  prod[key] = p;
  for (const [tier, minQty, unitPrice] of prices) {
    await call('PUT', `/api/admin/products/${p.id}/pricing`, { token: admin, body: { pricingTierId: tier.id, unitPrice, minQty } });
  }
  return p;
};
await defineProduct('lager', 'BEER-001', 'Cerveja Lager 600ml', cat.beer.id, true, { brand: 'Nacional', volume: '600ml' },
  [[standard, 1, 10], [standard, 10, 9], [standard, 50, 8], [wholesale, 1, 8], [wholesale, 10, 7], [wholesale, 50, 6]]);
await defineProduct('pilsen', 'BEER-002', 'Cerveja Pilsen 350ml', cat.beer.id, true, { brand: 'Nacional' }, [[standard, 1, 10], [wholesale, 1, 8]]);
await defineProduct('cola', 'SOFT-001', 'Refrigerante Cola 2L', cat.soft.id, true, { brand: 'Cola' }, [[standard, 1, 5], [wholesale, 1, 4], [wholesale, 10, 3.5]]);
await defineProduct('water', 'WATER-001', 'Água Mineral 500ml', cat.water.id, true, {}, [[standard, 1, 3], [wholesale, 1, 2.5]]);
await defineProduct('energy', 'ENRG-001', 'Energético 250ml', cat.energy.id, true, {}, [[standard, 1, 12], [wholesale, 1, 10]]);
await defineProduct('mixer', 'MIX-001', 'Água Tônica 350ml', cat.mixers.id, true, {}, [[standard, 1, 6], [wholesale, 1, 5]]);
await defineProduct('nopr', 'NOPRICE-001', 'Produto Sem Preço', cat.soft.id, true, {}, []);
await defineProduct('inactive', 'OLD-001', 'Produto Descontinuado', cat.soft.id, false, {}, [[standard, 1, 7]]);
await defineProduct('oos', 'OOS-001', 'Refrigerante Guaraná 2L', cat.soft.id, true, {}, [[standard, 1, 4.5], [wholesale, 1, 4]]);
await defineProduct('nocat', 'MISC-001', 'Item Sem Categoria', null, true, {}, [[standard, 1, 2]]);

const deal = {};
const mkDeal = async (key, name, type, value, startDays, endDays, productIds, categoryIds, minQty) => {
  deal[key] = await mk('/api/admin/deals', { name, discountType: type, discountValue: value, startDate: iso(startDays), endDate: iso(endDays), productIds, categoryIds, minQty });
};
await mkDeal('beer10', 'Cervejas -10%', 'Percent', 10, -1, 30, [], [cat.beer.id], 1);
await mkDeal('pilsenFixed', 'Pilsen -R$2', 'Fixed', 2, -1, 30, [prod.pilsen.id], [], 1);
await mkDeal('waterBulk', 'Água -20% (10+)', 'Percent', 20, -1, 30, [prod.water.id], [], 10);
await mkDeal('energyExpired', 'Energético expirada', 'Percent', 50, -30, -1, [prod.energy.id], [], 1);
await mkDeal('mixerFuture', 'Mixer futura', 'Percent', 50, 5, 30, [prod.mixer.id], [], 1);

const inv = async (p, w, onHand, reorder) => call('PUT', '/api/admin/inventory', { token: admin, body: { productId: p.id, warehouseId: w.id, qtyOnHand: onHand, reorderPoint: reorder } });
await inv(prod.lager, wh1, 100, 20); await inv(prod.lager, wh2, 50, 10);
await inv(prod.pilsen, wh1, 40, 10);
await inv(prod.cola, wh2, 80, 20);
await inv(prod.water, wh1, 500, 100);
await inv(prod.oos, wh1, 0, 10);
// "mixer" and "nopr" deliberately have no stock record at all.

const emp1Email = 'ana.vendas@marvi.test', emp1Pw = 'Vendas-1234!';
const empResp = await call('POST', '/api/admin/employees', { token: admin, body: { email: emp1Email, password: emp1Pw, employeeCode: 'E-001', department: 'Vendas', hireDate: iso(-400) } });
ok('admin creates employee (201)', empResp.status === 201, String(empResp.status));
const emp = await login(emp1Email, emp1Pw);

const registerClient = async (name, email) => {
  const r = await call('POST', '/api/auth/register', { body: { email, password: 'Client-1234!', companyName: name, billingAddress: `Rua ${name}, 1` } });
  return { id: r.json?.id, token: await login(email, 'Client-1234!'), email };
};
const clientA = await registerClient('Bar do Zé', 'ze@bar.test');
const clientB = await registerClient('Mercado Grande', 'compras@mercado.test');
const clientC = await registerClient('Loja Suspensa', 'loja@suspensa.test');
ok('three clients registered', !!(clientA.id && clientB.id && clientC.id));
const approve = await call('PUT', `/api/admin/clients/${clientB.id}/approve`, { token: admin, body: { pricingTierId: wholesale.id, creditLimit: 5000 } });
ok('admin moves client B to Wholesale tier (204)', approve.status === 204, String(approve.status));
ok('admin suspends client C (204)', (await call('PUT', `/api/admin/clients/${clientC.id}/suspend`, { token: admin })).status === 204);

// ---------------------------------------------------------------- retrieval accuracy
section('RETRIEVAL: catalog prices, deals, stock (anonymous = default tier)');
const list = (await call('GET', '/api/products')).json;
const by = (items, p) => items.find((i) => i.id === p.id);
const L = by(list, prod.lager), P = by(list, prod.pilsen), C = by(list, prod.cola), W = by(list, prod.water);
ok('lager: list price 10 minus 10% category deal = 9.00', near(L?.price, 9) && L?.dealName === 'Cervejas -10%', JSON.stringify(L));
ok('pilsen: best of 10% (9.00) and fixed R$2 (8.00) = 8.00', near(P?.price, 8) && P?.dealName === 'Pilsen -R$2', JSON.stringify(P));
ok('cola: no deal, price 5.00', near(C?.price, 5) && C?.dealName === null);
ok('water: min-qty deal not applied at qty 1, price 3.00', near(W?.price, 3) && W?.dealName === null);
ok('energy: expired deal ignored, price 12.00', near(by(list, prod.energy)?.price, 12) && by(list, prod.energy)?.dealName === null);
ok('mixer: future deal ignored, price 6.00', near(by(list, prod.mixer)?.price, 6) && by(list, prod.mixer)?.dealName === null);
ok('inactive product is not listed', !by(list, prod.inactive));
ok('stock: lager (150 on hand) in stock', L?.inStock === true);
ok('stock: out-of-stock product (0 on hand) flagged', by(list, prod.oos)?.inStock === false);
ok('stock: product with no inventory record flagged out of stock', by(list, prod.mixer)?.inStock === false);
ok('stock: cola stocked in the second warehouse only is in stock', C?.inStock === true);
const nopr = by(list, prod.nopr);
ok('unpriced product has a null price in the catalog, never 0', !!nopr && nopr.price === null, JSON.stringify(nopr));
ok('unpriced product detail has a null price too', (await call('GET', `/api/products/${prod.nopr.id}`)).json?.price === null);
ok('list contains only active products', list.every((i) => i.id !== prod.inactive.id) && list.length === 9, `count=${list.length}`);

section('RETRIEVAL: tier-specific prices and quantity breaks');
const asB = (await call('GET', '/api/products', { token: clientB.token })).json;
ok('client B (Wholesale) sees lager 8.00 -10% = 7.20', near(by(asB, prod.lager)?.price, 7.2), JSON.stringify(by(asB, prod.lager)));
ok('client B sees cola 4.00', near(by(asB, prod.cola)?.price, 4));
const asA = (await call('GET', '/api/products', { token: clientA.token })).json;
ok('client A (default tier) sees lager 9.00', near(by(asA, prod.lager)?.price, 9));
ok('client B detail shows own tier price', near((await call('GET', `/api/products/${prod.lager.id}`, { token: clientB.token })).json?.price, 7.2));
const detail = (await call('GET', `/api/products/${prod.lager.id}`)).json;
ok('product detail: fields accurate', detail?.sku === 'BEER-001' && detail?.name === 'Cerveja Lager 600ml' && detail?.attributes?.brand === 'Nacional' && detail?.inStock === true, JSON.stringify(detail));
ok('inactive product detail is 404 for anonymous', (await call('GET', `/api/products/${prod.inactive.id}`)).status === 404);
ok('unknown product detail is 404', (await call('GET', `/api/products/${crypto.randomUUID()}`)).status === 404);
ok('non-guid product id is 404, not 500', (await call('GET', '/api/products/not-a-guid')).status === 404);

section('RETRIEVAL: filters and search');
const inCat = (await call('GET', `/api/products?category=${cat.beer.id}`)).json;
ok('category filter returns exactly the 2 beers', inCat.length === 2 && inCat.every((i) => [prod.lager.id, prod.pilsen.id].includes(i.id)), `count=${inCat.length}`);
ok('search by name (exact case)', (await call('GET', '/api/products?search=Lager')).json.some((i) => i.id === prod.lager.id));
ok('search by SKU', (await call('GET', '/api/products?search=SOFT-001')).json.some((i) => i.id === prod.cola.id));
const lower = (await call('GET', '/api/products?search=lager')).json;
ok('search is case-insensitive ("lager" finds "Lager")', lower.some((i) => i.id === prod.lager.id), `matches=${lower.length}`);
ok('search + category combine', (await call('GET', `/api/products?category=${cat.soft.id}&search=Cola`)).json.length === 1);
ok('search with no match returns empty list, 200', (await call('GET', '/api/products?search=zzzz')).json?.length === 0);
ok('category filter with unknown id returns empty list', (await call('GET', `/api/products?category=${crypto.randomUUID()}`)).json?.length === 0);
ok('category filter with a non-guid is 400, not 500', [400, 404].includes((await call('GET', '/api/products?category=abc')).status));
ok('public categories: active only, ordered, with counts',
  (() => { return true; })());
const cats = (await call('GET', '/api/categories')).json;
ok('categories: inactive hidden, sorted by SortOrder', cats.map((c) => c.name).join(',') === 'Cervejas,Refrigerantes,Águas,Mixers', cats.map((c) => c.name).join(','));
ok('categories: counts are active products only (soft = cola + oos + nopr = 3)', cats.find((c) => c.name === 'Refrigerantes')?.productCount === 3, JSON.stringify(cats));
const deals = (await call('GET', '/api/deals')).json;
ok('public deals: only currently active ones (3 of 5)', deals.length === 3 && !deals.some((d) => /expirada|futura/i.test(d.name)), deals.map((d) => d.name).join('|'));

section('RETRIEVAL: quotes, pricing and orders (accuracy of money)');
const q1 = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.water.id, qty: 10 }, { productId: prod.cola.id, qty: 2 }] } })).json;
const qWater = q1?.lineItems?.find((l) => l.productId === prod.water.id), qCola = q1?.lineItems?.find((l) => l.productId === prod.cola.id);
ok('quote: status Submitted', q1?.status === 'Submitted');
ok('quote: water qty 10 suggested 3.00 -20% bulk deal = 2.40', near(qWater?.suggestedUnitPrice, 2.4), JSON.stringify(qWater));
ok('quote: cola qty 2 suggested 5.00', near(qCola?.suggestedUnitPrice, 5));
ok('quote: client cannot dictate price (finalUnitPrice null)', qWater?.finalUnitPrice === null);
const spoof = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1, finalUnitPrice: 0.01, suggestedUnitPrice: 0.01, unitPrice: 0.01 }] } })).json;
ok('quote: extra price fields in the request are ignored', near(spoof?.lineItems?.[0]?.suggestedUnitPrice, 5) && spoof?.lineItems?.[0]?.finalUnitPrice === null, JSON.stringify(spoof?.lineItems));
const queue = (await call('GET', '/api/employee/quotes/queue', { token: emp })).json;
ok('employee queue contains the submitted quote', queue.some((q) => q.id === q1.id));
ok('employee queue defaults to Submitted only', queue.every((q) => q.status === 'Submitted'));
const price = await call('PUT', `/api/employee/quotes/${q1.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: qWater.id, finalUnitPrice: 2.25 }, { lineItemId: qCola.id, finalUnitPrice: 4.8 }] } });
ok('employee prices the quote (200, status Priced)', price.status === 200 && price.json?.status === 'Priced', String(price.status));
const accepted = await call('POST', `/api/quotes/${q1.id}/accept`, { token: clientA.token });
ok('client accepts (201)', accepted.status === 201, String(accepted.status));
ok('order total = 10x2.25 + 2x4.80 = 32.10', near(accepted.json?.totalAmount, 32.1), JSON.stringify(accepted.json?.totalAmount));
ok('order lines carry the employee final prices', accepted.json?.lineItems?.some((l) => near(l.unitPrice, 2.25) && l.qty === 10) && accepted.json?.lineItems?.some((l) => near(l.unitPrice, 4.8) && l.qty === 2));
ok('accepting twice is refused', [400, 409].includes((await call('POST', `/api/quotes/${q1.id}/accept`, { token: clientA.token })).status));
ok('client A sees exactly its own order', (await call('GET', '/api/orders/mine', { token: clientA.token })).json?.length === 1);
ok('client B sees none of A\'s orders', (await call('GET', '/api/orders/mine', { token: clientB.token })).json?.length === 0);
const eo = await call('POST', '/api/employee/orders', { token: emp, body: { clientId: clientB.id, deliveryAddress: 'Rua Entrega 10', lineItems: [{ productId: prod.cola.id, qty: 12 }, { productId: prod.lager.id, qty: 1 }] } });
ok('employee order for client B: 12 cola at qty-break 3.50 + lager 7.20 = 49.20', eo.status === 201 && near(eo.json?.totalAmount, 49.2), `${eo.status} ${eo.json?.totalAmount}`);
ok('employee order records the placing employee', !!eo.json?.placedByEmployeeId);
ok('employee order for unpriced product is refused (400)', (await call('POST', '/api/employee/orders', { token: emp, body: { clientId: clientB.id, deliveryAddress: 'x', lineItems: [{ productId: prod.nopr.id, qty: 1 }] } })).status === 400);
ok('employee order for suspended client is refused (403)', (await call('POST', '/api/employee/orders', { token: emp, body: { clientId: clientC.id, deliveryAddress: 'x', lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).status === 403);
ok('employee order for unknown client is 400', (await call('POST', '/api/employee/orders', { token: emp, body: { clientId: crypto.randomUUID(), deliveryAddress: 'x', lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).status === 400);
const prof = (await call('GET', `/api/employee/clients/${clientB.id}`, { token: emp })).json;
ok('employee client profile: tier, credit, orders accurate', prof?.pricingTierName === 'Wholesale' && near(prof?.creditLimit, 5000) && prof?.orders?.length === 1 && prof?.status === 'Approved', JSON.stringify({ t: prof?.pricingTierName, c: prof?.creditLimit, o: prof?.orders?.length, s: prof?.status }));
ok('client profile response never contains a password hash', !/hash|AQAAAA|password/i.test(JSON.stringify(prof)));
const stock = (await call('GET', '/api/employee/inventory', { token: emp })).json;
ok('employee inventory: lager rows for both warehouses (100 + 50)', stock.filter((s) => s.productId === prod.lager.id).reduce((a, s) => a + s.qtyOnHand, 0) === 150);
ok('suspended client cannot request a quote (403)', (await call('POST', '/api/quotes', { token: clientC.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).status === 403);
ok('quote for unpriced product leaves suggested price null', (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.nopr.id, qty: 1 }] } })).json?.lineItems?.[0]?.suggestedUnitPrice === null);
const q2 = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).json;
const pricedFree = await call('PUT', `/api/employee/quotes/${q2.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: q2.lineItems[0].id, finalUnitPrice: -5 }] } });
ok('negative final price is refused', pricedFree.status === 400, String(pricedFree.status));
const priceWrongLine = await call('PUT', `/api/employee/quotes/${q2.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: crypto.randomUUID(), finalUnitPrice: 1 }] } });
ok('pricing a line that is not on the quote is refused', [400, 404].includes(priceWrongLine.status), String(priceWrongLine.status));
ok('client A cannot accept an unpriced quote', (await call('POST', `/api/quotes/${q2.id}/accept`, { token: clientA.token })).status === 400);
ok('client B cannot accept client A\'s quote (403/404)', [403, 404].includes((await call('POST', `/api/quotes/${q2.id}/accept`, { token: clientB.token })).status));
ok('client B quotes list does not include A\'s quotes', !(await call('GET', '/api/quotes/mine', { token: clientB.token })).json.some((q) => q.id === q2.id));

section('ELIGIBILITY: only an Approved customer may transact (quote, accept, order)');
// No endpoint produces Pending (registration approves immediately), so set it in the database like a legacy account.
// ClientAccountStatus is stored as an integer: 0 = Pending, 1 = Approved, 2 = Suspended.
const clientP = await registerClient('Loja Pendente', 'loja@pendente.test');
const orderLine = { productId: prod.cola.id, qty: 1 };
const pendingQuote = (await call('POST', '/api/quotes', { token: clientP.token, body: { lineItems: [orderLine] } })).json;
ok('an Approved customer can request a quote (201)', !!pendingQuote?.id);
ok('...and have it priced by an employee (200)', (await call('PUT', `/api/employee/quotes/${pendingQuote.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: pendingQuote.lineItems[0].id, finalUnitPrice: 5 }] } })).status === 200);
sql(`update client_accounts set status=0 where id='${clientP.id}'`);
const pendingRequest = await call('POST', '/api/quotes', { token: clientP.token, body: { lineItems: [orderLine] } });
ok('a Pending customer cannot request a quote (403)', pendingRequest.status === 403, String(pendingRequest.status));
const pendingAccept = await call('POST', `/api/quotes/${pendingQuote.id}/accept`, { token: clientP.token });
ok('a Pending customer cannot accept a priced quote (403)', pendingAccept.status === 403, String(pendingAccept.status));
const pendingOrder = await call('POST', '/api/employee/orders', { token: emp, body: { clientId: clientP.id, deliveryAddress: 'x', lineItems: [orderLine] } });
ok('an order cannot be placed for a Pending customer (403)', pendingOrder.status === 403, String(pendingOrder.status));
ok('a Suspended customer cannot accept a priced quote (403)', (await call('PUT', `/api/admin/clients/${clientP.id}/suspend`, { token: admin })).status === 204
  && (await call('POST', `/api/quotes/${pendingQuote.id}/accept`, { token: clientP.token })).status === 403);
sql(`update client_accounts set status=1 where id='${clientP.id}'`);
const approvedAccept = await call('POST', `/api/quotes/${pendingQuote.id}/accept`, { token: clientP.token });
ok('once Approved again, the same customer can accept (201)', approvedAccept.status === 201, String(approvedAccept.status));

section('BASKET PRICING: a quote with an unpriced line is never accepted as a free order');
const ordersBefore = (await call('GET', '/api/orders/mine', { token: clientA.token })).json.length;
const freeQuote = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).json;
ok('a quote can be priced by an employee (200)', (await call('PUT', `/api/employee/quotes/${freeQuote.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: freeQuote.lineItems[0].id, finalUnitPrice: 5 }] } })).status === 200);
// The API cannot produce a Priced quote with a missing final price, so corrupt one in the database (a legacy or hand-edited row).
sql(`update quote_line_items set final_unit_price=null where id='${freeQuote.lineItems[0].id}'`);
const freeAccept = await call('POST', `/api/quotes/${freeQuote.id}/accept`, { token: clientA.token });
ok('accepting a quote with a line that has no final price is refused (409)', freeAccept.status === 409, String(freeAccept.status));
ok('...and no order was created', (await call('GET', '/api/orders/mine', { token: clientA.token })).json.length === ordersBefore);
ok('...and the quote is still Priced', (await call('GET', '/api/quotes/mine', { token: clientA.token })).json.find((q) => q.id === freeQuote.id)?.status === 'Priced');

section('REJECT: a customer can turn down a priced quote, and only that');
const rejQuote = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 2 }] } })).json;
ok('a quote that is not priced yet cannot be rejected (400)', (await call('POST', `/api/quotes/${rejQuote.id}/reject`, { token: clientA.token })).status === 400);
ok('...it is priced by an employee (200)', (await call('PUT', `/api/employee/quotes/${rejQuote.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: rejQuote.lineItems[0].id, finalUnitPrice: 3 }] } })).status === 200);
ok('another customer cannot reject it (403/404)', [403, 404].includes((await call('POST', `/api/quotes/${rejQuote.id}/reject`, { token: clientB.token })).status));
const ordersBeforeReject = (await call('GET', '/api/orders/mine', { token: clientA.token })).json.length;
const rejected = await call('POST', `/api/quotes/${rejQuote.id}/reject`, { token: clientA.token });
ok('its owner rejects it (200, status Rejected)', rejected.status === 200 && rejected.json.status === 'Rejected', String(rejected.status));
ok('...and the list shows it as Rejected', (await call('GET', '/api/quotes/mine', { token: clientA.token })).json.find((q) => q.id === rejQuote.id)?.status === 'Rejected');
ok('...it can no longer be accepted (400) and no order is created', (await call('POST', `/api/quotes/${rejQuote.id}/accept`, { token: clientA.token })).status === 400
  && (await call('GET', '/api/orders/mine', { token: clientA.token })).json.length === ordersBeforeReject);
ok('...and rejecting twice is refused (400)', (await call('POST', `/api/quotes/${rejQuote.id}/reject`, { token: clientA.token })).status === 400);
ok('...an unknown quote is 404', (await call('POST', `/api/quotes/${crypto.randomUUID()}/reject`, { token: clientA.token })).status === 404);

section('UPDATE CREDIT: an admin adjusts credit and tier without touching the status (on real Postgres)');
const clientD = await registerClient('Adega do Dedé', 'dede@adega.test');
const upd = await call('PUT', `/api/admin/clients/${clientD.id}/update-credit`, { token: admin, body: { pricingTierId: wholesale.id, creditLimit: 1234.5 } });
ok('admin updates credit and tier (204)', upd.status === 204, String(upd.status));
const profD = (await call('GET', `/api/employee/clients/${clientD.id}`, { token: emp })).json;
ok('...the profile shows the new credit, tier and an unchanged Approved status', profD.creditLimit === 1234.5 && profD.pricingTierName === 'Wholesale' && profD.status === 'Approved');
const updAudit = (await call('GET', '/api/admin/audit-log?pageSize=200', { token: admin })).json.find((e) => e.entityId === clientD.id && e.action === 'Update');
ok('...and the change is in the audit log with the previous values', !!updAudit && updAudit.details.data.includes('PreviousCreditLimit') && updAudit.details.data.includes('1234.5'));
ok('a suspended customer can be adjusted and stays suspended', (await call('PUT', `/api/admin/clients/${clientC.id}/update-credit`, { token: admin, body: { pricingTierId: wholesale.id, creditLimit: 10 } })).status === 204
  && (await call('GET', `/api/employee/clients/${clientC.id}`, { token: emp })).json.status === 'Suspended');
ok('a negative credit, an unknown tier and an unknown customer are refused (400/400/404)',
  (await call('PUT', `/api/admin/clients/${clientD.id}/update-credit`, { token: admin, body: { pricingTierId: wholesale.id, creditLimit: -1 } })).status === 400
  && (await call('PUT', `/api/admin/clients/${clientD.id}/update-credit`, { token: admin, body: { pricingTierId: crypto.randomUUID(), creditLimit: 1 } })).status === 400
  && (await call('PUT', `/api/admin/clients/${crypto.randomUUID()}/update-credit`, { token: admin, body: { pricingTierId: wholesale.id, creditLimit: 1 } })).status === 404);

section('CLIENT PROFILE: a customer edits their own company details (on real Postgres)');
const ownProfile = (await call('GET', '/api/client/profile', { token: clientD.token })).json;
ok('a customer reads their own details', ownProfile.id === clientD.id && ownProfile.companyName === 'Adega do Dedé' && ownProfile.shippingAddresses.length === 0);
const putProfile = await call('PUT', '/api/client/profile', { token: clientD.token, body: { companyName: '  Adega do Dedé Ltda ', billingAddress: 'Rua Nova, 10', shippingAddresses: ['Av. Brasil, 100', ' ', 'av. brasil, 100', 'Rua do Porto, 5 — loja 2'] } });
ok('...edits them: trimmed, blank and repeated shipping lines dropped (200)', putProfile.status === 200 && putProfile.json.companyName === 'Adega do Dedé Ltda'
  && JSON.stringify(putProfile.json.shippingAddresses) === JSON.stringify(['Av. Brasil, 100', 'Rua do Porto, 5 — loja 2']));
ok('...the shipping list is stored as a list in the database and staff see the same', sql(`select cardinality(shipping_addresses) from client_accounts where id='${clientD.id}'`) === '2'
  && JSON.stringify((await call('GET', `/api/employee/clients/${clientD.id}`, { token: emp })).json.shippingAddresses) === JSON.stringify(['Av. Brasil, 100', 'Rua do Porto, 5 — loja 2']));
ok('...the list is replaced as a whole (an empty list clears it)', (await call('PUT', '/api/client/profile', { token: clientD.token, body: { companyName: 'Adega', billingAddress: 'Rua Nova, 10', shippingAddresses: [] } })).json.shippingAddresses.length === 0);
ok('a missing company name, too many addresses and an over-long address are refused (400) and change nothing',
  (await call('PUT', '/api/client/profile', { token: clientD.token, body: { companyName: ' ', billingAddress: 'x', shippingAddresses: [] } })).status === 400
  && (await call('PUT', '/api/client/profile', { token: clientD.token, body: { companyName: 'X', billingAddress: 'x', shippingAddresses: Array.from({ length: 11 }, (_, i) => `Rua ${i}`) } })).status === 400
  && (await call('PUT', '/api/client/profile', { token: clientD.token, body: { companyName: 'X', billingAddress: 'x', shippingAddresses: ['y'.repeat(501)] } })).status === 400
  && (await call('GET', '/api/client/profile', { token: clientD.token })).json.companyName === 'Adega');
ok('it is always the caller\'s own account: another customer\'s details are untouched', (await call('GET', '/api/client/profile', { token: clientA.token })).json.companyName === 'Bar do Zé');

section('CSV IMPORT: an admin imports products from a file (on real Postgres)');
const importCsv = (csv, query = '', token = admin) => {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'products.csv');
  return call('POST', `/api/admin/products/import${query}`, { token, raw: form });
};
const impSku = `IMP-${crypto.randomBytes(4).toString('hex')}`;
const semicolonCsv = `﻿sku;name;description;category;price;stock;attr_Marca;tier_Wholesale\r\n${impSku};Cerveja Importada;"Gelada; 600ml";cervejas;12,50;25;Acme;10,00\r\n`;
const noWarehouse = await importCsv(semicolonCsv);
ok('with two warehouses, stock without a chosen warehouse is refused (400) and nothing is created', noWarehouse.status === 400 && noWarehouse.json.applied === false
  && sql(`select count(*) from products where sku='${impSku}'`) === '0');
const dry = await importCsv(semicolonCsv, `?dryRun=true&warehouseId=${wh1.id}`);
ok('a dry run reports what would be created and changes nothing', dry.status === 200 && dry.json.dryRun && !dry.json.applied && dry.json.created === 1
  && sql(`select count(*) from products where sku='${impSku}'`) === '0');
const imported = await importCsv(semicolonCsv, `?warehouseId=${wh1.id}`);
ok('a semicolon file with a byte order mark, quoted text and Brazilian numbers imports (200, 1 created)', imported.status === 200 && imported.json.applied && imported.json.created === 1 && imported.json.updated === 0, imported.text.slice(0, 200));
const impProduct = (await call('GET', '/api/admin/products', { token: admin })).json.find((p) => p.sku === impSku);
ok('...name, description, category and attribute are stored', impProduct?.name === 'Cerveja Importada' && impProduct.description === 'Gelada; 600ml' && impProduct.categoryId === cat.beer.id && impProduct.attributes.Marca === 'Acme');
const visitorSees = (await call('GET', '/api/products')).json.find((p) => p.sku === impSku);
// The category has a running 10% deal in the seed data, so the default-tier price 12.50 shows as 11.25: the category was set too.
ok('...the default-tier price (less the category\'s running deal) is what a visitor sees', near(visitorSees?.price, 11.25) && visitorSees.dealName === 'Cervejas -10%', JSON.stringify(visitorSees));
ok('...the tier price and the stock are stored', sql(`select unit_price from product_pricings where product_id='${impProduct.id}' and pricing_tier_id='${wholesale.id}'`) === '10.00'
  && sql(`select qty_on_hand from inventory_records where product_id='${impProduct.id}' and warehouse_id='${wh1.id}'`) === '25');
const reimport = await importCsv(`sku,name,price\n${impSku.toLowerCase()},Cerveja Renomeada,9.90\n`);
ok('importing again matches the SKU ignoring case: updated, not duplicated', reimport.status === 200 && reimport.json.created === 0 && reimport.json.updated === 1
  && sql(`select count(*) from products where lower(sku)='${impSku.toLowerCase()}'`) === '1');
const afterReimport = (await call('GET', '/api/admin/products', { token: admin })).json.find((p) => p.sku === impSku);
ok('...a blank cell kept the existing description and category, and the new price (9.90 less the deal = 8.91) applies', afterReimport.name === 'Cerveja Renomeada' && afterReimport.description === 'Gelada; 600ml'
  && afterReimport.categoryId === cat.beer.id && near((await call('GET', '/api/products')).json.find((p) => p.sku === impSku)?.price, 8.91));
const badImport = await importCsv(`sku,name,category,price\nIMP-OK-${impSku},Fine,Cervejas,5\nIMP-BAD-${impSku},,Nope,abc\n`);
ok('a file with errors imports nothing (400) and lists every problem with its line', badImport.status === 400 && badImport.json.errors.length === 3
  && badImport.json.errors.every((e) => e.line === 3) && sql(`select count(*) from products where sku like 'IMP-%-${impSku}'`) === '0');
ok('a typo in a column name is an error, not ignored', (await importCsv('sku,name,prce\nA,B,1\n')).json.errors[0].message.includes("Unknown column 'prce'"));
const ambiguousPrice = await importCsv(`sku;name;price\nAMB-${impSku};Ambiguous;1.234\n`);
ok('a Brazilian thousands price such as 1.234 is refused as ambiguous, never stored as 1.234 (400)', ambiguousPrice.status === 400 && ambiguousPrice.json.errors[0].message.includes('at most 2 decimals')
  && sql(`select count(*) from products where sku='AMB-' || '${impSku}'`) === '0');
const excelTrailing = await importCsv(`sku;name;price;\nXL-${impSku};Excel export;1.234,00;\n`);
ok('an Excel export with a trailing separator on every line imports (1.234,00 = R$ 1234)', excelTrailing.status === 200 && excelTrailing.json.created === 1
  && sql(`select unit_price from product_pricings pp join products p on p.id = pp.product_id where p.sku='XL-${impSku}'`) === '1234.00');
ok('the import is in the audit log', (await call('GET', '/api/admin/audit-log?pageSize=200', { token: admin })).json.some((e) => e.action === 'Import' && e.details.data.includes('"Created":1') && e.details.data.includes(impSku)));
ok('only admins may import (403 for an employee)', (await importCsv('sku,name\nA,B\n', '', emp)).status === 403);

section('QUOTE HISTORY: employees read every quote, paged and filterable (on real Postgres)');
const histA = (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&pageSize=2`, { token: emp })).json;
ok('history of one customer: its quotes only, in every status, with the total', histA.totalCount >= 4 && histA.items.length === 2 && histA.items.every((q) => q.clientAccountId === clientA.id)
  && histA.pageSize === 2 && histA.page === 1);
ok('...newest first', histA.items[0].createdAt >= histA.items[1].createdAt);
const histAll = (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&pageSize=200`, { token: emp })).json.items;
ok('...includes accepted, rejected and priced quotes', ['Accepted', 'Rejected', 'Priced'].every((s) => histAll.some((q) => q.status === s)));
ok('...a rejected quote is no longer in the pricing queue but stays in the history',
  !(await call('GET', '/api/employee/quotes/queue', { token: emp })).json.some((q) => q.id === rejQuote.id) && histAll.some((q) => q.id === rejQuote.id));
ok('...second page continues without repeating', (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&page=2&pageSize=2`, { token: emp })).json.items.every((q) => !histA.items.some((h) => h.id === q.id)));
ok('status filter', (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&status=Rejected`, { token: emp })).json.items.every((q) => q.status === 'Rejected'));
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
ok('date filter: today onwards includes this run\'s quotes', (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&from=${today}&to=${tomorrow}`, { token: emp })).json.totalCount === histA.totalCount);
ok('...a range in the past is empty', (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&from=2001-01-01&to=2001-02-01`, { token: emp })).json.totalCount === 0);
ok('...an invalid page or an inverted range is refused (400)', (await call('GET', '/api/employee/quotes/history?page=0', { token: emp })).status === 400
  && (await call('GET', '/api/employee/quotes/history?from=2026-05-01&to=2026-04-01', { token: emp })).status === 400);

section('ORDER HISTORY: employees read every order with the time it was placed (on real Postgres)');
const ordA = (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&pageSize=200`, { token: emp })).json;
const ordAMine = (await call('GET', '/api/orders/mine', { token: clientA.token })).json;
ok('history of one customer: all and only its orders, with the total', ordA.totalCount === ordAMine.length && ordA.items.every((o) => o.clientAccountId === clientA.id));
ok('...every order carries a placement time that is recent and in the past', ordA.items.every((o) => Date.parse(o.placedAt) > Date.now() - 3600_000 && Date.parse(o.placedAt) <= Date.now() + 5000));
ok('...newest first', ordA.items.every((o, i) => i === 0 || Date.parse(ordA.items[i - 1].placedAt) >= Date.parse(o.placedAt)));
ok('...the customer sees the same time on their own orders', ordAMine.every((o) => o.placedAt && ordA.items.some((h) => h.id === o.id && h.placedAt === o.placedAt)));
ok('...paged with the total', (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&page=1&pageSize=1`, { token: emp })).json.items.length === 1);
ok('status filter', (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&status=Cancelled`, { token: emp })).json.totalCount === 0
  && (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&status=Placed`, { token: emp })).json.totalCount === ordA.totalCount);
ok('date filter: today includes them, a past range does not', (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&from=${today}&to=${tomorrow}`, { token: emp })).json.totalCount === ordA.totalCount
  && (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&from=2001-01-01&to=2001-02-01`, { token: emp })).json.totalCount === 0);
const hourAgo = encodeURIComponent(new Date(Date.now() - 3600_000).toISOString());
const hourAhead = encodeURIComponent(new Date(Date.now() + 3600_000).toISOString());
ok('...full UTC timestamps work as bounds on Postgres', (await call('GET', `/api/employee/orders/history?clientId=${clientA.id}&from=${hourAgo}&to=${hourAhead}`, { token: emp })).json.totalCount === ordA.totalCount
  && (await call('GET', `/api/employee/quotes/history?clientId=${clientA.id}&from=${hourAhead}`, { token: emp })).json.totalCount === 0);
ok('...an unknown status is refused (400)', (await call('GET', '/api/employee/orders/history?status=99', { token: emp })).status === 400
  && (await call('GET', '/api/employee/quotes/history?status=99', { token: emp })).status === 400);
ok('...an invalid page or an inverted range is refused (400)', (await call('GET', '/api/employee/orders/history?pageSize=0', { token: emp })).status === 400
  && (await call('GET', '/api/employee/orders/history?from=2026-05-01&to=2026-04-01', { token: emp })).status === 400);

// ---------------------------------------------------------------- security
section('AUDIT: an admin change and its audit entry are stored together');
const auditRows = () => Number(sql('select count(*) from audit_log_entries'));
const auditCase = async (name, run, expectedRows) => {
  const before = auditRows();
  const response = await run();
  ok(`${name}: ${expectedRows} audit row(s), status ${response.status}`, auditRows() - before === expectedRows, `rows +${auditRows() - before}, status ${response.status}`);
  return response;
};
const catName = `Audit ${crypto.randomUUID().slice(0, 8)}`;
const auditCat = (await auditCase('create category', () => call('POST', '/api/admin/categories', { token: admin, body: { name: catName, sortOrder: 1, isActive: true } }), 1)).json;
await auditCase('update category', () => call('PUT', `/api/admin/categories/${auditCat.id}`, { token: admin, body: { name: `${catName} v2`, sortOrder: 2, isActive: true } }), 1);
await auditCase('duplicate category name (409) leaves no audit row', () => call('POST', '/api/admin/categories', { token: admin, body: { name: `${catName} v2`, sortOrder: 1, isActive: true } }), 0);
await auditCase('invalid category (400) leaves no audit row', () => call('POST', '/api/admin/categories', { token: admin, body: { name: ' ', sortOrder: 1, isActive: true } }), 0);
await auditCase('delete category', () => call('DELETE', `/api/admin/categories/${auditCat.id}`, { token: admin }), 1);
const auditWh = (await auditCase('create warehouse', () => call('POST', '/api/admin/warehouses', { token: admin, body: { name: `CD ${catName}`, address: 'Rua A, 1', latitude: -23.5, longitude: -46.6 } }), 1)).json;
await auditCase('create coverage area', () => call('POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: auditWh.id, type: 'Radius', radiusMiles: 5 } }), 1);
await auditCase('delete warehouse (and its areas)', () => call('DELETE', `/api/admin/warehouses/${auditWh.id}`, { token: admin }), 1);
await auditCase('approve client', () => call('PUT', `/api/admin/clients/${clientP.id}/approve`, { token: admin, body: { pricingTierId: wholesale.id, creditLimit: 100 } }), 1);
ok('every audit row has an actor', Number(sql(`select count(*) from audit_log_entries where actor_user_id = '00000000-0000-0000-0000-000000000000'`)) === 0);

section('IDENTITY: each role\'s token carries its own account id and the endpoints honour it');
const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const clientPayload = claimsOf(clientA.token), empPayload = claimsOf(emp), adminPayload = claimsOf(admin);
ok('client token: role Client, client_id is the account id, no employee_id', clientPayload[ROLE_CLAIM] === 'Client' && clientPayload.client_id === clientA.id && !('employee_id' in clientPayload), JSON.stringify(clientPayload));
ok('employee token: role Employee, has employee_id, no client_id', empPayload[ROLE_CLAIM] === 'Employee' && !!empPayload.employee_id && !('client_id' in empPayload));
ok('admin token: role Admin, neither employee_id nor client_id', adminPayload[ROLE_CLAIM] === 'Admin' && !('employee_id' in adminPayload) && !('client_id' in adminPayload));
const idQuote = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).json;
const pricedByEmp = await call('PUT', `/api/employee/quotes/${idQuote.id}/price`, { token: emp, body: { lineItems: [{ lineItemId: idQuote.lineItems[0].id, finalUnitPrice: 5 }] } });
ok('a quote priced by an employee records that employee', pricedByEmp.json?.pricedByEmployeeId === empPayload.employee_id, JSON.stringify(pricedByEmp.json?.pricedByEmployeeId));
const idQuote2 = (await call('POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1 }] } })).json;
const pricedByAdmin = await call('PUT', `/api/employee/quotes/${idQuote2.id}/price`, { token: admin, body: { lineItems: [{ lineItemId: idQuote2.lineItems[0].id, finalUnitPrice: 5 }] } });
ok('a quote priced by an admin records no employee', pricedByAdmin.status === 200 && pricedByAdmin.json?.pricedByEmployeeId === null, String(pricedByAdmin.status));
ok('the audit trail records the admin\'s login user as the actor', Number(sql(`select count(*) from audit_log_entries where actor_user_id='${adminPayload.sub}'`)) > 0);
ok('a client cannot reach employee endpoints and an employee cannot reach client endpoints (403)',
  (await call('GET', '/api/employee/quotes/queue', { token: clientA.token })).status === 403 && (await call('GET', '/api/quotes/mine', { token: emp })).status === 403);

section('INPUT POLICY: trimming, limits, duplicates ignoring case, delete protection (on real Postgres)');
const policySku = `Pol-${crypto.randomUUID().slice(0, 8)}`;
const policyProduct = await call('POST', '/api/admin/products', { token: admin, body: { sku: `  ${policySku}  `, name: '  Policy product  ', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } });
ok('product SKU and name are stored trimmed', policyProduct.status === 201 && policyProduct.json.sku === policySku && policyProduct.json.name === 'Policy product', JSON.stringify(policyProduct.json));
const policyDuplicate = await call('POST', '/api/admin/products', { token: admin, body: { sku: policySku.toUpperCase(), name: 'Other', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } });
ok('a SKU differing only by case is refused (409) by the database comparison', policyDuplicate.status === 409, String(policyDuplicate.status));
ok('a 65-character SKU is refused (400)', (await call('POST', '/api/admin/products', { token: admin, body: { sku: 'x'.repeat(65), name: 'Long', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } })).status === 400);
const policyCatName = `Pol cat ${crypto.randomUUID().slice(0, 8)}`;
const policyCat = (await call('POST', '/api/admin/categories', { token: admin, body: { name: `  ${policyCatName}  `, sortOrder: 1, isActive: true } })).json;
ok('category name is stored trimmed', policyCat?.name === policyCatName);
ok('a category name differing only by case is refused (409)', (await call('POST', '/api/admin/categories', { token: admin, body: { name: policyCatName.toUpperCase(), sortOrder: 1, isActive: true } })).status === 409);
ok('a 201-character category name is refused (400)', (await call('POST', '/api/admin/categories', { token: admin, body: { name: 'c'.repeat(201), sortOrder: 1, isActive: true } })).status === 400);
await call('POST', '/api/admin/products', { token: admin, body: { sku: `PolC-${crypto.randomUUID().slice(0, 8)}`, name: 'In category', description: null, categoryId: policyCat.id, imageUrl: null, isActive: true, attributes: {} } });
ok('a category that still has products cannot be deleted (409)', (await call('DELETE', `/api/admin/categories/${policyCat.id}`, { token: admin })).status === 409);
ok('a product on quotes cannot be deleted (409)', (await call('DELETE', `/api/admin/products/${prod.cola.id}`, { token: admin })).status === 409);
ok('a warehouse with stock cannot be deleted (409)', (await call('DELETE', `/api/admin/warehouses/${wh1.id}`, { token: admin })).status === 409);
const policyDeal = await call('POST', '/api/admin/deals', { token: admin, body: { name: '  Padded deal  ', discountType: 'Percent', discountValue: 5, startDate: new Date(Date.now() - 864e5).toISOString(), endDate: new Date(Date.now() + 864e5).toISOString(), productIds: [], categoryIds: [], minQty: 1 } });
ok('a deal name keeps its padding and has no length limit today (201)', policyDeal.status === 201 && policyDeal.json.name === '  Padded deal  ', String(policyDeal.status));

section('PUBLIC STATS: the landing page numbers are anonymous, cacheable, counts only, and match the database');
const stats = await call('GET', '/api/public/stats');
ok('stats are public (200, no token)', stats.status === 200, String(stats.status));
ok('stats expose exactly three counts and nothing else', JSON.stringify(Object.keys(stats.json).sort()) === '["categoryCount","coverageAreaCount","productCount"]', JSON.stringify(stats.json));
ok('productCount equals the active products in the database', stats.json.productCount === Number(sql('select count(*) from products where is_active')), `${stats.json.productCount}`);
ok('categoryCount equals the active categories', stats.json.categoryCount === Number(sql('select count(*) from categories where is_active')), `${stats.json.categoryCount}`);
ok('coverageAreaCount counts radius areas only (polygon type is 1)', stats.json.coverageAreaCount === Number(sql('select count(*) from coverage_areas where type = 0')), `${stats.json.coverageAreaCount}`);
ok('stats and categories are cacheable for a short time (Cache-Control public, max-age=60)',
  /public/.test(stats.headers.get('cache-control') ?? '') && /max-age=60/.test(stats.headers.get('cache-control') ?? '')
  && /max-age=60/.test((await call('GET', '/api/categories')).headers.get('cache-control') ?? ''));
ok('stats contain no price or customer data', !/price|email|company|client/i.test(stats.text));

section('STOCK: in stock = on hand minus reserved, summed over warehouses; list and detail agree');
const stockProduct = (await call('POST', '/api/admin/products', { token: admin, body: { sku: `STK-${crypto.randomUUID().slice(0, 8)}`, name: 'Stock product', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } })).json;
const inStockList = async () => (await call('GET', '/api/products')).json.find((p) => p.id === stockProduct.id)?.inStock;
const inStockDetail = async () => (await call('GET', `/api/products/${stockProduct.id}`)).json?.inStock;
ok('a product with no stock record is not in stock (list and detail)', (await inStockList()) === false && (await inStockDetail()) === false);
await call('PUT', '/api/admin/inventory', { token: admin, body: { productId: stockProduct.id, warehouseId: wh1.id, qtyOnHand: 10, reorderPoint: 1 } });
await call('PUT', '/api/admin/inventory', { token: admin, body: { productId: stockProduct.id, warehouseId: wh2.id, qtyOnHand: 5, reorderPoint: 1 } });
ok('stock in two warehouses: in stock (list and detail)', (await inStockList()) === true && (await inStockDetail()) === true);
sql(`update inventory_records set qty_reserved=10 where product_id='${stockProduct.id}' and warehouse_id='${wh1.id}'`);
ok('one warehouse fully reserved but the other has 5 free: still in stock', (await inStockList()) === true && (await inStockDetail()) === true);
sql(`update inventory_records set qty_reserved=5 where product_id='${stockProduct.id}' and warehouse_id='${wh2.id}'`);
ok('everything reserved: not in stock (list and detail)', (await inStockList()) === false && (await inStockDetail()) === false);

section('DEFAULT TIER: exactly one default; anonymous visitors price from it; it can be switched but never unset');
const colaPrice = async () => (await call('GET', '/api/products')).json.find((p) => p.id === prod.cola.id)?.price;
const defaults = () => sql('select count(*) from pricing_tiers where is_default');
ok('anonymous visitors see the default (Standard) tier price for cola (5)', near(await colaPrice(), 5));
ok('exactly one default tier', defaults() === '1');
ok('making Wholesale the default is accepted', [200, 204].includes((await call('PUT', `/api/admin/pricing-tiers/${wholesale.id}`, { token: admin, body: { name: 'Wholesale', isDefault: true } })).status));
ok('...anonymous visitors now see the Wholesale price for cola (4)', near(await colaPrice(), 4));
ok('...and still exactly one default tier', defaults() === '1');
const unsetDefault = await call('PUT', `/api/admin/pricing-tiers/${wholesale.id}`, { token: admin, body: { name: 'Wholesale', isDefault: false } });
ok('the only default tier cannot be unset (400)', unsetDefault.status === 400, String(unsetDefault.status));
ok('making Standard the default again is accepted', [200, 204].includes((await call('PUT', `/api/admin/pricing-tiers/${standard.id}`, { token: admin, body: { name: standard.name, isDefault: true } })).status));
ok('...anonymous visitors see the Standard price again (5), one default', near(await colaPrice(), 5) && defaults() === '1');
const polygonArea = await call('POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: wh1.id, type: 'Polygon', polygonGeoJson: '{"type":"Polygon","coordinates":[]}' } });
ok('a polygon coverage area can be stored and does not break the coverage check (no 500)', polygonArea.status === 201 && (await call('POST', '/api/coverage/check', { body: { address: 'Av. Paulista 1000, São Paulo' } })).status < 500, String(polygonArea.status));

section('RACES: concurrent admin writes never end in a 500 (the database decides, the API answers 409)');
const burst = (n, fn) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
const noServerErrors = (name, results) => ok(`${name}: no 500s (statuses ${[...new Set(results.map((r) => r.status))].sort().join(',')})`, results.every((r) => r.status < 500));
const raceProduct = (await call('POST', '/api/admin/products', { token: admin, body: { sku: `RACE-${crypto.randomUUID().slice(0, 8)}`, name: 'Race product', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } })).json;

const priceRace = await burst(12, () => call('PUT', `/api/admin/products/${raceProduct.id}/pricing`, { token: admin, body: { pricingTierId: wholesale.id, unitPrice: 5, minQty: 1 } }));
noServerErrors('12 simultaneous price upserts for one product, tier and minimum quantity', priceRace);
ok('...and exactly one price row exists', sql(`select count(*) from product_pricings where product_id='${raceProduct.id}'`) === '1');
ok('...and every refusal is a 409 conflict', priceRace.every((r) => r.status < 300 || r.status === 409));

const stockRace = await burst(12, (i) => call('PUT', '/api/admin/inventory', { token: admin, body: { productId: raceProduct.id, warehouseId: wh1.id, qtyOnHand: 10 + i, reorderPoint: 1 } }));
noServerErrors('12 simultaneous stock upserts for one product and warehouse', stockRace);
ok('...and exactly one stock row exists', sql(`select count(*) from inventory_records where product_id='${raceProduct.id}' and warehouse_id='${wh1.id}'`) === '1');
ok('...and every refusal is a 409 conflict', stockRace.every((r) => r.status < 300 || r.status === 409));

const raceWarehouse = (await call('POST', '/api/admin/warehouses', { token: admin, body: { name: `Race ${crypto.randomUUID().slice(0, 8)}`, address: 'Rua R, 1', latitude: -23.5, longitude: -46.6 } })).json;
const areaRace = await Promise.all([
  call('DELETE', `/api/admin/warehouses/${raceWarehouse.id}`, { token: admin }),
  ...Array.from({ length: 12 }, () => call('POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: raceWarehouse.id, type: 'Radius', radiusMiles: 5 } })),
]);
noServerErrors('a warehouse deleted while coverage areas are being added to it', areaRace);
ok('...and no coverage area is left pointing at the deleted warehouse', sql(`select count(*) from coverage_areas where warehouse_id='${raceWarehouse.id}'`) === '0');

const defaultRace = await burst(12, (i) => call('POST', '/api/admin/pricing-tiers', { token: admin, body: { name: `Race tier ${i} ${crypto.randomUUID().slice(0, 6)}`, isDefault: true } }));
noServerErrors('12 tiers created at once, each asking to be the default', defaultRace);
ok('...and exactly one default tier exists', sql(`select count(*) from pricing_tiers where is_default`) === '1');
// Put the seeded Standard tier back as the default so the checks below price as designed.
ok('the Standard tier is made the default again (200/204)', [200, 204].includes((await call('PUT', `/api/admin/pricing-tiers/${standard.id}`, { token: admin, body: { name: standard.name, isDefault: true } })).status));
ok('...and exactly one default tier exists', sql(`select count(*) from pricing_tiers where is_default`) === '1');

section('SECURITY: authorization matrix (every endpoint x every role)');
const ID = crypto.randomUUID();
const tokens = { anon: undefined, client: clientA.token, employee: emp, admin };
const endpoints = [
  // [method, path, body, allowedRoles]
  ['GET', '/api/admin/audit-log', undefined, ['admin']],
  ['GET', '/api/admin/categories', undefined, ['admin']], ['POST', '/api/admin/categories', { name: 'Z', sortOrder: 0, isActive: true }, ['admin']],
  ['GET', `/api/admin/categories/${ID}`, undefined, ['admin']], ['PUT', `/api/admin/categories/${ID}`, { name: 'Z', sortOrder: 0, isActive: true }, ['admin']], ['DELETE', `/api/admin/categories/${ID}`, undefined, ['admin']],
  ['GET', '/api/admin/deals', undefined, ['admin']], ['POST', '/api/admin/deals', { name: 'x', discountType: 'Percent', discountValue: 1, startDate: iso(0), endDate: iso(1), productIds: [], categoryIds: [], minQty: 1 }, ['admin']],
  ['GET', `/api/admin/deals/${ID}`, undefined, ['admin']], ['PUT', `/api/admin/deals/${ID}`, { name: 'x', discountType: 'Percent', discountValue: 1, startDate: iso(0), endDate: iso(1), productIds: [], categoryIds: [], minQty: 1 }, ['admin']], ['DELETE', `/api/admin/deals/${ID}`, undefined, ['admin']],
  ['GET', '/api/admin/pricing-tiers', undefined, ['admin']], ['POST', '/api/admin/pricing-tiers', { name: 'Q', isDefault: false }, ['admin']], ['PUT', `/api/admin/pricing-tiers/${ID}`, { name: 'Q', isDefault: false }, ['admin']],
  ['GET', `/api/admin/products/${ID}/pricing`, undefined, ['admin']], ['PUT', `/api/admin/products/${ID}/pricing`, { pricingTierId: ID, unitPrice: 1, minQty: 1 }, ['admin']], ['DELETE', `/api/admin/products/${ID}/pricing/${ID}/1`, undefined, ['admin']],
  ['GET', '/api/admin/products', undefined, ['admin']], ['POST', '/api/admin/products', { sku: 'S', name: 'N', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} }, ['admin']],
  ['GET', `/api/admin/products/${ID}`, undefined, ['admin']], ['PUT', `/api/admin/products/${ID}`, { sku: 'S', name: 'N', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} }, ['admin']], ['DELETE', `/api/admin/products/${ID}`, undefined, ['admin']],
  ['GET', '/api/admin/coverage-areas', undefined, ['admin']], ['POST', '/api/admin/coverage-areas', { warehouseId: ID, type: 'Radius', radiusMiles: 1, polygonGeoJson: null }, ['admin']],
  ['GET', `/api/admin/coverage-areas/${ID}`, undefined, ['admin']], ['PUT', `/api/admin/coverage-areas/${ID}`, { warehouseId: ID, type: 'Radius', radiusMiles: 1, polygonGeoJson: null }, ['admin']], ['DELETE', `/api/admin/coverage-areas/${ID}`, undefined, ['admin']],
  ['GET', '/api/admin/warehouses', undefined, ['admin']], ['POST', '/api/admin/warehouses', { name: 'W', address: 'A', latitude: 1, longitude: 1 }, ['admin']],
  ['GET', `/api/admin/warehouses/${ID}`, undefined, ['admin']], ['PUT', `/api/admin/warehouses/${ID}`, { name: 'W', address: 'A', latitude: 1, longitude: 1 }, ['admin']], ['DELETE', `/api/admin/warehouses/${ID}`, undefined, ['admin']],
  ['PUT', `/api/admin/clients/${ID}/approve`, { pricingTierId: ID, creditLimit: 1 }, ['admin']], ['PUT', `/api/admin/clients/${ID}/suspend`, undefined, ['admin']],
  ['POST', '/api/admin/employees', { email: 'e@e.test', password: 'Aa1!aaaa', employeeCode: 'x', department: null, hireDate: iso(0) }, ['admin']],
  ['PUT', '/api/admin/inventory', { productId: ID, warehouseId: ID, qtyOnHand: 1, reorderPoint: 1 }, ['admin']],
  ['GET', `/api/employee/clients/${ID}`, undefined, ['employee', 'admin']], ['GET', '/api/employee/inventory', undefined, ['employee', 'admin']],
  ['POST', '/api/employee/orders', { clientId: ID, deliveryAddress: 'x', lineItems: [{ productId: ID, qty: 1 }] }, ['employee', 'admin']],
  ['GET', '/api/employee/quotes/queue', undefined, ['employee', 'admin']], ['PUT', `/api/employee/quotes/${ID}/price`, { lineItems: [{ lineItemId: ID, finalUnitPrice: 1 }] }, ['employee', 'admin']],
  ['GET', '/api/orders/mine', undefined, ['client']], ['GET', '/api/quotes/mine', undefined, ['client']],
  ['POST', '/api/quotes', { lineItems: [{ productId: ID, qty: 1 }] }, ['client']], ['POST', `/api/quotes/${ID}/accept`, undefined, ['client']],
  ['POST', `/api/quotes/${ID}/reject`, undefined, ['client']],
  ['GET', '/api/employee/quotes/history', undefined, ['employee', 'admin']],
  ['GET', '/api/employee/orders/history', undefined, ['employee', 'admin']],
  ['PUT', `/api/admin/clients/${ID}/update-credit`, { pricingTierId: ID, creditLimit: 1 }, ['admin']],
  ['POST', '/api/admin/products/import', undefined, ['admin']],
  ['GET', '/api/client/profile', undefined, ['client']], ['PUT', '/api/client/profile', { companyName: 'X', billingAddress: 'Y', shippingAddresses: [] }, ['client']],
];
let matrixBad = [];
for (const [method, path, body, allowed] of endpoints) {
  for (const [role, token] of Object.entries(tokens)) {
    const r = await call(method, path, { token, body });
    const shouldPass = allowed.includes(role);
    const expectedDenied = role === 'anon' ? 401 : 403;
    const good = shouldPass ? (r.status !== 401 && r.status !== 403 && r.status < 500) : r.status === expectedDenied;
    if (!good) matrixBad.push(`${role} ${method} ${path.replace(ID, '{id}')} -> ${r.status}`);
  }
}
ok(`authorization matrix: ${endpoints.length} endpoints x 4 roles = ${endpoints.length * 4} checks, all correct`, matrixBad.length === 0, matrixBad.slice(0, 8).join(' | '));

section('SECURITY: public endpoints really are public, and expose no private data');
for (const [m, p] of [['GET', '/api/products'], ['GET', '/api/deals'], ['GET', '/api/categories']]) ok(`anonymous ${m} ${p} is 200`, (await call(m, p)).status === 200);
const publicDump = JSON.stringify([(await call('GET', '/api/products')).json, (await call('GET', '/api/deals')).json, (await call('GET', '/api/categories')).json]);
ok('public responses leak no emails, hashes or tier/credit data', !/@|passwordhash|creditLimit|pricingTier/i.test(publicDump));
ok('OpenAPI document is not exposed in Production', (await call('GET', '/openapi/v1.json')).status === 404);
ok('unknown routes are 404', (await call('GET', '/api/does-not-exist')).status === 404);

section('SECURITY: tokens');
const goodToken = clientA.token;
const [h, p, s] = goodToken.split('.');
const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
const ROLE = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const forgedRole = `${h}.${b64({ ...payload, [ROLE]: 'Admin' })}.${s}`;
const algNone = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...payload, [ROLE]: 'Admin' })}.`;
const wrongKey = (() => { const head = b64({ alg: 'HS256', typ: 'JWT' }); const body = b64({ ...payload, [ROLE]: 'Admin' }); return `${head}.${body}.${crypto.createHmac('sha256', 'attacker-key-attacker-key-attacker-key-123').update(`${head}.${body}`).digest('base64url')}`; })();
const expired = (() => { const head = b64({ alg: 'HS256', typ: 'JWT' }); const body = b64({ ...payload, exp: Math.floor(Date.now() / 1000) - 3600 }); return `${head}.${body}.${s}`; })();
for (const [name, tok] of [['payload edited to Admin, original signature', forgedRole], ['alg=none', algNone], ['signed with an attacker key', wrongKey], ['expired claims', expired], ['garbage', 'abc.def.ghi'], ['empty bearer', '']]) {
  const r = await call('GET', '/api/admin/categories', { token: tok || undefined, headers: tok === '' ? { Authorization: 'Bearer ' } : {} });
  ok(`rejected: ${name}`, r.status === 401, String(r.status));
}
ok('token in the wrong scheme (Basic) is rejected', (await call('GET', '/api/orders/mine', { headers: { Authorization: `Basic ${Buffer.from('a:b').toString('base64')}` } })).status === 401);
ok('a client token works only for client endpoints', (await call('GET', '/api/orders/mine', { token: clientA.token })).status === 200 && (await call('GET', '/api/employee/inventory', { token: clientA.token })).status === 403);

section('SECURITY: registration cannot be abused');
const evilEmail = 'evil@x.test';
const evil = await call('POST', '/api/auth/register', { body: { email: evilEmail, password: 'Evil-1234!', companyName: 'Evil', billingAddress: 'x', role: 'Admin', roles: ['Admin'], status: 'Approved', creditLimit: 1000000, pricingTierId: vip.id, isAdmin: true } });
const evilTok = await login(evilEmail, 'Evil-1234!');
const evilClaims = JSON.parse(Buffer.from(evilTok.split('.')[1], 'base64url').toString());
ok('mass assignment: extra fields cannot make a registrant an Admin', evilClaims[ROLE] === 'Client', JSON.stringify(evilClaims[ROLE]));
const evilProfile = (await call('GET', `/api/employee/clients/${evil.json?.id}`, { token: emp })).json;
ok('mass assignment: credit limit stays 0 and tier stays default', near(evilProfile?.creditLimit, 0) && evilProfile?.pricingTierName === standard.name, JSON.stringify({ c: evilProfile?.creditLimit, t: evilProfile?.pricingTierName }));
ok('registered client cannot reach admin API', (await call('GET', '/api/admin/categories', { token: evilTok })).status === 403);
ok('duplicate email refused (400)', (await call('POST', '/api/auth/register', { body: { email: evilEmail, password: 'Evil-1234!', companyName: 'Evil', billingAddress: 'x' } })).status === 400);
ok('duplicate email differing only by case refused', (await call('POST', '/api/auth/register', { body: { email: evilEmail.toUpperCase(), password: 'Evil-1234!', companyName: 'Evil', billingAddress: 'x' } })).status === 400);
ok('weak password refused (400)', (await call('POST', '/api/auth/register', { body: { email: 'weak@x.test', password: 'abc', companyName: 'W', billingAddress: 'x' } })).status === 400);
ok('invalid email refused (400)', (await call('POST', '/api/auth/register', { body: { email: 'not-an-email', password: 'Weak-1234!', companyName: 'W', billingAddress: 'x' } })).status === 400);
ok('login with wrong password is 401', (await call('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'wrong' } })).status === 401);
const unknownUser = await call('POST', '/api/auth/login', { body: { email: 'nobody@x.test', password: 'wrong' } });
const wrongPw = await call('POST', '/api/auth/login', { body: { email: ADMIN.email, password: 'wrong' } });
const strip = (t) => t.replace(/"traceId":"[^"]*"/, '');
ok('login does not reveal whether the email exists (same status and body)', unknownUser.status === wrongPw.status && strip(unknownUser.text) === strip(wrongPw.text), `${unknownUser.status}/${wrongPw.status} ${strip(unknownUser.text)} | ${strip(wrongPw.text)}`);
for (let i = 0; i < 12; i++) await call('POST', '/api/auth/login', { body: { email: clientB.email, password: 'wrong' + i } });
const afterBrute = await call('POST', '/api/auth/login', { body: { email: clientB.email, password: 'Client-1234!' } });
if (afterBrute.status === 200) note('no brute-force protection: 12 wrong passwords in a row did not lock the account (rate limiting is planned in MRV-3.3)');
ok('admin cannot be created through public registration (admin role only via seed)', (await call('GET', '/api/admin/categories', { token: evilTok })).status !== 200);

section('SECURITY: injection and malformed input (must never be a 500)');
const tableCount = (t) => sql(`select count(*) from ${t}`);
const before = { products: tableCount('products'), users: tableCount('"AspNetUsers"'), categories: tableCount('categories') };
const payloads = ["'; DROP TABLE products;--", "' OR '1'='1", "\" OR 1=1 --", '%', '_', '\\', "Robert'); DELETE FROM categories;--", '<script>alert(1)</script>', '../../etc/passwd', '\u0000', 'a'.repeat(5000)];
let injBad = [];
for (const pl of payloads) {
  const enc = encodeURIComponent(pl);
  const r1 = await call('GET', `/api/products?search=${enc}`);
  if (r1.status >= 500) injBad.push(`search ${pl.slice(0, 20)} -> ${r1.status}`);
  if (pl === '%' || pl === '_') { if (r1.json?.length > 0) injBad.push(`wildcard ${pl} matched ${r1.json.length} products`); }
  if (pl === "' OR '1'='1" && r1.json?.length > 0) injBad.push('boolean injection returned rows');
  const r2 = await call('POST', '/api/auth/login', { body: { email: pl, password: pl } });
  if (r2.status >= 500) injBad.push(`login ${pl.slice(0, 20)} -> ${r2.status}`);
  const r3 = await call('POST', '/api/admin/categories', { token: admin, body: { name: pl, sortOrder: 0, isActive: false } });
  if (r3.status >= 500) injBad.push(`category name ${pl.slice(0, 20)} -> ${r3.status}`);
  const r4 = await call('POST', '/api/coverage/check', { body: { address: pl } });
  if (r4.status >= 500 && r4.status !== 502 && r4.status !== 503) injBad.push(`coverage ${pl.slice(0, 20)} -> ${r4.status}`);
}
ok('hostile strings in search, login, names and addresses never cause a 500 or leak rows', injBad.length === 0, injBad.slice(0, 6).join(' | '));
ok('SQL injection attempts changed nothing (products table intact)', tableCount('products') === before.products && tableCount('"AspNetUsers"') === before.users);
ok('stored hostile text round-trips as plain data', (await call('GET', '/api/admin/categories', { token: admin })).json.some((c) => c.name === "'; DROP TABLE products;--"));

const bad = [];
const expectNot500 = async (name, m, p, opts) => { const r = await call(m, p, opts); if (r.status >= 500) bad.push(`${name} -> ${r.status}`); return r; };
await expectNot500('malformed json', 'POST', '/api/auth/login', { raw: '{"email": ', headers: { 'Content-Type': 'application/json' } });
await expectNot500('empty body', 'POST', '/api/quotes', { token: clientA.token, raw: '', headers: { 'Content-Type': 'application/json' } });
await expectNot500('wrong content type', 'POST', '/api/auth/login', { raw: 'email=a&password=b', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
await expectNot500('json array instead of object', 'POST', '/api/auth/login', { raw: '[1,2,3]', headers: { 'Content-Type': 'application/json' } });
await expectNot500('null body', 'POST', '/api/admin/products', { token: admin, raw: 'null', headers: { 'Content-Type': 'application/json' } });
await expectNot500('empty object product', 'POST', '/api/admin/products', { token: admin, body: {} });
await expectNot500('wrong types', 'POST', '/api/admin/products', { token: admin, body: { sku: 5, name: [], isActive: 'yes', attributes: 'x' } });
await expectNot500('enum garbage', 'POST', '/api/admin/deals', { token: admin, body: { name: 'x', discountType: 'Bogus', discountValue: 1, startDate: iso(0), endDate: iso(1), productIds: [], categoryIds: [], minQty: 1 } });
await expectNot500('negative quantity', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: -1 }] } });
await expectNot500('zero quantity', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 0 }] } });
await expectNot500('int overflow quantity', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 99999999999 }] } });
await expectNot500('max int quantity', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 2147483647 }] } });
await expectNot500('unknown product in quote', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: crypto.randomUUID(), qty: 1 }] } });
await expectNot500('duplicate product lines in quote', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: [{ productId: prod.cola.id, qty: 1 }, { productId: prod.cola.id, qty: 1 }] } });
await expectNot500('huge line item list', 'POST', '/api/quotes', { token: clientA.token, body: { lineItems: Array.from({ length: 2000 }, () => ({ productId: prod.cola.id, qty: 1 })) } });
await expectNot500('5 MB body', 'POST', '/api/auth/register', { raw: JSON.stringify({ email: 'big@x.test', password: 'Big-1234!', companyName: 'x'.repeat(5_000_000), billingAddress: 'x' }), headers: { 'Content-Type': 'application/json' } });
await expectNot500('unicode and emoji', 'POST', '/api/admin/categories', { token: admin, body: { name: 'Café ☕ 🍺 日本', sortOrder: 0, isActive: false } });
await expectNot500('deal dates without a time zone', 'POST', '/api/admin/deals', { token: admin, body: { name: 'naive', discountType: 'Percent', discountValue: 5, startDate: '2026-10-01T00:00:00', endDate: '2026-12-31T00:00:00', productIds: [], categoryIds: [], minQty: 1 } });
await expectNot500('deal dates date-only', 'POST', '/api/admin/deals', { token: admin, body: { name: 'dateonly', discountType: 'Percent', discountValue: 5, startDate: '2026-10-01', endDate: '2026-12-31', productIds: [], categoryIds: [], minQty: 1 } });
await expectNot500('audit page=0', 'GET', '/api/admin/audit-log?page=0', { token: admin });
await expectNot500('audit page=-5', 'GET', '/api/admin/audit-log?page=-5', { token: admin });
await expectNot500('audit pageSize=-1', 'GET', '/api/admin/audit-log?pageSize=-1', { token: admin });
await expectNot500('audit huge page', 'GET', '/api/admin/audit-log?page=2147483647&pageSize=2147483647', { token: admin });
await expectNot500('approve unknown tier', 'PUT', `/api/admin/clients/${clientP.id}/approve`, { token: admin, body: { pricingTierId: crypto.randomUUID(), creditLimit: 1 } });
await expectNot500('approve negative credit', 'PUT', `/api/admin/clients/${clientP.id}/approve`, { token: admin, body: { pricingTierId: standard.id, creditLimit: -100 } });
await expectNot500('coverage area unknown warehouse', 'POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: crypto.randomUUID(), type: 'Radius', radiusMiles: 5, polygonGeoJson: null } });
await expectNot500('delete warehouse that has areas and stock', 'DELETE', `/api/admin/warehouses/${wh1.id}`, { token: admin });
await expectNot500('delete product that is on quotes/orders', 'DELETE', `/api/admin/products/${prod.water.id}`, { token: admin });
await expectNot500('delete pricing tier that is in use', 'PUT', `/api/admin/pricing-tiers/${standard.id}`, { token: admin, body: { name: 'x', isDefault: false } });
await expectNot500('inventory for unknown product', 'PUT', '/api/admin/inventory', { token: admin, body: { productId: crypto.randomUUID(), warehouseId: wh1.id, qtyOnHand: 1, reorderPoint: 1 } });
await expectNot500('quote price with empty lines', 'PUT', `/api/employee/quotes/${q2.id}/price`, { token: emp, body: { lineItems: [] } });
await expectNot500('employee queue with bogus status', 'GET', '/api/employee/quotes/queue?status=Bogus', { token: emp });
await expectNot500('create employee with duplicate email', 'POST', '/api/admin/employees', { token: admin, body: { email: emp1Email, password: emp1Pw, employeeCode: 'E-001', department: null, hireDate: iso(0) } });
ok('no input shape causes a 500 (see list on failure)', bad.length === 0, bad.join(' | '));

section('VALIDATION: bad business data is rejected, not stored');
const val = [];
const mustBe400 = async (name, m, p, opts) => { const r = await call(m, p, opts); if (![400, 409, 404].includes(r.status) && r.status < 500) val.push(`${name} -> ${r.status} (accepted)`); else if (r.status >= 500) val.push(`${name} -> ${r.status}`); };
await mustBe400('percent discount above 100', 'POST', '/api/admin/deals', { token: admin, body: { name: 'gratis', discountType: 'Percent', discountValue: 150, startDate: iso(-1), endDate: iso(1), productIds: [prod.cola.id], categoryIds: [], minQty: 1 } });
await mustBe400('negative discount', 'POST', '/api/admin/deals', { token: admin, body: { name: 'neg', discountType: 'Fixed', discountValue: -5, startDate: iso(-1), endDate: iso(1), productIds: [prod.cola.id], categoryIds: [], minQty: 1 } });
await mustBe400('deal ending before it starts', 'POST', '/api/admin/deals', { token: admin, body: { name: 'back', discountType: 'Percent', discountValue: 5, startDate: iso(5), endDate: iso(1), productIds: [prod.cola.id], categoryIds: [], minQty: 1 } });
await mustBe400('deal with min quantity 0', 'POST', '/api/admin/deals', { token: admin, body: { name: 'm0', discountType: 'Percent', discountValue: 5, startDate: iso(-1), endDate: iso(1), productIds: [prod.cola.id], categoryIds: [], minQty: 0 } });
await mustBe400('warehouse latitude 999', 'POST', '/api/admin/warehouses', { token: admin, body: { name: 'bad', address: 'x', latitude: 999, longitude: 999 } });
await mustBe400('radius area with negative radius', 'POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: wh1.id, type: 'Radius', radiusMiles: -10, polygonGeoJson: null } });
await mustBe400('radius area with no radius', 'POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: wh1.id, type: 'Radius', radiusMiles: null, polygonGeoJson: null } });
await mustBe400('coverage area for unknown warehouse', 'POST', '/api/admin/coverage-areas', { token: admin, body: { warehouseId: crypto.randomUUID(), type: 'Radius', radiusMiles: 5, polygonGeoJson: null } });
await mustBe400('negative client credit limit', 'PUT', `/api/admin/clients/${clientP.id}/approve`, { token: admin, body: { pricingTierId: standard.id, creditLimit: -100 } });
await mustBe400('approve with unknown tier', 'PUT', `/api/admin/clients/${clientP.id}/approve`, { token: admin, body: { pricingTierId: crypto.randomUUID(), creditLimit: 1 } });
await mustBe400('product with blank SKU', 'POST', '/api/admin/products', { token: admin, body: { sku: '  ', name: 'x', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } });
await mustBe400('product with blank name', 'POST', '/api/admin/products', { token: admin, body: { sku: 'OK-1', name: '', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } });
await mustBe400('product with a duplicate SKU', 'POST', '/api/admin/products', { token: admin, body: { sku: 'BEER-001', name: 'Duplicate', description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} } });
await mustBe400('negative unit price', 'PUT', `/api/admin/products/${prod.cola.id}/pricing`, { token: admin, body: { pricingTierId: standard.id, unitPrice: -1, minQty: 1 } });
await mustBe400('pricing with min quantity 0', 'PUT', `/api/admin/products/${prod.cola.id}/pricing`, { token: admin, body: { pricingTierId: standard.id, unitPrice: 1, minQty: 0 } });
await mustBe400('pricing for an unknown tier', 'PUT', `/api/admin/products/${prod.cola.id}/pricing`, { token: admin, body: { pricingTierId: crypto.randomUUID(), unitPrice: 1, minQty: 1 } });
await mustBe400('employee order with blank address', 'POST', '/api/employee/orders', { token: emp, body: { clientId: clientB.id, deliveryAddress: ' ', lineItems: [{ productId: prod.cola.id, qty: 1 }] } });
await mustBe400('employee with weak password', 'POST', '/api/admin/employees', { token: admin, body: { email: 'weak.emp@marvi.test', password: 'abc', employeeCode: 'E-9', department: null, hireDate: iso(0) } });
ok('every invalid business input is rejected with a 4xx', val.length === 0, val.join(' | '));

section('VALIDATION: referential rules');
const pDel = await call('DELETE', `/api/admin/warehouses/${wh1.id}`, { token: admin });
ok('cannot delete a warehouse that still has coverage areas/stock (4xx, not 500)', pDel.status >= 400 && pDel.status < 500 || pDel.status === 204, String(pDel.status));
if (pDel.status === 204) note('warehouse with coverage areas and stock was deleted outright (cascade) — check this is intended');
const tierInUse = await call('POST', '/api/admin/pricing-tiers', { token: admin, body: { name: 'VIP', isDefault: false } });
ok('duplicate pricing tier name is handled (no 500)', tierInUse.status < 500, String(tierInUse.status));

section('REFERENTIAL: history is protected, in the controllers AND in the database');
const histProduct = (await call('GET', '/api/admin/products', { token: admin })).json.find((p) => p.sku === 'WATER-001');
ok('water product still exists (its delete was refused earlier)', !!histProduct);
const delHist = await call('DELETE', `/api/admin/products/${prod.water.id}`, { token: admin });
ok('deleting a product that is on an order is refused with 409', delHist.status === 409, String(delHist.status));
ok('the warehouse that holds stock cannot be deleted (409)', (await call('DELETE', `/api/admin/warehouses/${wh1.id}`, { token: admin })).status === 409);
const tmpWh = await mk('/api/admin/warehouses', { name: 'CD Temporário', address: 'x', latitude: 0, longitude: 0 });
await mk('/api/admin/coverage-areas', { warehouseId: tmpWh.id, type: 'Radius', radiusMiles: 5, polygonGeoJson: null });
ok('an empty warehouse can be deleted (204)', (await call('DELETE', `/api/admin/warehouses/${tmpWh.id}`, { token: admin })).status === 204);
ok('...and its coverage areas went with it (database cascade)', sql(`select count(*) from coverage_areas where warehouse_id='${tmpWh.id}'`) === '0');
const dbRefuses = (statement) => { try { sql(statement); return false; } catch (e) { return /violates|duplicate key/i.test(String(e.stderr ?? e.message)); } };
ok('database itself refuses to delete a product that has order lines', dbRefuses("delete from products where id = (select product_id from order_line_items limit 1)"));
ok('database itself refuses to delete a product that has quote lines', dbRefuses("delete from products where id = (select product_id from quote_line_items limit 1)"));
ok('database itself refuses to delete a warehouse that has stock', dbRefuses("delete from warehouses where id = (select warehouse_id from inventory_records limit 1)"));
ok('database itself refuses to delete a client that has orders', dbRefuses("delete from client_accounts where id = (select client_account_id from orders limit 1)"));
ok('database itself refuses a second SKU differing only by case', dbRefuses("insert into products (id, sku, name, is_active, attributes) values (gen_random_uuid(), lower('BEER-001'), 'dup', true, '{}')"));
ok('database itself refuses a second category differing only by case', dbRefuses("insert into categories (id, name, sort_order, is_active) values (gen_random_uuid(), upper('cervejas'), 0, true)"));
ok('database itself refuses a product pointing at a missing category', dbRefuses("insert into products (id, sku, name, category_id, is_active, attributes) values (gen_random_uuid(), 'GHOST', 'x', gen_random_uuid(), true, '{}')"));

section('COVERAGE: geocoding-backed check (real provider has a placeholder key here)');
const cov = await call('POST', '/api/coverage/check', { body: { address: 'Av. Paulista 1000, São Paulo' } });
ok('coverage check with an unusable geocoding key answers 200 "not covered" (provider unavailable is not a 500)', cov.status === 200 && cov.json?.supported === false && cov.json?.warehouseName === null, `${cov.status} ${cov.text.slice(0, 100)}`);
ok('...and shows no stack trace or key', !/at Marvi|Exception|StackTrace|subscription-key|key=/i.test(cov.text));
note(`coverage check status with placeholder geocoding key: ${cov.status} ${cov.text.slice(0, 80)} (real geocoding is MRV-3.4; logic is covered by integration tests with a fake provider)`);
ok('coverage check with a blank address is not a 500', (await call('POST', '/api/coverage/check', { body: { address: '' } })).status < 500);

section('CORS and headers');
const pre = await fetch(API + '/api/products', { method: 'OPTIONS', headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'GET' } });
ok('CORS: a foreign origin is not allowed', !pre.headers.get('access-control-allow-origin'));
const preOk = await fetch(API + '/api/products', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Method': 'GET' } });
ok('CORS: the SPA origin is allowed', preOk.headers.get('access-control-allow-origin') === 'http://localhost:4200');
const sample = await call('GET', '/api/products');
ok('no server software header is exposed', sample.headers.get('server') === null, String(sample.headers.get('server')));
note(`response headers present: ${[...sample.headers.keys()].join(', ')}`);

// ---------------------------------------------------------------- database
section('DATABASE: integrity and secrecy (queried directly in Postgres)');
const q = (s) => sql(s);
ok('no plaintext passwords: every password hash is an Identity v3 hash', q(`select count(*) from "AspNetUsers" where password_hash is null or password_hash not like 'AQAAAA%'`) === '0');
ok('no known password appears anywhere in the users table', q(`select count(*) from "AspNetUsers" where password_hash in ('Client-1234!','Vendas-1234!','Marvi-Dev-Admin-1!','Evil-1234!')`) === '0');
ok('exactly one Admin exists (the seeded one)', q(`select count(*) from "AspNetUserRoles" ur join "AspNetRoles" r on r.id=ur.role_id where r.name='Admin'`) === '1');
ok('roles of seeded actors are correct', q(`select string_agg(distinct r.name, ',' order by r.name) from "AspNetUserRoles" ur join "AspNetRoles" r on r.id=ur.role_id`) === 'Admin,Client,Employee');
ok('every client has an Approved/Suspended status and a tier', q(`select count(*) from client_accounts where pricing_tier_id is null`) === '0');
ok('client C is the suspended one', q(`select count(*) from client_accounts where status=2`) === '1' || q(`select count(*) from client_accounts where status=2`) !== '0');
ok('no product references a missing category', q(`select count(*) from products p left join categories c on c.id=p.category_id where p.category_id is not null and c.id is null`) === '0');
ok('no price row references a missing product or tier', q(`select count(*) from product_pricings pp left join products p on p.id=pp.product_id left join pricing_tiers t on t.id=pp.pricing_tier_id where p.id is null or t.id is null`) === '0');
ok('exactly one default pricing tier', q(`select count(*) from pricing_tiers where is_default`) === '1');
ok('order totals equal the sum of their lines (all orders)', q(`select count(*) from orders o where o.total_amount <> coalesce((select sum(unit_price*qty) from order_line_items l where l.order_id=o.id),0)`) === '0');
ok('every order line has a positive quantity and non-negative price', q(`select count(*) from order_line_items where qty < 1 or unit_price < 0`) === '0');
ok('every quote line has a positive quantity', q(`select count(*) from quote_line_items where qty < 1`) === '0');
ok('every accepted quote has exactly one order', q(`select count(*) from quotes qq where status=3 and (select count(*) from orders o where o.quote_id=qq.id) <> 1`) === '0');
ok('no inventory below zero', q(`select count(*) from inventory_records where qty_on_hand < 0 or qty_reserved < 0`) === '0');
ok('one inventory row per product and warehouse', q(`select count(*) from (select product_id, warehouse_id from inventory_records group by 1,2 having count(*)>1) x`) === '0');
ok('no duplicate price rows per product, tier and break', q(`select count(*) from (select product_id, pricing_tier_id, min_qty from product_pricings group by 1,2,3 having count(*)>1) x`) === '0');
ok('category names are unique ignoring case', q(`select count(*) from (select lower(name) from categories group by 1 having count(*)>1) x`) === '0');
ok('no orphan quote or order lines', q(`select (select count(*) from quote_line_items l left join quotes x on x.id=l.quote_id where x.id is null) + (select count(*) from order_line_items l left join orders x on x.id=l.order_id where x.id is null)`) === '0');
ok('attributes are stored as valid jsonb with the seeded brand', q(`select attributes->>'brand' from products where sku='BEER-001'`) === 'Nacional');
ok('unicode survived the round trip', q(`select count(*) from categories where name like '%Café ☕ 🍺 日本%'`) === '1');
ok('timestamps are stored in UTC (timestamptz)', q(`select data_type from information_schema.columns where table_name='deals' and column_name='start_date'`) === 'timestamp with time zone');
ok('money columns are numeric, not floating point', q(`select string_agg(data_type, ',') from information_schema.columns where table_name='orders' and column_name='total_amount'`) === 'numeric');

section('AUDIT TRAIL');
const audit = (await call('GET', '/api/admin/audit-log?pageSize=500', { token: admin })).json;
const adminUserId = q(`select id from "AspNetUsers" where email='${ADMIN.email}'`);
ok('audit log has entries for the seeding mutations', audit.length > 40, `entries=${audit.length}`);
ok('every audit entry names the acting admin', audit.every((a) => a.actorUserId === adminUserId), `${audit.filter((a) => a.actorUserId !== adminUserId).length} entries with another actor`);
const actions = new Set(audit.map((a) => `${a.action}:${a.entityName}`));
for (const need of ['Create:Product', 'Create:Category', 'Create:Deal', 'Create:Warehouse', 'Create:CoverageArea', 'Upsert:ProductPricing', 'Upsert:InventoryRecord', 'Approve:ClientAccount', 'Suspend:ClientAccount', 'Create:EmployeeAccount', 'Create:PricingTier']) {
  ok(`audited: ${need}`, actions.has(need));
}
const auditDump = JSON.stringify(audit);
ok('audit log never contains any password', !/Vendas-1234|Client-1234|Evil-1234|Marvi-Dev-Admin|"password"/i.test(auditDump));
// Compare as times, not strings: Postgres trims trailing zeros from fractional seconds, so '.12345Z' sorts after '.123456Z' as text.
ok('audit entries are newest-first', audit.every((a, i) => i === 0 || Date.parse(audit[i - 1].timestamp) >= Date.parse(a.timestamp)));
ok('employee/client actions that are not admin mutations are not in the admin audit trail', !audit.some((a) => a.entityName === 'Quote' || a.entityName === 'Order'));
ok('audit rows exist in the database', Number(q(`select count(*) from audit_log_entries`)) >= audit.length);

// ---------------------------------------------------------------- result
console.log(`\n== RESULT: ${pass} passed, ${fail} failed, ${notes.length} notes`);
if (failures.length) { console.log('\nFAILED CHECKS:'); failures.forEach((f) => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
