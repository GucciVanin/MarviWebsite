import type { ClientAddress } from './client-address.model';
import type { AccountType, Registration, RegistrationRequest } from './registration.model';

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
  /** The account type and registration data (MRV-9.4); the CPF only masked. */
  registration: Registration;
  /** True once the customer is approved: the verified record can only be changed by an admin. */
  registrationLocked: boolean;
}

export interface UpdateClientProfileRequest {
  companyName: string;
  accountType?: AccountType;
  registration?: RegistrationRequest;
}
