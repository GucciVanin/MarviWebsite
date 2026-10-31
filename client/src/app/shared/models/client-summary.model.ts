import type { AccountType } from './registration.model';

export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

/** One line of the customer directory (`GET /api/employee/clients`). The tier id is there because tier names are not unique. */
export interface ClientSummary {
  id: string;
  /** Shown as C-000042; the id is never shown. */
  customerNumber: number;
  companyName: string;
  status: ClientAccountStatus;
  pricingTierId: string | null;
  pricingTierName: string | null;
  /** When the customer registered (UTC). */
  createdAt: string;
  /** Business or personal (MRV-9.4). */
  accountType: AccountType;
}
