import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Registration } from '../../models/registration.model';
import { personalRegistration, registration } from '../../models/testing/registration';
import { RegistrationFacts } from './registration-summary';

@Component({
  imports: [RegistrationFacts],
  template: `<dl appRegistrationFacts [registration]="value()" [full]="full()"></dl>`,
})
class Host {
  readonly value = input.required<Registration>();
  readonly full = input(false);
}

describe('RegistrationFacts (staff views, MRV-9.4)', () => {
  function show(value: Registration, full = false) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('full', full);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // Each row as "label value", so a check reads like the screen.
    const rows = Array.from(root.querySelectorAll('div')).map((row) => `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim()}`);
    return { root, text: rows.join(' | ') };
  }

  it('a business shows the "Empresa" badge, the formatted CNPJ with Matriz or Filial and a complete record', () => {
    const { root, text } = show(registration());

    expect(root.querySelector('[data-testid="account-type"]')?.textContent).toBe('Empresa');
    expect(text).toContain('CNPJ 11.222.333/0001-81 (Matriz)');
    expect(root.querySelector('[data-testid="completeness"] .badge--ok')?.textContent).toBe('Completo');
    expect(show(registration({ cnpj: '11222333000262' })).text).toContain('(Filial)');
  });

  it('a person shows the "Pessoa física" badge and the CPF masked, never in full', () => {
    const { root, text } = show(personalRegistration());

    expect(root.querySelector('[data-testid="account-type"]')?.textContent).toBe('Pessoa física');
    expect(root.querySelector('[data-testid="document"]')?.textContent?.trim()).toBe('***.444.777-**');
    expect(text).toContain('CPF ***.444.777-**');
    expect(text).not.toContain('111.444.777-35');
  });

  it('shows how complete the record is and what is missing, in pt-BR', () => {
    const { root, text } = show(registration({ cnpj: null, tradeName: null, missing: ['cnpj', 'phone', 'contactName'] }));

    expect(root.querySelector('[data-testid="completeness"] .badge--warn')?.textContent).toBe('8 de 11 campos');
    expect(text).toContain('Falta: CNPJ, Telefone, Responsável');
    expect(text).toContain('CNPJ —');
  });

  it('a person has four fields to complete', () => {
    expect(show(personalRegistration({ hasCpf: false, cpfMasked: null, missing: ['cpf'] })).text).toContain('3 de 4 campos');
  });

  it('the full view adds every field that has a value, dates without a time zone shift', () => {
    const { text } = show(registration(), true);

    expect(text).toContain('Razão social Acme Comércio Ltda');
    expect(text).toContain('Nome fantasia Acme');
    expect(text).toContain('Inscrição estadual Contribuinte do ICMS · 110042490114');
    expect(text).toContain('Inscrição municipal 123456');
    expect(text).toContain('CNAE principal 4634-6/01');
    expect(text).toContain('Regime tributário Simples Nacional');
    expect(text).toContain('Data de abertura 04/05/2010');
    expect(text).toContain('Responsável Ana Souza');
    expect(text).toContain('Telefone (11) 91234-5678');
    expect(text).toContain('E-mail para NF-e nfe@acme.com.br');
    expect(show(personalRegistration(), true).text).toContain('Data de nascimento 02/03/1990');
    expect(show(registration(), false).text).not.toContain('Razão social');
  });
});
