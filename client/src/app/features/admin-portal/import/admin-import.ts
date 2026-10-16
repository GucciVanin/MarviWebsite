import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, ProductImportReport, Warehouse } from '../api/admin.service';

/**
 * The product CSV import for admins (MRV-2.4b.5). "Verificar arquivo" is a dry run: it reports what would be created and
 * updated and changes nothing. "Importar" stores a valid file; a file with any problem imports nothing and every problem is
 * listed with its line, so the admin fixes the file and tries again.
 */
@Component({
  selector: 'app-admin-import',
  imports: [FormsModule, ErrorAlert, LoadState],
  templateUrl: './admin-import.html',
})
export class AdminImport implements OnInit {
  protected readonly t = PT.adminImport;
  private readonly admin = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly warehouses = loadable(() => this.admin.getWarehouses(), [] as Warehouse[]);
  protected readonly file = signal<File | null>(null);
  protected readonly warehouseId = signal('');
  protected readonly report = signal<ProductImportReport | null>(null);
  protected readonly runAction = action();

  protected readonly canRun = computed(() => this.file() !== null && !this.runAction.busy());
  protected readonly hasProblems = computed(() => (this.report()?.errors.length ?? 0) > 0);

  ngOnInit(): void {
    this.warehouses.load();
  }

  protected chooseFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.report.set(null);
  }

  protected run(dryRun: boolean): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.report.set(null);
    this.runAction.run(this.admin.importProducts(file, dryRun, this.warehouseId()), (result) => this.report.set(result));
  }

  /** "1 será criado" / "2 serão criados": the count with the right form of the word. */
  protected count(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
  }
}
