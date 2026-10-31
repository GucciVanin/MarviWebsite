export type ClientAddressKind = 'Billing' | 'Delivery' | 'Both';

/**
 * One of a customer's addresses (MRV-9.3). `key` is the opaque handle used only in API calls: it is never rendered. `postalCode` is the 8
 * digits, formatted for display by `formatPostalCode`.
 */
export interface ClientAddress {
  key: string;
  label: string;
  kind: ClientAddressKind;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  country: string;
  deliveryNotes: string | null;
  isBilling: boolean;
  isDefaultDelivery: boolean;
  /** True on an address made from the old free text: the customer is asked to complete it. */
  needsReview: boolean;
}

/** What the page sends to create, change or (for registration) start an address. The two flags only ASK to make this one the billing / default delivery address. */
export interface ClientAddressRequest {
  label: string | null;
  kind: ClientAddressKind | null;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  deliveryNotes: string | null;
  isBilling: boolean;
  isDefaultDelivery: boolean;
}

/** The addresses of a customer with the two chosen ones (staff and customer views alike). */
export interface WithAddresses {
  addresses: ClientAddress[];
  billingAddressKey: string | null;
  defaultDeliveryKey: string | null;
}
