export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

/** One line of the customer directory (`GET /api/employee/clients`). The tier id is there because tier names are not unique. */
export interface ClientSummary {
  id: string;
  companyName: string;
  status: ClientAccountStatus;
  pricingTierId: string | null;
  pricingTierName: string | null;
}
