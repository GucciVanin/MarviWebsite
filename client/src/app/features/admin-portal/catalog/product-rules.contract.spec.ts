import contract from './product-rules.contract.json';
import { PRODUCT_LIMITS, ProductDraft, parsePrice, parseQuantity, validateProduct } from './product-rules';

/**
 * MRV-9.8 AC-5: the client rules are the server's rules. `product-rules.contract.json` is read by the API test (SingleProductPathTests: the limits and
 * the three-entry-points test run every case through `ProductRules`, whose verdict is the `valid` flag) and by this spec (every case through
 * the form's rules). A rule changed on one side only fails one of the two.
 */
interface RuleCase {
  label: string;
  field: string;
  prefix?: string;
  text?: string;
  repeat?: number;
  valid: boolean;
}

const cases = contract.cases as RuleCase[];
const textOf = (c: RuleCase) => (c.prefix ?? '') + (c.text ?? '').repeat(c.repeat ?? 1);
const base = (change: Partial<ProductDraft> = {}): ProductDraft => ({
  sku: 'COLA-1', name: 'Cola 2L', categoryId: 'c1', description: '', attributes: [], prices: [], quantities: [], ...change,
});

/** The form's verdict for one case: true when the form would let it through. */
function clientAccepts(c: RuleCase): boolean {
  const text = textOf(c);
  switch (c.field) {
    case 'category': return !validateProduct(base({ categoryId: text }))['categoryId'];
    case 'sku': return !validateProduct(base({ sku: text }))['sku'];
    case 'name': return !validateProduct(base({ name: text }))['name'];
    case 'description': return !validateProduct(base({ description: text }))['description'];
    case 'attributeCount': return !validateProduct(base({ attributes: Array.from({ length: c.repeat ?? 0 }, (_, i) => ({ key: `k${i}`, value: 'v' })) }))['attributes'];
    case 'attributeKey': return !validateProduct(base({ attributes: [{ key: text, value: 'v' }] }))['attributes'];
    case 'attributeValue': return !validateProduct(base({ attributes: [{ key: 'marca', value: text }] }))['attributes'];
    case 'attributeDuplicate': return !validateProduct(base({ attributes: [{ key: text, value: '1' }, { key: text.toUpperCase(), value: '2' }] }))['attributes'];
    case 'price': return !validateProduct(base({ prices: [text] }))['prices[0]'] && !Number.isNaN(parsePrice(text));
    case 'quantity': return !validateProduct(base({ quantities: [text] }))['stock[0]'] && !Number.isNaN(parseQuantity(text));
    default: throw new Error(`Unknown case field ${c.field}`);
  }
}

describe('product rules: the client against the server contract (MRV-9.8 AC-5)', () => {
  it('has the same limits as the server', () => {
    expect({ ...PRODUCT_LIMITS }).toEqual(contract.limits);
  });

  it('covers every kind of rule, so a new field in the table is not silently skipped', () => {
    expect([...new Set(cases.map((c) => c.field))].sort()).toEqual([
      'attributeCount', 'attributeDuplicate', 'attributeKey', 'attributeValue', 'category', 'description', 'name', 'price', 'quantity', 'sku',
    ]);
    expect(cases.some((c) => c.valid)).toBe(true);
    expect(cases.some((c) => !c.valid)).toBe(true);
  });

  it.each(cases)('$label: the form says $valid, as the API does', (c) => {
    expect(clientAccepts(c)).toBe(c.valid);
  });
});
