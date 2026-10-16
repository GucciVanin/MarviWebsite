export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

/** A customer's own company details (`GET/PUT /api/client/profile`). */
export interface ClientProfile {
  id: string;
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
