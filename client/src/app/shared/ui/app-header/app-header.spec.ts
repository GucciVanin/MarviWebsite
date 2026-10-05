import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { fakeToken } from '../../../core/auth/testing/fake-token';
import { AppHeader } from './app-header';

describe('AppHeader', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers login and registration when signed out', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('Entrar');
    expect(text).toContain('Cadastrar');
    expect(text).not.toContain('Sair');
  });

  it('shows the role area and logout when signed in', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Admin'));
    const element = render();
    const text = element.textContent ?? '';
    expect(text).toContain('Administração');
    expect(text).toContain('Sair');
    expect(text).not.toContain('Cadastrar');
    expect(element.querySelector('a[href="/admin"]')).not.toBeNull();
  });

  it('toggles the mobile menu and reflects it in aria-expanded', () => {
    TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.header__toggle')!;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.header__nav--open')).not.toBeNull();
  });
});
