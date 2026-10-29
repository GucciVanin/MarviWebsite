import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContactMessagesService } from './contact-messages.service';

describe('ContactMessagesService', () => {
  it('marks a message handled with a POST to its handle endpoint', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let done = false;

    TestBed.inject(ContactMessagesService).handle('m1').subscribe(() => (done = true));
    const request = http.expectOne('/api/admin/contact-messages/m1/handle');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(done).toBe(true);
    http.verify();
  });
});
