import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminImport } from './admin-import';

const report = (over: object = {}) => ({ dryRun: false, applied: true, rows: 3, created: 2, updated: 1, errors: [], ...over });
const warehouses = [
  { id: 'w1', name: 'CD São Paulo', address: 'x', latitude: 0, longitude: 0 },
  { id: 'w2', name: 'CD Rio', address: 'y', latitude: 0, longitude: 0 },
];

describe('AdminImport', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [AdminImport], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminImport);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/warehouses').flush(warehouses);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const chooseFile = async (name = 'produtos.csv', content = 'sku,name\nA,Alpha\n') => {
      const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'text/csv' })], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
    };
    const importRequest = (query = '') => http.expectOne((r) => r.url === '/api/admin/products/import' && r.params.toString() === query);
    return { fixture, http, root, settle, button, chooseFile, importRequest };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('offers nothing to run until a file is chosen', async () => {
    const { root, settle, button } = setup();
    await settle();

    expect(button('Verificar arquivo').disabled).toBe(true);
    expect(button('Importar').disabled).toBe(true);
    expect(text(root)).toContain('sku');
  });

  it('checks the file first without changing anything, and says what would happen', async () => {
    const { fixture, root, settle, button, chooseFile, importRequest } = setup();
    await settle();
    await chooseFile();

    button('Verificar arquivo').click();
    fixture.detectChanges();
    const request = importRequest('dryRun=true');
    expect(request.request.method).toBe('POST');
    const file = (request.request.body as FormData).get('file') as File;
    expect(file.name).toBe('produtos.csv');
    request.flush(report({ dryRun: true, applied: false }));
    await settle();

    expect(text(root)).toContain('Nada foi alterado');
    expect(text(root)).toContain('2 serão criados');
    expect(text(root)).toContain('1 será atualizado');
  });

  it('imports the file and says what was done', async () => {
    const { fixture, root, settle, button, chooseFile, importRequest } = setup();
    await settle();
    await chooseFile();

    button('Importar').click();
    fixture.detectChanges();
    importRequest('').flush(report());
    await settle();

    expect(text(root)).toContain('Importação concluída');
    expect(text(root)).toContain('2 criados');
    expect(text(root)).toContain('1 atualizado');
  });

  it('sends the chosen warehouse for the stock column', async () => {
    const { fixture, root, settle, button, chooseFile, importRequest } = setup();
    await settle();
    await chooseFile();
    const select = root.querySelector<HTMLSelectElement>('select[name="warehouse"]')!;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['Automático (se houver um só depósito)', 'CD São Paulo', 'CD Rio']);
    select.value = 'w2';
    select.dispatchEvent(new Event('change'));
    await settle();

    button('Importar').click();
    fixture.detectChanges();

    importRequest('warehouseId=w2').flush(report());
  });

  it('lists every problem with its line when the file is refused, and says nothing was imported', async () => {
    const { fixture, root, settle, button, chooseFile, importRequest } = setup();
    await settle();
    await chooseFile();

    button('Importar').click();
    fixture.detectChanges();
    importRequest('').flush(
      report({ applied: false, rows: 0, created: 0, updated: 0, errors: [{ line: 1, message: "Unknown column 'prce'." }, { line: 3, message: 'name is required.' }] }),
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(text(root)).toContain('Nada foi importado');
    const rows = Array.from(root.querySelectorAll('[data-testid="import-error"]')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(["Linha 1 Unknown column 'prce'.", 'Linha 3 name is required.']);
    expect(text(root)).not.toContain('Importação concluída');
  });

  it('shows any other failure as an error in pt-BR, not as a report', async () => {
    const { fixture, root, settle, button, chooseFile, importRequest } = setup();
    await settle();
    await chooseFile();

    button('Importar').click();
    fixture.detectChanges();
    importRequest('').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.querySelector('[data-testid="import-error"]')).toBeNull();
  });

  it('forgets the previous report when another file is chosen', async () => {
    const { fixture, root, settle, button, chooseFile, importRequest } = setup();
    await settle();
    await chooseFile();
    button('Importar').click();
    fixture.detectChanges();
    importRequest('').flush(report());
    await settle();
    expect(text(root)).toContain('Importação concluída');

    await chooseFile('outro.csv');

    expect(text(root)).not.toContain('Importação concluída');
  });
});
