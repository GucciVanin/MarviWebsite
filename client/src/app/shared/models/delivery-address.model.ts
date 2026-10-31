/**
 * The delivery address a quote or an order carries (MRV-9.6): a copy of one of the customer's addresses as it was when it was chosen. It has
 * no key and no id. `line` is the whole address on one line; `null` snapshot means a document made before addresses were structured (an
 * order then has the old text in `deliveryAddress`).
 */
export interface DeliveryAddressSnapshot {
  label: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  notes: string | null;
  line: string;
}
