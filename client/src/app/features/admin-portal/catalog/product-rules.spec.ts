import { PRODUCT_LIMITS, ProductDraft, StoredProduct, attributesOf, filledAttributes, isActivationOnly, isHttpsUrl, parsePrice, parseQuantity, rowsOf, suggestSku, validateProduct } from './product-rules';

const draft = (change: Partial<ProductDraft> = {}): ProductDraft => ({
  sku: 'COLA-1', name: 'Cola 2L', categoryId: 'c1', description: '', imageUrl: '', attributes: [], prices: [], quantities: [], ...change,
});

describe('product rules', () => {
  it('accepts a complete new product', () => {
    expect(validateProduct(draft({ prices: ['12,50', ''], quantities: ['0', '40'] }))).toEqual({});
  });

  it.each(['', 'ab', 'a b', 'a/b', 'ção', 'x'.repeat(41)])('refuses the new SKU %j', (sku) => {
    expect(validateProduct(draft({ sku }))['sku']).toContain('3 a 40');
  });

  it('applies the same SKU rule when editing: a stored code that breaks it must be corrected', () => {
    expect(validateProduct(draft({ sku: 'a b' }))['sku']).toBeTruthy();
    expect(validateProduct(draft({ sku: 'x'.repeat(41) }))['sku']).toBeTruthy();
    expect(validateProduct(draft({ sku: 'COLA-1' }))).toEqual({});
  });

  it('needs a name of 2 to 200 characters and a category, for a new product and an edit alike', () => {
    expect(validateProduct(draft({ name: 'x' }))['name']).toBeTruthy();
    expect(validateProduct(draft({ name: 'x'.repeat(201) }))['name']).toBeTruthy();
    expect(validateProduct(draft({ categoryId: '' }))['categoryId']).toBeTruthy();
    expect(validateProduct(draft({ categoryId: 'c1' }))['categoryId']).toBeUndefined();
  });

  it('limits the description and requires an https image address', () => {
    expect(validateProduct(draft({ description: 'd'.repeat(2001) }))['description']).toBeTruthy();
    expect(validateProduct(draft({ description: 'linha 1\nlinha 2' }))['description']).toBeUndefined();
    for (const imageUrl of ['http://a.com/x.png', 'javascript:alert(1)', '//a.com/x.png', 'https://u:p@a.com/x.png', 'https://a.com/a b', 'https://a.com/' + 'p'.repeat(490)]) {
      expect(validateProduct(draft({ imageUrl }))['imageUrl']).toBeTruthy();
    }
    expect(isHttpsUrl('https://cdn.exemplo.com.br/cola.png')).toBe(true);
  });

  it('checks attribute rows: blank rows are ignored; name, value, duplicates (ignoring case) and the count are limited', () => {
    const row = (key: string, value: string) => ({ key, value });
    expect(validateProduct(draft({ attributes: [row('', ''), row(' ', ' ')] }))['attributes']).toBeUndefined();
    expect(validateProduct(draft({ attributes: [row('', 'x')] }))['attributes']).toContain('nome');
    expect(validateProduct(draft({ attributes: [row('k'.repeat(61), 'x')] }))['attributes']).toContain('nome');
    expect(validateProduct(draft({ attributes: [row('marca', '')] }))['attributes']).toContain('valor');
    expect(validateProduct(draft({ attributes: [row('marca', 'v'.repeat(201))] }))['attributes']).toContain('valor');
    expect(validateProduct(draft({ attributes: [row('Marca', 'a'), row(' marca ', 'b')] }))['attributes']).toContain('mesmo nome');
    const many = Array.from({ length: PRODUCT_LIMITS.attributes + 1 }, (_, i) => row(`k${i}`, 'v'));
    expect(validateProduct(draft({ attributes: many }))['attributes']).toContain('30');
    expect(validateProduct(draft({ attributes: many.slice(0, 30) }))['attributes']).toBeUndefined();
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
    const problems = validateProduct(draft({ prices: ['', '0'], quantities: ['5', '-2'] }));
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
  it('when editing, a description, image or attributes that break the rules are refused even if they were stored that way', () => {
    const row = (key: string, value: string) => ({ key, value });
    const broken = draft({ description: 'd'.repeat(2500), imageUrl: 'http://velho.com/a.png', attributes: [row('Marca', 'A'), row('marca', 'B'), row('Linha', 'a\nb')] });

    expect(Object.keys(validateProduct(broken)).sort()).toEqual(['attributes', 'description', 'imageUrl']);
  });

  describe('the activation-only edit (the one exception the API makes)', () => {
    const stored: StoredProduct = { sku: 'old code!', name: 'Antigo', categoryId: null, description: 'd'.repeat(2500), imageUrl: 'http://velho.com/a.png', isActive: true, attributes: { Marca: 'A', marca: 'B' } };
    const same = draft({ sku: 'old code!', name: 'Antigo', categoryId: '', description: 'd'.repeat(2500), imageUrl: 'http://velho.com/a.png', attributes: rowsOf(stored.attributes) });

    it('is recognised when only "Ativo" differs, with the trimming and blank rows the API ignores', () => {
      expect(isActivationOnly(stored, same, false)).toBe(true);
      expect(isActivationOnly(stored, { ...same, sku: ' old code! ', attributes: [...same.attributes, { key: ' ', value: '' }] }, false)).toBe(true);
    });

    it('is not recognised when "Ativo" is unchanged or anything else differs', () => {
      expect(isActivationOnly(stored, same, true)).toBe(false);
      expect(isActivationOnly(stored, { ...same, name: 'Antigo 2' }, false)).toBe(false);
      expect(isActivationOnly(stored, { ...same, categoryId: 'c1' }, false)).toBe(false);
      expect(isActivationOnly(stored, { ...same, description: 'curta' }, false)).toBe(false);
      expect(isActivationOnly(stored, { ...same, attributes: [{ key: 'Marca', value: 'A' }] }, false)).toBe(false);
    });
  });
});
