import { Component, OnInit, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
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
  protected readonly warehouseProblem = signal<string | null>(null);
  protected readonly warehouseSaved = signal(false);
  protected readonly warehouseAction = action();
  protected readonly warehouseDeleteAction = action();
  protected readonly confirmingWarehouseId = signal<string | null>(null);

  // ---- coverage area form
  protected readonly editingAreaId = signal<string | null>(null);
  protected readonly areaWarehouse = signal('');
  protected readonly areaType = signal<CoverageAreaType>('Radius');
  protected readonly areaRadius = signal<number | string | null>(null);
  protected readonly areaPolygon = signal('');
  protected readonly areaProblem = signal<string | null>(null);
  protected readonly areaSaved = signal(false);
  protected readonly areaAction = action();
  protected readonly areaDeleteAction = action();
  protected readonly confirmingAreaId = signal<string | null>(null);

  // ---- stock form
  protected readonly editingStock = signal(false);
  protected readonly stockProduct = signal('');
  protected readonly stockWarehouse = signal('');
  protected readonly stockOnHand = signal<number | string | null>(null);
  protected readonly stockReorder = signal<number | string | null>(null);
  protected readonly stockProblem = signal<string | null>(null);
  protected readonly stockSaved = signal(false);
  protected readonly stockAction = action();

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
    this.warehouseSaved.set(false);
    this.warehouseProblem.set(null);
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
    this.warehouseProblem.set(null);
  }

  saveWarehouse(): void {
    this.warehouseSaved.set(false);
    this.warehouseProblem.set(null);
    const name = this.warehouseName().trim();
    const address = this.warehouseAddress().trim();
    if (!name || !address) {
      this.warehouseProblem.set(this.t.warehouseRequired);
      return;
    }
    const latitude = Number(this.warehouseLat());
    const longitude = Number(this.warehouseLng());
    if (this.warehouseLat() === null || this.warehouseLat() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      this.warehouseProblem.set(this.t.latitudeInvalid);
      return;
    }
    if (this.warehouseLng() === null || this.warehouseLng() === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      this.warehouseProblem.set(this.t.longitudeInvalid);
      return;
    }
    const request = { name, address, latitude, longitude };
    const id = this.editingWarehouseId();
    const call: Observable<unknown> = id ? this.admin.updateWarehouse(id, request) : this.admin.createWarehouse(request);
    this.warehouseAction.run(call, () => {
      this.resetWarehouseForm();
      this.warehouseSaved.set(true);
      this.warehouses.load();
    });
  }

  deleteWarehouse(id: string): void {
    this.confirmingWarehouseId.set(null);
    this.warehouseDeleteAction.run(this.admin.deleteWarehouse(id), () => {
      this.warehouses.load();
      this.areas.load(); // a warehouse's coverage areas go with it
      this.stock.load();
    });
  }

  // ---- coverage areas

  editArea(area: CoverageArea): void {
    this.areaSaved.set(false);
    this.areaProblem.set(null);
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
    this.areaProblem.set(null);
  }

  saveArea(): void {
    this.areaSaved.set(false);
    this.areaProblem.set(null);
    if (!this.areaWarehouse()) {
      this.areaProblem.set(this.t.warehouseChoose);
      return;
    }
    let radiusMiles: number | null = null;
    let polygonGeoJson: string | null = null;
    if (this.areaType() === 'Radius') {
      const radius = this.areaRadius() === null || this.areaRadius() === '' ? NaN : Number(this.areaRadius());
      if (!Number.isFinite(radius) || radius <= 0) {
        this.areaProblem.set(this.t.radiusInvalid);
        return;
      }
      if (radius > 20000) {
        this.areaProblem.set(this.t.radiusTooBig);
        return;
      }
      radiusMiles = radius;
    } else {
      const polygon = this.areaPolygon().trim();
      if (!isJsonObject(polygon)) {
        this.areaProblem.set(this.t.polygonInvalid);
        return;
      }
      polygonGeoJson = polygon;
    }
    const request = { warehouseId: this.areaWarehouse(), type: this.areaType(), radiusMiles, polygonGeoJson };
    const id = this.editingAreaId();
    const call: Observable<unknown> = id ? this.admin.updateCoverageArea(id, request) : this.admin.createCoverageArea(request);
    this.areaAction.run(call, () => {
      this.resetAreaForm();
      this.areaSaved.set(true);
      this.areas.load();
    });
  }

  deleteArea(id: string): void {
    this.confirmingAreaId.set(null);
    this.areaDeleteAction.run(this.admin.deleteCoverageArea(id), () => this.areas.load());
  }

  // ---- stock

  editStock(record: StockRecord): void {
    this.stockSaved.set(false);
    this.stockProblem.set(null);
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
    this.stockProblem.set(null);
  }

  saveStock(): void {
    this.stockSaved.set(false);
    this.stockProblem.set(null);
    if (!this.stockProduct() || !this.stockWarehouse()) {
      this.stockProblem.set(this.t.stockChoose);
      return;
    }
    const empty = (value: number | string | null) => value === null || value === '';
    const qtyOnHand = empty(this.stockOnHand()) ? NaN : Number(this.stockOnHand());
    const reorderPoint = empty(this.stockReorder()) ? 0 : Number(this.stockReorder());
    if (!Number.isInteger(qtyOnHand) || qtyOnHand < 0 || !Number.isInteger(reorderPoint) || reorderPoint < 0) {
      this.stockProblem.set(this.t.stockInvalid);
      return;
    }
    this.stockAction.run(
      this.admin.upsertStock({ productId: this.stockProduct(), warehouseId: this.stockWarehouse(), qtyOnHand, reorderPoint }),
      () => {
        this.resetStockForm();
        this.stockSaved.set(true);
        this.stock.load();
      },
    );
  }
}
