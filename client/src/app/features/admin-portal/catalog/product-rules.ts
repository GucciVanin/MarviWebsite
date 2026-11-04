import { PT } from '../../../core/i18n/pt-br';

/**
 * The limits of the product form. The API checks the same ones in `ProductRules` for create, edit and the CSV import (MRV-9.8): one rule set.
 * `product-rules.contract.json` holds the numbers and a table of cases; the API test and `product-rules.contract.spec.ts` both read it, so a
 * change on one side only fails a test. Change a rule: `ProductRules.cs`, this file and the contract together.
 */
export const PRODUCT_LIMITS = {
  skuMin: 3,
  skuMax: 40,
  nameMin: 2,
  nameMax: 200,
  description: 2000,
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
  attributes: readonly AttributeRow[];
  prices: readonly string[];
  quantities: readonly string[];
}

/** The stored product an edit starts from. */
export interface StoredProduct {
  sku: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  isActive: boolean;
  attributes: Record<string, string> | null | undefined;
}

const SKU_SHAPE = /^[A-Za-z0-9._-]+$/;
const PRICE_SHAPE = /^\d+([.,]\d{1,2})?$/;
const QUANTITY_SHAPE = /^\d+$/;
const MAX_PRICE = 9_999_999_999_999_999.99;
/** A control character, a line or paragraph separator or an invisible format character (zero-width, bidi, soft hyphen): the API refuses all of them (`ClientAddressRules.HasForbiddenCharacters`). */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** True when a UTF-16 unit of `text` is one of those (the API looks at units too); `allowNewlines` lets a description keep line feeds, returns and tabs. */
function hasInvisible(text: string, allowNewlines = false): boolean {
  return Array.from({ length: text.length }, (_, i) => text[i]).some((ch) => !(allowNewlines && (ch === '\n' || ch === '\r' || ch === '\t')) && INVISIBLE.test(ch));
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

/**
 * True when the form differs from the stored product in "Ativo" and in nothing else. The API accepts exactly that edit without checking the
 * rest (so a product that breaks the rules can always be deactivated); the form must not block it either. A new, replaced or removed photo
 * (`photoChanged`) is a change like any other: the API validates such an edit as a whole.
 */
export function isActivationOnly(stored: StoredProduct, draft: ProductDraft, active: boolean, photoChanged = false): boolean {
  const same = (a: string | null | undefined, b: string) => (a ?? '').trim() === b.trim();
  return active !== stored.isActive
    && !photoChanged
    && same(stored.sku, draft.sku)
    && same(stored.name, draft.name)
    && same(stored.description, draft.description)
    && (stored.categoryId ?? '') === draft.categoryId
    && JSON.stringify(sortedRows(filledAttributes(rowsOf(stored.attributes)))) === JSON.stringify(sortedRows(filledAttributes(draft.attributes)));
}

/** Rows with a name or a value (a row with neither is not saved), trimmed. */
export function filledAttributes(rows: readonly AttributeRow[]): AttributeRow[] {
  return rows.map((r) => ({ key: r.key.trim(), value: r.value.trim() })).filter((r) => r.key || r.value);
}

/** The problems to show next to each control, by field name (`sku`, `name`, `categoryId`, `description`, `attributes`, `prices[i]`, `stock[i]`). Empty when the form is fine. */
export function validateProduct(draft: ProductDraft): Record<string, string> {
  const t = PT.adminCatalog.rules;
  const problems: Record<string, string> = {};
  const sku = draft.sku.trim();
  const name = draft.name.trim();

  if (sku.length < PRODUCT_LIMITS.skuMin || sku.length > PRODUCT_LIMITS.skuMax || !SKU_SHAPE.test(sku)) {
    problems['sku'] = t.sku;
  }
  if (name.length < PRODUCT_LIMITS.nameMin || name.length > PRODUCT_LIMITS.nameMax || hasInvisible(name)) {
    problems['name'] = t.name;
  }
  if (!draft.categoryId) {
    problems['categoryId'] = t.category;
  }
  const description = draft.description.trim();
  if (description.length > PRODUCT_LIMITS.description || hasInvisible(description, true)) {
    problems['description'] = t.description;
  }

  const rows = filledAttributes(draft.attributes);
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

/**
 * The product photo (MRV-9.7): the same limits as the API's `ProductPhotoRules` (5 MB, JPEG/PNG/WebP, 400 to 6000 pixels on each side). The form
 * checks them before uploading so the admin hears about a wrong file at once; the API checks the real bytes again and has the last word.
 */
export const PHOTO_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  minSide: 400,
  maxSide: 6000,
  types: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
} as const;

/** The pt-BR message for a chosen file that is clearly wrong (by name, type or size), or '' when it may be uploaded. */
export function photoFileProblem(file: { name: string; type: string; size: number }): string {
  const t = PT.adminCatalog.photoRules;
  const name = file.name.toLowerCase();
  const typeOk = (PHOTO_LIMITS.types as readonly string[]).includes(file.type) || (!file.type && PHOTO_LIMITS.extensions.some((e) => name.endsWith(e)));
  if (!typeOk) {
    return t.type;
  }
  if (file.size <= 0) {
    return t.choose;
  }
  return file.size > PHOTO_LIMITS.maxBytes ? t.size : '';
}

/** The message for a photo of this size in pixels, or ''. */
export function photoDimensionsProblem(width: number, height: number): string {
  const t = PT.adminCatalog.photoRules;
  if (width < PHOTO_LIMITS.minSide || height < PHOTO_LIMITS.minSide) {
    return t.small;
  }
  return width > PHOTO_LIMITS.maxSide || height > PHOTO_LIMITS.maxSide ? t.big : '';
}

/** A file size the way the form shows it: "850 KB", "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
