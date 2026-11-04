import { Component, ElementRef, HostListener, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PT } from '../../../core/i18n/pt-br';
import { action } from '../../../core/http/action';
import { AddressPipe, billingAddressOf, defaultDeliveryOf, otherAddressesOf } from '../../format/address';
import { CustomerNumberPipe, formatCustomerNumber } from '../../format/number.pipes';
import { PtDatePipe } from '../../format/pt-date.pipe';
import type { ClientProfile } from '../../../features/employee-portal/api/employee.service';
import { ErrorAlert } from '../error-alert/error-alert';
import { RegistrationFacts } from '../registration-summary/registration-summary';
import { CustomerLookupService } from './customer-lookup.service';

let nextWidget = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Quotes still waiting for a price or an answer, and orders not yet delivered or cancelled. */
export function openDocuments(profile: ClientProfile): { quotes: number; orders: number } {
  return {
    quotes: profile.quotes.filter((q) => q.status === 'Submitted' || q.status === 'Priced').length,
    orders: profile.orders.filter((o) => o.status === 'Placed' || o.status === 'Backordered').length,
  };
}

/**
 * "Consultar cliente" (MRV-9.2): a button that opens a non-modal dialog next to it with the customer's information and a link that opens
 * the customer page in a new tab. Focus moves into the dialog and Tab stays there; Escape, the close button or a click outside close it and
 * give focus back to the button. A customer already loaded in this session is shown without asking the API again.
 */
@Component({
  selector: 'app-customer-lookup',
  imports: [RouterLink, ErrorAlert, CustomerNumberPipe, PtDatePipe, AddressPipe, RegistrationFacts],
  templateUrl: './customer-lookup.html',
  styleUrl: './customer-lookup.scss',
})
export class CustomerLookup {
  protected readonly t = PT.customerLookup;
  protected readonly statuses = PT.employeePortal.clientStatus;
  private readonly lookup = inject(CustomerLookupService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The customer number (C-000042 is 42); never the id. */
  readonly number = input.required<number>();
  /** The text of the button that opens the widget. */
  readonly label = input.required<string>();
  /** Fires with the customer each time the widget shows one (so the order form can work with the same customer). */
  readonly shown = output<ClientProfile>();

  protected readonly open = signal(false);
  protected readonly profile = signal<ClientProfile | null>(null);
  protected readonly loadAction = action({ latestOnly: true });
  protected readonly id = `customer-lookup-${++nextWidget}`;
  protected readonly titleId = `${this.id}-title`;
  protected readonly pageNumber = computed(() => formatCustomerNumber(this.number()));
  protected readonly title = computed(() => this.profile()?.companyName ?? `${PT.numbers.customer} ${this.pageNumber()}`);
  protected readonly billing = computed(() => {
    const profile = this.profile();
    return profile ? billingAddressOf(profile) : null;
  });
  /** Where this customer's deliveries go when nothing else is chosen (MRV-9.6); none for a customer migrated without one. */
  protected readonly defaultDelivery = computed(() => {
    const profile = this.profile();
    return profile ? defaultDeliveryOf(profile) : null;
  });
  protected readonly others = computed(() => {
    const profile = this.profile();
    return profile ? otherAddressesOf(profile) : [];
  });
  protected readonly counts = computed(() => {
    const profile = this.profile();
    return profile ? openDocuments(profile) : null;
  });

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    this.load();
    afterNextRender(() => this.arrive(), { injector: this.injector });
  }

  protected load(): void {
    const number = this.number();
    this.profile.set(this.lookup.cached(number) ?? null);
    this.loadAction.run(this.lookup.get(number), (profile) => {
      // Closed before the answer came: nothing is shown and the page is not told.
      if (!this.open()) {
        return;
      }
      this.profile.set(profile);
      this.shown.emit(profile);
      afterNextRender(() => this.place(), { injector: this.injector });
    });
  }

  /** Closes the widget and gives focus back to the button that opened it. */
  protected close(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.loadAction.reset();
    this.trigger()?.nativeElement.focus();
  }

  /**
   * A click outside closes the widget. Focus goes back to the button too, unless the click itself put focus on something else (a field,
   * another button): the browser moves focus after this handler, so it is checked on the next tick.
   */
  private closeFromOutside(): void {
    this.close();
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        this.trigger()?.nativeElement.focus();
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close();
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onPointerDown(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.closeFromOutside();
    }
  }

  @HostListener('window:resize')
  protected onResize(): void {
    if (this.open()) {
      this.place();
    }
  }

  /** Keeps Tab inside the dialog while it is open. */
  protected trapTab(event: Event): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const keyboard = event as KeyboardEvent;
    const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (stops.length === 0) {
      keyboard.preventDefault();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (keyboard.shiftKey && (active === first || active === panel)) {
      keyboard.preventDefault();
      last.focus();
    } else if (!keyboard.shiftKey && active === last) {
      keyboard.preventDefault();
      first.focus();
    }
  }

  private arrive(): void {
    this.place();
    this.panel()?.nativeElement.focus({ preventScroll: true });
  }

  /** Keeps the dialog inside the viewport sideways and scrolls it into view (its own CSS keeps it clear of the header and the floating buttons). */
  private place(): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const margin = 8;
    const viewport = document.documentElement.clientWidth;
    panel.style.setProperty('--shift', '0px');
    const box = panel.getBoundingClientRect();
    let shift = 0;
    if (box.right > viewport - margin) {
      shift = viewport - margin - box.right;
    }
    if (box.left + shift < margin) {
      shift = margin - box.left;
    }
    panel.style.setProperty('--shift', `${shift}px`);
    if (typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
}
