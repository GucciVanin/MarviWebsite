import { PRODUCT_LIMITS, ProductDraft, attributesOf, filledAttributes, isHttpsUrl, parsePrice, parseQuantity, rowsOf, suggestSku, validateProduct } from './product-rules';

const draft = (change: Partial<ProductDraft> = {}): ProductDraft => ({
  sku: 'COLA-1', name: 'Cola 2L', categoryId: 'c1', description: '', imageUrl: '', attributes: [], prices: [], quantities: [], ...change,
});
const create = { creating: true };

describe('product rules', () => {
  it('accepts a complete new product', () => {
    expect(validateProduct(draft({ prices: ['12,50', ''], quantities: ['0', '40'] }), create)).toEqual({});
  });

  it.each(['', 'ab', 'a b', 'a/b', 'ção', 'x'.repeat(41)])('refuses the new SKU %j', (sku) => {
    expect(validateProduct(draft({ sku }), create)['sku']).toContain('3 a 40');
  });

  it('accepts a legacy SKU kept as it was when editing, but not a new bad one', () => {
    expect(validateProduct(draft({ sku: 'a b' }), { creating: false, originalSku: 'a b' })).toEqual({});
    expect(validateProduct(draft({ sku: 'a c' }), { creating: false, originalSku: 'a b' })['sku']).toBeTruthy();
  });

  it('needs a name of 2 to 200 characters and a category for a new product only', () => {
    expect(validateProduct(draft({ name: 'x' }), create)['name']).toBeTruthy();
    expect(validateProduct(draft({ name: 'x'.repeat(201) }), create)['name']).toBeTruthy();
    expect(validateProduct(draft({ categoryId: '' }), create)['categoryId']).toBeTruthy();
    expect(validateProduct(draft({ categoryId: '' }), { creating: false, originalSku: 'COLA-1' })['categoryId']).toBeUndefined();
  });

  it('limits the description and requires an https image address', () => {
    expect(validateProduct(draft({ description: 'd'.repeat(2001) }), create)['description']).toBeTruthy();
    expect(validateProduct(draft({ description: 'linha 1\nlinha 2' }), create)['description']).toBeUndefined();
    for (const imageUrl of ['http://a.com/x.png', 'javascript:alert(1)', '//a.com/x.png', 'https://u:p@a.com/x.png', 'https://a.com/a b', 'https://a.com/' + 'p'.repeat(490)]) {
      expect(validateProduct(draft({ imageUrl }), create)['imageUrl']).toBeTruthy();
    }
    expect(isHttpsUrl('https://cdn.exemplo.com.br/cola.png')).toBe(true);
  });

  it('checks attribute rows: blank rows are ignored; name, value, duplicates (ignoring case) and the count are limited', () => {
    const row = (key: string, value: string) => ({ key, value });
    expect(validateProduct(draft({ attributes: [row('', ''), row(' ', ' ')] }), create)['attributes']).toBeUndefined();
    expect(validateProduct(draft({ attributes: [row('', 'x')] }), create)['attributes']).toContain('nome');
    expect(validateProduct(draft({ attributes: [row('k'.repeat(61), 'x')] }), create)['attributes']).toContain('nome');
    expect(validateProduct(draft({ attributes: [row('marca', '')] }), create)['attributes']).toContain('valor');
    expect(validateProduct(draft({ attributes: [row('marca', 'v'.repeat(201))] }), create)['attributes']).toContain('valor');
    expect(validateProduct(draft({ attributes: [row('Marca', 'a'), row(' marca ', 'b')] }), create)['attributes']).toContain('mesmo nome');
    const many = Array.from({ length: PRODUCT_LIMITS.attributes + 1 }, (_, i) => row(`k${i}`, 'v'));
    expect(validateProduct(draft({ attributes: many }), create)['attributes']).toContain('30');
    expect(validateProduct(draft({ attributes: many.slice(0, 30) }), create)['attributes']).toBeUndefined();
  });

  it('parses prices with a comma or a point, at most two decimals, above zero', () => {
    expect(parsePrice('12,5')).toBe(12.5);
    expect(parsePrice(' 0.01 ')).toBe(0.01);
    expect(parsePrice('')).toBeNull();
    for (const bad of ['0', '0,00', '-1', '1,234', '1.000,00', 'abc', '12 reais', '99999999999999999']) {
      expect(parsePrice(bad)).toBeNaN();
    }
  });

  it('parses whole quantities from 0 to 1,000,000', () => {
    expect(parseQuantity('0')).toBe(0);
    expect(parseQuantity('1000000')).toBe(1_000_000);
    expect(parseQuantity(' ')).toBeNull();
    for (const bad of ['-1', '1,5', '1000001', 'x']) {
      expect(parseQuantity(bad)).toBeNaN();
    }
  });

  it('names the price and stock rows by index', () => {
    const problems = validateProduct(draft({ prices: ['', '0'], quantities: ['5', '-2'] }), create);
    expect(Object.keys(problems).sort()).toEqual(['prices[1]', 'stock[1]']);
  });

  it('round-trips stored attributes through the editor rows without loss', () => {
    const stored = { Marca: 'Água de Côco', 'Quantidade por caixa': '12', 'Certificação': 'ISO "9001" <b>', Peso: '1,5 kg' };
    expect(attributesOf(rowsOf(stored))).toEqual(stored);
    expect(JSON.parse(JSON.stringify(attributesOf(rowsOf(stored))))).toEqual(stored);
    expect(rowsOf(null)).toEqual([]);
    expect(filledAttributes([{ key: ' ', value: '' }, { key: ' a ', value: ' b ' }])).toEqual([{ key: 'a', value: 'b' }]);
  });

  it('suggests the next free SKU from the category prefix', () => {
    expect(suggestSku('Refrigerantes', ['REF-001', 'REF-007', 'ref-002', 'XYZ-009', 'REF-ABC'])).toBe('REF-008');
    expect(suggestSku('Águas', [])).toBe('AGU-001');
    expect(suggestSku('', [])).toBe('PRD-001');
    expect(suggestSku('Ch', [])).toBe('CHX-001');
  });
  it('when editing, a description, image or attributes left as stored are not checked, but a changed one is', () => {
    const row = (key: string, value: string) => ({ key, value });
    const original = { description: 'd'.repeat(2500), imageUrl: 'http://velho.com/a.png', attributes: [row('Marca', 'A'), row('marca', 'B'), row('Linha', 'a\nb')] };
    const same = draft({ description: original.description, imageUrl: original.imageUrl, attributes: [...original.attributes].reverse() });
    const checks = { creating: false, originalSku: 'COLA-1', original };

    expect(validateProduct(same, checks)).toEqual({});
    const changed = validateProduct(draft({ description: 'e'.repeat(2600), imageUrl: 'http://outro.com/b.png', attributes: [...original.attributes, row('extra', 'y')] }), checks);
    expect(Object.keys(changed).sort()).toEqual(['attributes', 'description', 'imageUrl']);
    expect(validateProduct(same, { creating: true })['imageUrl']).toBeTruthy();
  });
});
