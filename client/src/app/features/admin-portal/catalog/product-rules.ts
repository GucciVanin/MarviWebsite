import { PT } from '../../../core/i18n/pt-br';

/** The limits of the guided product form (MRV-9.5); the API checks the same ones (`ProductSetupRules`). */
export const PRODUCT_LIMITS = {
  skuMin: 3,
  skuMax: 40,
  legacySkuMax: 64,
  nameMin: 2,
  nameMax: 200,
  description: 2000,
  imageUrl: 500,
  attributes: 30,
  attributeKey: 60,
  attributeValue: 200,
  stock: 1_000_000,
} as const;

/** One row of the attributes editor. */
export interface AttributeRow {
  key: string;
  value: string;
}

/** What the admin typed: texts as typed, one price and one quantity text per tier and per warehouse (same order as the tables). */
export interface ProductDraft {
  sku: string;
  name: string;
  categoryId: string;
  description: string;
  imageUrl: string;
  attributes: readonly AttributeRow[];
  prices: readonly string[];
  quantities: readonly string[];
}

export interface ProductChecks {
  /** A new product (SKU format and category are required) or an edit (a SKU kept as it was is accepted, whatever its shape). */
  creating: boolean;
  originalSku?: string;
  /** The stored description, image and attributes of the product being edited: a field left as it was is not checked (old products may hold what the rules now refuse). */
  original?: { description: string; imageUrl: string; attributes: readonly AttributeRow[] };
}

const SKU_SHAPE = /^[A-Za-z0-9._-]+$/;
const PRICE_SHAPE = /^\d+([.,]\d{1,2})?$/;
const QUANTITY_SHAPE = /^\d+$/;
const MAX_PRICE = 9_999_999_999_999_999.99;
/** True for a control character, a line or paragraph separator or an invisible format character (zero-width, bidi), as the API refuses them. */
function hasInvisible(text: string, allowNewlines = false): boolean {
  return Array.from(text).some((ch) => {
    const code = ch.codePointAt(0)!;
    if (allowNewlines && (code === 10 || code === 13 || code === 9)) {
      return false;
    }
    return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029 || (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x2064) || code === 0xfeff;
  });
}

/** A price as typed ("12,50" or "12.5"): the number, null when empty, NaN when it is not a price. */
export function parsePrice(text: string): number | null {
  const typed = text.trim();
  if (!typed) {
    return null;
  }
  if (!PRICE_SHAPE.test(typed)) {
    return Number.NaN;
  }
  const value = Number(typed.replace(',', '.'));
  return value > 0 && value <= MAX_PRICE ? value : Number.NaN;
}

/** A whole quantity, 0 up to 1,000,000: null when empty, NaN when it is not one. */
export function parseQuantity(text: string): number | null {
  const typed = text.trim();
  if (!typed) {
    return null;
  }
  const value = QUANTITY_SHAPE.test(typed) ? Number(typed) : Number.NaN;
  return value <= PRODUCT_LIMITS.stock ? value : Number.NaN;
}

function sortedRows(rows: readonly AttributeRow[]): AttributeRow[] {
  return [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Rows with a name or a value (a row with neither is not saved), trimmed. */
export function filledAttributes(rows: readonly AttributeRow[]): AttributeRow[] {
  return rows.map((r) => ({ key: r.key.trim(), value: r.value.trim() })).filter((r) => r.key || r.value);
}

/** The problems to show next to each control, by field name (`sku`, `name`, `categoryId`, `description`, `imageUrl`, `attributes`, `prices[i]`, `stock[i]`). Empty when the form is fine. */
export function validateProduct(draft: ProductDraft, checks: ProductChecks): Record<string, string> {
  const t = PT.adminCatalog.rules;
  const problems: Record<string, string> = {};
  const sku = draft.sku.trim();
  const name = draft.name.trim();

  const keptSku = !checks.creating && sku !== '' && sku === checks.originalSku;
  if (!keptSku) {
    const max = checks.creating ? PRODUCT_LIMITS.skuMax : PRODUCT_LIMITS.legacySkuMax;
    if (sku.length < PRODUCT_LIMITS.skuMin || sku.length > max || !SKU_SHAPE.test(sku)) {
      problems['sku'] = t.sku;
    }
  }
  if (name.length < PRODUCT_LIMITS.nameMin || name.length > PRODUCT_LIMITS.nameMax || hasInvisible(name)) {
    problems['name'] = t.name;
  }
  if (checks.creating && !draft.categoryId) {
    problems['categoryId'] = t.category;
  }
  const description = draft.description.trim();
  const o = checks.original;
  const sameAttributes = !!o && JSON.stringify(sortedRows(filledAttributes(o.attributes))) === JSON.stringify(sortedRows(filledAttributes(draft.attributes)));
  if (!(o && o.description.trim() === description) && (description.length > PRODUCT_LIMITS.description || hasInvisible(description, true))) {
    problems['description'] = t.description;
  }
  const image = draft.imageUrl.trim();
  if (image && !(o && o.imageUrl.trim() === image) && !isHttpsUrl(image)) {
    problems['imageUrl'] = t.imageUrl;
  }

  const rows = sameAttributes ? [] : filledAttributes(draft.attributes);
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.key || row.key.length > PRODUCT_LIMITS.attributeKey || hasInvisible(row.key)) {
      problems['attributes'] = t.attributeKey;
    } else if (!row.value || row.value.length > PRODUCT_LIMITS.attributeValue || hasInvisible(row.value)) {
      problems['attributes'] = t.attributeValue;
    } else if (seen.has(row.key.toLowerCase())) {
      problems['attributes'] = t.attributeDuplicate;
    }
    seen.add(row.key.toLowerCase());
    if (problems['attributes']) {
      break;
    }
  }
  if (!problems['attributes'] && rows.length > PRODUCT_LIMITS.attributes) {
    problems['attributes'] = t.attributeCount;
  }

  draft.prices.forEach((text, i) => {
    if (Number.isNaN(parsePrice(text))) {
      problems[`prices[${i}]`] = t.price;
    }
  });
  draft.quantities.forEach((text, i) => {
    if (Number.isNaN(parseQuantity(text))) {
      problems[`stock[${i}]`] = t.quantity;
    }
  });
  return problems;
}

/** An `https` address with a host, no spaces and no credentials, within the length limit. */
export function isHttpsUrl(text: string): boolean {
  if (text.length > PRODUCT_LIMITS.imageUrl || /\s/.test(text) || hasInvisible(text)) {
    return false;
  }
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** The attributes as the API stores them: a name to value map of the filled rows. */
export function attributesOf(rows: readonly AttributeRow[]): Record<string, string> {
  return Object.fromEntries(filledAttributes(rows).map((r) => [r.key, r.value]));
}

/** The attributes of a stored product as editor rows, in the stored order and unchanged. */
export function rowsOf(attributes: Record<string, string> | null | undefined): AttributeRow[] {
  return Object.entries(attributes ?? {}).map(([key, value]) => ({ key, value }));
}

/**
 * The next free SKU for a category: the first letters of its name (accents removed, three at most) and a number one above the
 * largest number already used with that prefix ("BEB-004"), so the admin starts from a valid code.
 */
export function suggestSku(categoryName: string, existing: readonly string[]): string {
  const letters = categoryName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const prefix = (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  const used = existing.map((sku) => pattern.exec(sku)?.[1]).filter((n): n is string => !!n).map(Number);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}
