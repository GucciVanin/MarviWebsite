import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { provideAnchorScrolling } from './core/motion/anchor-scroll';
import { VIEW_TRANSITION_OPTIONS } from './core/motion/view-transition';
import { PageTitleStrategy } from './core/seo/page-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // Cross-fade between pages (MRV-7.3); skipped for the first load and under reduced motion. A no-op without the API.
      withViewTransitions(VIEW_TRANSITION_OPTIONS),
    ),
    provideAnchorScrolling(),
    { provide: TitleStrategy, useExisting: PageTitleStrategy },
    provideHttpClient(withInterceptors([jwtInterceptor])),
  ],
};
