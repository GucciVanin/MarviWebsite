import { Component, OnInit, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { loadable } from '../../../core/http/loadable';
import { confirmedDelete, formFeedback } from '../../../shared/crud/admin-crud';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, CoverageArea, CoverageAreaType, ProductAdmin, StockRecord, Warehouse } from '../api/admin.service';

function isJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-admin-operations',
  imports: [FormsModule, ErrorAlert, LoadState],
  templateUrl: './admin-operations.html',
})
export class AdminOperations implements OnInit {
  protected readonly t = PT.adminOperations;
  private readonly admin = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly warehouses = loadable(() => this.admin.getWarehouses(), [] as Warehouse[]);
  protected readonly areas = loadable(() => this.admin.getCoverageAreas(), [] as CoverageArea[]);
  protected readonly stock = loadable(() => this.admin.getStock(), [] as StockRecord[]);
  protected readonly products = loadable(() => this.admin.getProducts(), [] as ProductAdmin[]);

  // ---- warehouse form
  protected readonly editingWarehouseId = signal<string | null>(null);
  protected readonly warehouseName = signal('');
  protected readonly warehouseAddress = signal('');
  protected readonly warehouseLat = signal<number | string | null>(null);
  protected readonly warehouseLng = signal<number | string | null>(null);
  protected readonly warehouseForm = formFeedback();
  protected readonly warehouseDelete = confirmedDelete();

  // ---- coverage area form
  protected readonly editingAreaId = signal<string | null>(null);
  protected readonly areaWarehouse = signal('');
  protected readonly areaType = signal<CoverageAreaType>('Radius');
  protected readonly areaRadius = signal<number | string | null>(null);
  protected readonly areaPolygon = signal('');
  protected readonly areaForm = formFeedback();
  protected readonly areaDelete = confirmedDelete();

  // ---- stock form
  protected readonly editingStock = signal(false);
  protected readonly stockProduct = signal('');
  protected readonly stockWarehouse = signal('');
  protected readonly stockOnHand = signal<number | string | null>(null);
  protected readonly stockReorder = signal<number | string | null>(null);
  protected readonly stockForm = formFeedback();

  ngOnInit(): void {
    this.warehouses.load();
    this.areas.load();
    this.stock.load();
    this.products.load();
  }

  warehouseNameOf(id: string): string {
    return this.warehouses.data().find((w) => w.id === id)?.name ?? id;
  }

  // ---- warehouses

  editWarehouse(warehouse: Warehouse): void {
    this.warehouseForm.clear();
    this.editingWarehouseId.set(warehouse.id);
    this.warehouseName.set(warehouse.name);
    this.warehouseAddress.set(warehouse.address);
    this.warehouseLat.set(warehouse.latitude);
    this.warehouseLng.set(warehouse.longitude);
  }

  resetWarehouseForm(): void {
    this.editingWarehouseId.set(null);
    this.warehouseName.set('');
    this.warehouseAddress.set('');
    this.warehouseLat.set(null);
    this.warehouseLng.set(null);
    this.warehouseForm.problem.set(null);
  }

  saveWarehouse(): void {
    this.warehouseForm.clear();
    const name = this.warehouseName().trim();
    const address = this.warehouseAddress().trim();
    if (!name || !address) {
      this.warehouseForm.refuse(this.t.warehouseRequired);
      return;
    }
    const latitude = Number(this.warehouseLat());
    const longitude = Number(this.warehouseLng());
    if (this.warehouseLat() === null || this.warehouseLat() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      this.warehouseForm.refuse(this.t.latitudeInvalid);
      return;
    }
    if (this.warehouseLng() === null || this.warehouseLng() === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      this.warehouseForm.refuse(this.t.longitudeInvalid);
      return;
    }
    const request = { name, address, latitude, longitude };
    const id = this.editingWarehouseId();
    const call: Observable<unknown> = id ? this.admin.updateWarehouse(id, request) : this.admin.createWarehouse(request);
    this.warehouseForm.send(call, () => {
      this.resetWarehouseForm();
      this.warehouses.load();
    });
  }

