import { Component, computed, input } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import { cnpjKind, formatCnpj, formatDateOnly, maskCnae, maskPhone } from '../../format/registration';
import type { Registration } from '../../models/registration.model';

const FIELDS_PER_TYPE = { Business: 11, Personal: 4 } as const;

/**
 * A customer's account type and registration data as staff read it (MRV-9.4): the type badge, the CNPJ (or the CPF, masked: staff never see it in full
 * here), and the completeness indicator ("8 de 11 campos" with what is missing). `full` adds every other field that has a value. It renders the rows
 * of a definition list, so it is used as an attribute on a `<dl>`: `<dl appRegistrationFacts [registration]="...">`.
 */
@Component({
  selector: 'dl[appRegistrationFacts]',
  // The rows belong to this component's view, so the parent's scoped styles do not reach them: same look as the facts lists they sit in.
  styles: `
    div { min-width: 0; }
    dt { color: var(--color-text-muted, #5a6275); font-size: 0.85rem; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .muted { display: block; }
  `,
  template: `
    <div>
      <dt>{{ l.accountType }}</dt>
      <dd><span class="badge" data-testid="account-type">{{ t.accountType[registration().accountType] }}</span></dd>
    </div>
    <div>
      <dt>{{ registration().accountType === 'Business' ? t.cnpj : t.cpf }}</dt>
      <dd data-testid="document">
        {{ document() || t.none }}
        @if (kind(); as kind) {
          <span class="muted">({{ t.kinds[kind] }})</span>
        }
      </dd>
    </div>
    <div>
      <dt>{{ t.completeness }}</dt>
      <dd data-testid="completeness">
        @if (registration().missing.length === 0) {
          <span class="badge badge--ok">{{ t.complete }}</span>
        } @else {
          <span class="badge badge--warn">{{ t.completenessOf(done(), total()) }}</span>
          <span class="muted">{{ t.missingPrefix }} {{ missingNames() }}</span>
        }
      </dd>
    </div>
    @if (full()) {
      @let r = registration();
      @if (r.accountType === 'Business') {
        @if (r.legalName) { <div><dt>{{ t.legalName }}</dt><dd>{{ r.legalName }}</dd></div> }
        @if (r.tradeName) { <div><dt>{{ t.tradeName }}</dt><dd>{{ r.tradeName }}</dd></div> }
        @if (r.stateRegistrationStatus) {
          <div><dt>{{ t.ieStatus }}</dt><dd>{{ t.ieStatuses[r.stateRegistrationStatus] }}{{ r.stateRegistration ? ' · ' + r.stateRegistration : '' }}</dd></div>
        }
        @if (r.municipalRegistration) { <div><dt>{{ t.municipal }}</dt><dd>{{ r.municipalRegistration }}</dd></div> }
        @if (r.mainCnae) { <div><dt>{{ t.cnae }}</dt><dd>{{ cnae() }}</dd></div> }
        @if (r.taxRegime) { <div><dt>{{ t.regime }}</dt><dd>{{ t.regimes[r.taxRegime] }}</dd></div> }
        @if (r.openingDate) { <div><dt>{{ t.opening }}</dt><dd>{{ date(r.openingDate) }}</dd></div> }
        @if (r.contactName) { <div><dt>{{ t.contact }}</dt><dd>{{ r.contactName }}</dd></div> }
      } @else if (r.birthDate) {
        <div><dt>{{ t.birthDate }}</dt><dd>{{ date(r.birthDate) }}</dd></div>
      }
      @if (r.phone) { <div><dt>{{ t.phone }}</dt><dd>{{ phone() }}</dd></div> }
      @if (r.invoiceEmail) { <div><dt>{{ r.accountType === 'Business' ? t.invoiceEmailBusiness : t.invoiceEmailPerson }}</dt><dd>{{ r.invoiceEmail }}</dd></div> }
    }
  `,
})
export class RegistrationFacts {
  protected readonly t = PT.registration;
  protected readonly l = PT.customerLookup;

  readonly registration = input.required<Registration>();
  /** Every field that has a value, not only the type, the document and the completeness. */
  readonly full = input(false);

  protected readonly document = computed(() => {
    const r = this.registration();
    return r.accountType === 'Business' ? formatCnpj(r.cnpj) : r.cpfMasked;
  });
  protected readonly kind = computed(() => (this.registration().accountType === 'Business' ? cnpjKind(this.registration().cnpj) : null));
  protected readonly total = computed(() => FIELDS_PER_TYPE[this.registration().accountType]);
  protected readonly done = computed(() => this.total() - this.registration().missing.length);
  protected readonly missingNames = computed(() =>
    this.registration().missing.map((field) => (this.t.fields as Record<string, string>)[field] ?? field).join(', '),
  );
  protected readonly cnae = computed(() => maskCnae(this.registration().mainCnae));
  protected readonly date = formatDateOnly;
  protected readonly phone = computed(() => maskPhone(this.registration().phone));
}
