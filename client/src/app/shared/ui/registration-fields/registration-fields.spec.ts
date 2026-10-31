import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { personalRegistration, registration } from '../../models/testing/registration';
import { RegistrationDraft } from './registration-draft';
import { RegistrationFields } from './registration-fields';

@Component({
  imports: [RegistrationFields],
  template: `<app-registration-fields idPrefix="t" [draft]="draft()" [typeEditable]="typeEditable()" [locked]="locked()" [readOnly]="busy()" />`,
})
class Host {
  readonly draft = input.required<RegistrationDraft>();
  readonly typeEditable = input(true);
  readonly locked = input(false);
  readonly busy = input(false);
}

describe('RegistrationFields (MRV-9.4)', () => {
  function setup(draft: RegistrationDraft, inputs: { typeEditable?: boolean; locked?: boolean; busy?: boolean } = {}) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput('draft', draft);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#t-${id}`);
    const type = (id: string, value: string) => {
      const field = el<HTMLInputElement | HTMLSelectElement>(id)!;
      field.value = value;
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
      fixture.detectChanges();
    };
    return { fixture, root, el, type };
  }

  const full = (build: (d: RegistrationDraft) => void = () => undefined) => {
    const d = new RegistrationDraft(false, () => '2026-10-30');
    build(d);
    return d;
  };

  it('lays the business fields out in the order of the profile: CNPJ, razão social, nome fantasia, IE, municipal, CNAE, regime, abertura, e-mail, telefone, responsável', () => {
    const { root } = setup(full((d) => d.load('Acme', registration())));

    const labels = Array.from(root.querySelectorAll('.field label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual([
      'Nome da empresa', 'CNPJ', 'Razão social', 'Nome fantasia', 'Inscrição estadual', 'Número da inscrição estadual', 'Inscrição municipal', 'CNAE principal',
      'Regime tributário', 'Data de abertura', 'E-mail para NF-e', 'Telefone', 'Responsável',
    ]);
  });

  it('lays the personal fields out: full name, CPF, birth date, e-mail for the invoice, phone', () => {
    const { root } = setup(full((d) => d.load('João', personalRegistration())));

    const labels = Array.from(root.querySelectorAll('.field label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Nome completo', 'CPF', 'Data de nascimento', 'E-mail para a nota fiscal', 'Telefone']);
  });

  it('shows the derived "Matriz" or "Filial" next to the CNPJ, read-only', () => {
    const { root, type } = setup(full((d) => d.load('Acme', registration())));
    expect(root.querySelector('#t-cnpj-hint')?.textContent).toContain('Estabelecimento: Matriz');

    type('cnpj', '11222333000262');
    expect(root.querySelector('#t-cnpj-hint')?.textContent).toContain('Estabelecimento: Filial');
  });

  it('enables the state registration number only for a contributor, and empties it otherwise', () => {
    const { el, type } = setup(full((d) => d.load('Acme', registration({ stateRegistrationStatus: null, stateRegistration: null }))));
    expect(el<HTMLInputElement>('ie')!.disabled).toBe(true);

    type('ie-status', 'Contributor');
    expect(el<HTMLInputElement>('ie')!.disabled).toBe(false);
    type('ie', '123456');
    type('ie-status', 'Exempt');
    expect(el<HTMLInputElement>('ie')!.disabled).toBe(true);
    expect(el<HTMLInputElement>('ie')!.value).toBe('');
  });

  it('masks the CPF, phone and CNAE while typing', () => {
    const { el, type } = setup(full((d) => d.load('Acme', registration())));
    type('cnae', '4711302');
    type('phone', '21988887777');
    expect(el<HTMLInputElement>('cnae')!.value).toBe('4711-3/02');
    expect(el<HTMLInputElement>('phone')!.value).toBe('(21) 98888-7777');

    const person = setup(full((d) => d.load('João', personalRegistration())));
    person.type('cpf', '52998224725');
    expect(person.el<HTMLInputElement>('cpf')!.value).toBe('529.982.247-25');
  });

  it('an editable stored CPF: the field is empty to retype, the hint shows the masked current value and says it stays when left blank, and no full CPF is in the page', () => {
    const { el, root } = setup(full((d) => d.load('João', personalRegistration())));

    expect(el<HTMLInputElement>('cpf')!.value).toBe('');
    expect(el<HTMLInputElement>('cpf')!.readOnly).toBe(false);
    const hint = root.querySelector('#t-cpf-hint')?.textContent ?? '';
    expect(hint).toContain('CPF cadastrado: ***.444.777-**');
    expect(hint).toContain('Deixe em branco para manter');
    expect(root.innerHTML).not.toContain('111.444.777-35');
    expect(root.innerHTML).not.toContain('11144477735');
  });

  it('a locked CPF shows the masked value in the read-only field, never the full number', () => {
    const { el, root } = setup(full((d) => d.load('João', personalRegistration())), { locked: true, typeEditable: false });

    expect(el<HTMLInputElement>('cpf')!.value).toBe('***.444.777-**');
    expect(el<HTMLInputElement>('cpf')!.readOnly).toBe(true);
    expect(root.innerHTML).not.toContain('111.444.777-35');
    expect(root.innerHTML).not.toContain('11144477735');
  });

  it('typing a new CPF into an editable field shows what is typed, not the old mask', () => {
    const { el, type } = setup(full((d) => d.load('João', personalRegistration())));

    type('cpf', '52998224725');

    expect(el<HTMLInputElement>('cpf')!.value).toBe('529.982.247-25');
  });

  it('keeps the browser from remembering the CPF and the birth date', () => {
    const { el } = setup(full((d) => d.load('João', personalRegistration())));

    expect(el<HTMLInputElement>('cpf')!.getAttribute('autocomplete')).toBe('off');
    expect(el<HTMLInputElement>('birth')!.getAttribute('autocomplete')).toBe('off');
  });

  it('a type that cannot be changed is shown as text, with no radio', () => {
    const { root } = setup(full((d) => d.load('Acme', registration())), { typeEditable: false });

    expect(root.querySelector('input[type="radio"]')).toBeNull();
    expect(root.textContent).toContain('Tipo de conta: Conta empresarial');
  });

  describe('locked after approval', () => {
    it('makes the verified fields read-only and says why once, but leaves phone, invoice e-mail and contact editable', () => {
      const { root, el } = setup(full((d) => d.load('Acme', registration())), { locked: true, typeEditable: false });

      for (const id of ['name', 'cnpj', 'legal', 'trade', 'ie', 'municipal', 'cnae', 'opening']) {
        expect(el<HTMLInputElement>(id)!.readOnly, id).toBe(true);
      }
      for (const id of ['ie-status', 'regime']) {
        expect(el<HTMLSelectElement>(id)!.disabled, id).toBe(true);
      }
      for (const id of ['email', 'phone', 'contact']) {
        expect(el<HTMLInputElement>(id)!.readOnly, id).toBe(false);
      }
      const why = root.querySelector('#t-lock')!;
      expect(why.textContent).toContain('só a Marvi pode alterá-los');
      expect(why.textContent).toContain('entre em contato com a empresa');
      expect(el('cnpj')!.getAttribute('aria-describedby')).toBe('t-cnpj-hint t-lock');
      expect(el('legal')!.getAttribute('aria-describedby')).toBe('t-legal-hint t-lock');
    });

    it('a personal account locks the CPF and the birth date', () => {
      const { el } = setup(full((d) => d.load('João', personalRegistration())), { locked: true, typeEditable: false });

      expect(el<HTMLInputElement>('cpf')!.readOnly).toBe(true);
      expect(el<HTMLInputElement>('birth')!.readOnly).toBe(true);
      expect(el<HTMLInputElement>('phone')!.readOnly).toBe(false);
    });
  });

  it('is read-only while a request is in flight', () => {
    const { el } = setup(full((d) => d.load('Acme', registration())), { busy: true });

    expect(el<HTMLInputElement>('phone')!.readOnly).toBe(true);
    expect(el<HTMLInputElement>('cnpj')!.readOnly).toBe(true);
  });

  it('the birth date picker cannot go past today', () => {
    const { el } = setup(full((d) => d.load('João', personalRegistration())));

    expect(el<HTMLInputElement>('birth')!.max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(el<HTMLInputElement>('birth')!.min).toBe('1900-01-01');
  });
});