  deleteWarehouse(id: string): void {
    this.warehouseDelete.run(this.admin.deleteWarehouse(id), () => {
      this.warehouses.load();
      this.areas.load(); // a warehouse's coverage areas go with it
      this.stock.load();
    });
  }

  // ---- coverage areas

  editArea(area: CoverageArea): void {
    this.areaForm.clear();
    this.editingAreaId.set(area.id);
    this.areaWarehouse.set(area.warehouseId);
    this.areaType.set(area.type);
    this.areaRadius.set(area.radiusMiles);
    this.areaPolygon.set(area.polygonGeoJson ?? '');
  }

  resetAreaForm(): void {
    this.editingAreaId.set(null);
    this.areaWarehouse.set('');
    this.areaType.set('Radius');
    this.areaRadius.set(null);
    this.areaPolygon.set('');
    this.areaForm.problem.set(null);
  }

  saveArea(): void {
    this.areaForm.clear();
    if (!this.areaWarehouse()) {
      this.areaForm.refuse(this.t.warehouseChoose);
      return;
    }
    let radiusMiles: number | null = null;
    let polygonGeoJson: string | null = null;
    if (this.areaType() === 'Radius') {
      const radius = this.areaRadius() === null || this.areaRadius() === '' ? NaN : Number(this.areaRadius());
      if (!Number.isFinite(radius) || radius <= 0) {
        this.areaForm.refuse(this.t.radiusInvalid);
        return;
      }
      if (radius > 20000) {
        this.areaForm.refuse(this.t.radiusTooBig);
        return;
      }
      radiusMiles = radius;
    } else {
      const polygon = this.areaPolygon().trim();
      if (!isJsonObject(polygon)) {
        this.areaForm.refuse(this.t.polygonInvalid);
        return;
      }
      polygonGeoJson = polygon;
    }
    const request = { warehouseId: this.areaWarehouse(), type: this.areaType(), radiusMiles, polygonGeoJson };
    const id = this.editingAreaId();
    const call: Observable<unknown> = id ? this.admin.updateCoverageArea(id, request) : this.admin.createCoverageArea(request);
    this.areaForm.send(call, () => {
      this.resetAreaForm();
      this.areas.load();
    });
  }

  deleteArea(id: string): void {
    this.areaDelete.run(this.admin.deleteCoverageArea(id), () => this.areas.load());
  }

  // ---- stock

  editStock(record: StockRecord): void {
    this.stockForm.clear();
    this.editingStock.set(true);
    this.stockProduct.set(record.productId);
    this.stockWarehouse.set(record.warehouseId);
    this.stockOnHand.set(record.qtyOnHand);
    this.stockReorder.set(record.reorderPoint);
  }

  resetStockForm(): void {
    this.editingStock.set(false);
    this.stockProduct.set('');
    this.stockWarehouse.set('');
    this.stockOnHand.set(null);
    this.stockReorder.set(null);
    this.stockForm.problem.set(null);
  }

  saveStock(): void {
    this.stockForm.clear();
    if (!this.stockProduct() || !this.stockWarehouse()) {
      this.stockForm.refuse(this.t.stockChoose);
      return;
    }
    const empty = (value: number | string | null) => value === null || value === '';
    const qtyOnHand = empty(this.stockOnHand()) ? NaN : Number(this.stockOnHand());
    const reorderPoint = empty(this.stockReorder()) ? 0 : Number(this.stockReorder());
    if (!Number.isInteger(qtyOnHand) || qtyOnHand < 0 || !Number.isInteger(reorderPoint) || reorderPoint < 0) {
      this.stockForm.refuse(this.t.stockInvalid);
      return;
    }
    this.stockForm.send(
      this.admin.upsertStock({ productId: this.stockProduct(), warehouseId: this.stockWarehouse(), qtyOnHand, reorderPoint }),
      () => {
        this.resetStockForm();
        this.stock.load();
      },
    );
  }
}
