import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApprovalForm } from './approval-form';

const tiers = [{ id: 't-std', name: 'Standard', isDefault: true }, { id: 't-gold', name: 'Ouro', isDefault: false }];

@Component({
  imports: [ApprovalForm],
  template: `<app-approval-form [tiers]="tiers" [suggestedTierId]="suggested()" [busy]="busy()" (confirmed)="confirmed.push($event)" (cancelled)="cancelled = cancelled + 1" />`,
})
class Host {
  tiers = tiers;
  suggested = signal<string | null>(null);
  busy = signal(false);
  confirmed: string[] = [];
  cancelled = 0;
}

describe('ApprovalForm', () => {
  async function setup(suggested: string | null = null) {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.suggested.set(suggested);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const select = () => root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!;
    const button = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    return { fixture, host: fixture.componentInstance, root, settle, select, button };
  }

  it('starts with nothing chosen when no tier is suggested: nobody is approved by default', async () => {
    const { select, button } = await setup();

    expect(select().value).toBe('');
    expect(Array.from(select().options).map((o) => o.textContent?.trim())).toEqual(['Escolha a faixa de preço', 'Standard', 'Ouro']);
    expect(button('Confirmar aprovação').disabled).toBe(true);
  });

  it('confirms only after a tier is chosen, and says which one', async () => {
    const { host, select, button, settle } = await setup();

    select().value = 't-gold';
    select().dispatchEvent(new Event('change'));
    await settle();
    expect(button('Confirmar aprovação').disabled).toBe(false);
    button('Confirmar aprovação').click();

    expect(host.confirmed).toEqual(['t-gold']);
  });

  it('suggests a tier the list offers, but still waits for the confirming click', async () => {
    const { host, select, button } = await setup('t-gold');

    expect(select().value).toBe('t-gold');
    expect(host.confirmed).toEqual([]);
    expect(button('Confirmar aprovação').disabled).toBe(false);
  });

  it('does not suggest a tier the list does not offer', async () => {
    const { select, button } = await setup('t-gone');

    expect(select().value).toBe('');
    expect(button('Confirmar aprovação').disabled).toBe(true);
  });

  it('can be cancelled, and cannot be confirmed while a request is running', async () => {
    const { host, button, settle } = await setup('t-std');

    button('Cancelar').click();
    expect(host.cancelled).toBe(1);

    host.busy.set(true);
    await settle();
    expect(button('Confirmar aprovação').disabled).toBe(true);
  });
});
