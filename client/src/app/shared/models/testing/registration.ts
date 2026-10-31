// Test data for the registration specs (imported only by *.spec.ts files, so it never reaches the production bundle).
import type { Registration } from '../registration.model';

/** A business account's registration as the API sends it: complete, a head-office CNPJ with valid check digits. */
export function registration(over: Partial<Registration> = {}): Registration {
  return {
    accountType: 'Business',
    phone: '11912345678',
    invoiceEmail: 'nfe@acme.com.br',
    cnpj: '11222333000181',
    legalName: 'Acme Comércio Ltda',
    tradeName: 'Acme',
    stateRegistrationStatus: 'Contributor',
    stateRegistration: '110042490114',
    municipalRegistration: '123456',
    mainCnae: '4634601',
    taxRegime: 'SimplesNacional',
    openingDate: '2010-05-04',
    contactName: 'Ana Souza',
    hasCpf: false,
    cpfMasked: null,
    birthDate: null,
    missing: [],
    ...over,
  };
}

/** A personal account's registration: the CPF is only ever the mask. */
export function personalRegistration(over: Partial<Registration> = {}): Registration {
  return registration({
    accountType: 'Personal',
    cnpj: null, legalName: null, tradeName: null, stateRegistrationStatus: null, stateRegistration: null, municipalRegistration: null, mainCnae: null,
    taxRegime: null, openingDate: null, contactName: null,
    hasCpf: true, cpfMasked: '***.444.777-**', birthDate: '1990-03-02', phone: '11933334444', invoiceEmail: 'joao@example.com',
    ...over,
  });
}
