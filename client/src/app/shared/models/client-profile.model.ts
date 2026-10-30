export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

/** A customer's own company details (`GET/PUT /api/client/profile`). */
export interface ClientProfile {
  id: string;
  /** The number the customer can quote to staff (shown as C-000042); the id is never shown. */
  customerNumber: number;
  companyName: string;
  billingAddress: string;
  shippingAddresses: string[];
  status: ClientAccountStatus;
  /** When the customer registered (UTC). */
  createdAt: string;
}

export interface UpdateClientProfileRequest {
  companyName: string;
  billingAddress: string;
  shippingAddresses: string[];
}
