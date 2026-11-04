/** A product as the public catalog lists it (price is for the caller's pricing tier). */
export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  /** The relative path of the photo the admin uploaded (`/api/public/media/products/{name}`), null when there is none. */
  imageUrl: string | null;
  /** What the admin wrote about the product, shown on the storefront card. */
  description?: string | null;
  /** The category's name, shown on the storefront card. */
  categoryName?: string | null;
  attributes: Record<string, string>;
  /** null when the product has no price for the caller's tier (show "on request", never 0). */
  price: number | null;
  dealName: string | null;
  inStock: boolean;
}

export interface Category {
  id: string;
  name: string;
  productCount: number;
}
