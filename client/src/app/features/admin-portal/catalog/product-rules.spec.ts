import { PRODUCT_LIMITS, ProductDraft, StoredProduct, attributesOf, filledAttributes, isActivationOnly, formatBytes, parsePrice, photoDimensionsProblem, photoFileProblem, parseQuantity, rowsOf, suggestSku, validateProduct } from './product-rules';

const draft = (change: Partial<ProductDraft> = {}): ProductDraft => ({
  sku: 'COLA-1', name: 'Cola 2L', categoryId: 'c1', description: '', attributes: [], prices: [], quantities: [], ...change,
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

  it('limits the description', () => {
    expect(validateProduct(draft({ description: 'd'.repeat(2001) }))['description']).toBeTruthy();
    expect(validateProduct(draft({ description: 'linha 1\nlinha 2' }))['description']).toBeUndefined();
  });

  it('has no image address any more: the photo is an uploaded file (MRV-9.7)', () => {
    expect(Object.keys(draft())).not.toContain('imageUrl');
    expect(PRODUCT_LIMITS).not.toHaveProperty('imageUrl');
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
  it('when editing, a description or attributes that break the rules are refused even if they were stored that way', () => {
    const row = (key: string, value: string) => ({ key, value });
    const broken = draft({ description: 'd'.repeat(2500), attributes: [row('Marca', 'A'), row('marca', 'B'), row('Linha', 'a\nb')] });

    expect(Object.keys(validateProduct(broken)).sort()).toEqual(['attributes', 'description']);
  });

  describe('the activation-only edit (the one exception the API makes)', () => {
    const stored: StoredProduct = { sku: 'old code!', name: 'Antigo', categoryId: null, description: 'd'.repeat(2500), isActive: true, attributes: { Marca: 'A', marca: 'B' } };
    const same = draft({ sku: 'old code!', name: 'Antigo', categoryId: '', description: 'd'.repeat(2500), attributes: rowsOf(stored.attributes) });

    it('is recognised when only "Ativo" differs, with the trimming and blank rows the API ignores', () => {
      expect(isActivationOnly(stored, same, false)).toBe(true);
      expect(isActivationOnly(stored, { ...same, sku: ' old code! ', attributes: [...same.attributes, { key: ' ', value: '' }] }, false)).toBe(true);
    });

    it('is not recognised when "Ativo" is unchanged or anything else differs', () => {
      expect(isActivationOnly(stored, same, true)).toBe(false);
      expect(isActivationOnly(stored, same, false, true)).toBe(false); // a new, replaced or removed photo is an edit like any other
      expect(isActivationOnly(stored, { ...same, name: 'Antigo 2' }, false)).toBe(false);
      expect(isActivationOnly(stored, { ...same, categoryId: 'c1' }, false)).toBe(false);
      expect(isActivationOnly(stored, { ...same, description: 'curta' }, false)).toBe(false);
      expect(isActivationOnly(stored, { ...same, attributes: [{ key: 'Marca', value: 'A' }] }, false)).toBe(false);
    });
  });

describe('the photo rules of the form (MRV-9.7), the same limits as the API', () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size });

  it('accepts JPEG, PNG and WebP up to 5 MB, by type or (when the browser gives none) by extension', () => {
    for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['A.JPEG', ''], ['b.PNG', '']]) {
      expect(photoFileProblem(file(name, type)), name).toBe('');
    }
    expect(photoFileProblem(file('a.jpg', 'image/jpeg', 5 * 1024 * 1024))).toBe('');
  });

  it('refuses anything else, an empty file and a file over 5 MB, in Portuguese and without the name', () => {
    for (const [name, type] of [['a.svg', 'image/svg+xml'], ['a.gif', 'image/gif'], ['a.pdf', 'application/pdf'], ['a.heic', 'image/heic'], ['a.txt', ''], ['a', '']]) {
      expect(photoFileProblem(file(name, type)), name).toBe('Use uma foto JPEG, PNG ou WebP.');
    }
    expect(photoFileProblem(file('a.jpg', 'image/jpeg', 0))).toBe('Escolha uma foto do produto.');
    expect(photoFileProblem(file('a.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1))).toBe('A foto deve ter no máximo 5 MB.');
  });

  it('wants 400 to 6000 pixels on each side', () => {
    expect(photoDimensionsProblem(400, 400)).toBe('');
    expect(photoDimensionsProblem(6000, 6000)).toBe('');
    expect(photoDimensionsProblem(399, 800)).toContain('400 x 400');
    expect(photoDimensionsProblem(800, 399)).toContain('400 x 400');
    expect(photoDimensionsProblem(6001, 800)).toContain('6000 x 6000');
    expect(photoDimensionsProblem(800, 6001)).toContain('6000 x 6000');
  });

  it('shows a file size in KB or MB with a decimal comma', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_258_291)).toBe('1,2 MB');
  });
});
});
