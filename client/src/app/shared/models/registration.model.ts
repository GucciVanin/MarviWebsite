export type AccountType = 'Business' | 'Personal';
export type StateRegistrationStatus = 'Contributor' | 'Exempt' | 'NonContributor';
export type TaxRegime = 'Mei' | 'SimplesNacional' | 'LucroPresumido' | 'LucroReal';

/**
 * A customer's registration data (MRV-9.4), as the API sends it to the customer and to staff. The CPF is never here in full: `cpfMasked` is
 * `***.456.789-**`. `missing` lists the fields of a complete record that are still empty (the staff completeness indicator), by API name.
 */
export interface Registration {
  accountType: AccountType;
  phone: string | null;
  invoiceEmail: string | null;
  cnpj: string | null;
  legalName: string | null;
  tradeName: string | null;
  stateRegistrationStatus: StateRegistrationStatus | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  mainCnae: string | null;
  taxRegime: TaxRegime | null;
  /** `yyyy-mm-dd`. */
  openingDate: string | null;
  contactName: string | null;
  hasCpf: boolean;
  cpfMasked: string | null;
  /** `yyyy-mm-dd`. */
  birthDate: string | null;
  missing: string[];
}

/** What is sent to register or to save the data; every field is optional, the account type says which belong. A `cpf` left out keeps the stored one. */
export interface RegistrationRequest {
  phone?: string | null;
  invoiceEmail?: string | null;
  cnpj?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  stateRegistrationStatus?: StateRegistrationStatus | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  mainCnae?: string | null;
  taxRegime?: TaxRegime | null;
  openingDate?: string | null;
  contactName?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
}
