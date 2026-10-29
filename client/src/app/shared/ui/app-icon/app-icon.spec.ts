import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppIcon } from './app-icon';
import { ICONS, type IconName } from './icons';

@Component({
  imports: [AppIcon],
  template: '<app-icon [name]="name()" [label]="label()" [size]="size()" />',
})
class Host {
  readonly name = signal<IconName>('mail');
  readonly label = signal('');
  readonly size = signal<string | null>(null);
}

describe('AppIcon', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const icon = () => (fixture.nativeElement as HTMLElement).querySelector('app-icon') as HTMLElement;
    return { fixture, icon };
  }

  it('is decorative by default: hidden from screen readers, no role or name', () => {
    const { icon } = render();

    expect(icon().getAttribute('aria-hidden')).toBe('true');
    expect(icon().hasAttribute('role')).toBe(false);
    expect(icon().hasAttribute('aria-label')).toBe(false);
  });

  it('becomes an image with an accessible name when a label is given', () => {
    const { fixture, icon } = render();
    fixture.componentInstance.label.set('Enviado');
    fixture.detectChanges();

    expect(icon().getAttribute('role')).toBe('img');
    expect(icon().getAttribute('aria-label')).toBe('Enviado');
    expect(icon().hasAttribute('aria-hidden')).toBe(false);
  });

  it('draws an svg, and takes its size from the size input when given', () => {
    const { fixture, icon } = render();
    expect(icon().querySelector('svg')).not.toBeNull();
    expect(icon().style.getPropertyValue('--icon-size')).toBe('');

    fixture.componentInstance.size.set('2rem');
    fixture.detectChanges();
    expect(icon().style.getPropertyValue('--icon-size')).toBe('2rem');
  });

  it.each(Object.keys(ICONS) as IconName[])('renders the "%s" icon with shapes inside', (name) => {
    const { fixture, icon } = render();
    fixture.componentInstance.name.set(name);
    fixture.detectChanges();

    expect(icon().querySelector('svg')?.children.length).toBeGreaterThan(0);
  });

  it('rejects an unknown icon name at compile time', () => {
    // tsconfig.spec.json includes *.spec.ts and the test build type-checks it, so this line fails the build if
    // IconName ever widens to string (an unused directive is itself an error).
    // @ts-expect-error "not-an-icon" is not a key of ICONS
    const unknown: IconName = 'not-an-icon';

    expect(unknown in ICONS).toBe(false);
  });
});
