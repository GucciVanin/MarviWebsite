import type { ClientAddress } from './client-address.model';

export type ClientAccountStatus = 'Pending' | 'Approved' | 'Suspended';

/** A customer's own company details (`GET/PUT /api/client/profile`); the addresses are kept with `/api/client/addresses` (MRV-9.3). */
export interface ClientProfile {
  id: string;
  /** The number the customer can quote to staff (shown as C-000042); the id is never shown. */
  customerNumber: number;
  companyName: string;
  addresses: ClientAddress[];
  billingAddressKey: string | null;
  defaultDeliveryKey: string | null;
  status: ClientAccountStatus;
  /** When the customer registered (UTC). */
  createdAt: string;
}

export interface UpdateClientProfileRequest {
  companyName: string;
}
