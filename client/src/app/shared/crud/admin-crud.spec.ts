import { Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { confirmedDelete, formFeedback } from './admin-crud';

describe('formFeedback', () => {
  it('starts with nothing to say', () => {
    const form = formFeedback();

    expect(form.problem()).toBeNull();
    expect(form.saved()).toBe(false);
    expect(form.action.busy()).toBe(false);
    expect(form.action.error()).toBeNull();
  });

  it('refuses with a problem the admin can fix, and clear() takes the notices away', () => {
    const form = formFeedback();
    form.saved.set(true);

    form.refuse('Nome obrigatório');
    expect(form.problem()).toBe('Nome obrigatório');

    form.clear();
    expect(form.problem()).toBeNull();
    expect(form.saved()).toBe(false);
  });

  it('on success runs the follow-up and shows the "saved" notice', () => {
    const form = formFeedback();
    const followUp = vi.fn();

    form.send(of('ok'), followUp);

    expect(followUp).toHaveBeenCalledTimes(1);
    expect(form.saved()).toBe(true);
    expect(form.action.busy()).toBe(false);
  });

  it('on failure shows the error, runs nothing and does not say "saved"', () => {
    const form = formFeedback();
    const followUp = vi.fn();

    form.send(throwError(() => new HttpErrorResponse({ status: 409, error: 'Duplicate SKU' })), followUp);

    expect(followUp).not.toHaveBeenCalled();
    expect(form.saved()).toBe(false);
    expect(form.action.error()?.status).toBe(409);
  });

  it('is busy while the request is in flight', () => {
    const form = formFeedback();
    const pending = new Subject<string>();

    form.send(pending, () => undefined);
    expect(form.action.busy()).toBe(true);

    pending.next('done');
    expect(form.action.busy()).toBe(false);
  });

  it('a new attempt starts by forgetting the last "saved" notice', () => {
    const form = formFeedback();
    form.send(of('ok'), () => undefined);
    expect(form.saved()).toBe(true);

    form.send(new Subject<string>(), () => undefined);

    expect(form.saved()).toBe(false);
  });
});

describe('confirmedDelete', () => {
  it('asks first: nothing is sent until the confirming click', () => {
    const remove = confirmedDelete();
    const afterDelete = vi.fn();

    remove.ask('c1');

    expect(remove.confirming()).toBe('c1');
    expect(afterDelete).not.toHaveBeenCalled();
  });

  it('runs the delete, forgets the question and runs the follow-up on success', () => {
    const remove = confirmedDelete();
    const afterDelete = vi.fn();
    remove.ask('c1');

    remove.run(of(null), afterDelete);

    expect(remove.confirming()).toBeNull();
    expect(afterDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the refusal to show when the delete fails, and does not run the follow-up', () => {
    const remove = confirmedDelete();
    const afterDelete = vi.fn();
    remove.ask('c1');

    remove.run(throwError(() => new HttpErrorResponse({ status: 409, error: 'In use' })), afterDelete);

    expect(afterDelete).not.toHaveBeenCalled();
    expect(remove.action.error()?.status).toBe(409);
    expect(remove.confirming()).toBeNull();
  });

  it('can be cancelled', () => {
    const remove = confirmedDelete();
    remove.ask('c1');

    remove.cancel();

    expect(remove.confirming()).toBeNull();
  });
});
