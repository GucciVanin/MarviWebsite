import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { fakeToken } from '../../core/auth/testing/fake-token';
import { Home } from './home';

describe('Home', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), provideHttpClient()],
    });
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('invites a visitor to create an account', () => {
    expect(render().querySelector('a[href="/register"]')).not.toBeNull();
  });

  it('does not offer registration to a signed-in user', () => {
    localStorage.setItem('marvi_auth_token', fakeToken('Client'));
    const element = render();
    expect(element.querySelector('a[href="/register"]')).toBeNull();
    expect(element.querySelector('a[href="/storefront"]')).not.toBeNull();
  });
});
