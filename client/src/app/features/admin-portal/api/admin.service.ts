import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import type { ClientSummary } from '../../../shared/models/client-summary.model';
import type { PagedResult } from '../../../shared/models/paged.model';

export interface CreateEmployeeRequest {
  email: string;
  password: string;
  employeeCode: string;
  department: string | null;
  hireDate: string;
}

/** One problem in an import file. Line 1 is the header; a row's line is where it starts in the file. */
export interface ProductImportError {
  line: number;
  message: string;
}

/** What an import did, or would do (`dryRun`). `applied` is false for a dry run and for a file with errors, which imports nothing. */
export interface ProductImportReport {
  dryRun: boolean;
  applied: boolean;
  rows: number;
  created: number;
  updated: number;
  errors: ProductImportError[];
}

export interface UpdateClientCreditRequest {
  pricingTierId: string;
  creditLimit: number;
}

export interface ApproveClientRequest {
  pricingTierId: string;
  creditLimit: number;
}

export interface ProductAdmin {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  attributes: Record<string, string>;
}

export interface UpsertProductRequest {
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  attributes: Record<string, string>;
}

export interface CategoryAdmin {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface UpsertCategoryRequest {
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PricingTier {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface UpsertPricingTierRequest {
  name: string;
  isDefault: boolean;
}

export interface ProductPrice {
  pricingTierId: string;
  pricingTierName: string;
  unitPrice: number;
  minQty: number;
}

export interface UpsertProductPriceRequest {
  pricingTierId: string;
  unitPrice: number;
  minQty: number;
}

export type DiscountType = 'Percent' | 'Fixed';

export interface DealAdmin {
  id: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  productIds: string[];
  categoryIds: string[];
  minQty: number;
}

export interface UpsertDealRequest {
  name: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  productIds: string[];
  categoryIds: string[];
  minQty: number;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface UpsertWarehouseRequest {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export type CoverageAreaType = 'Radius' | 'Polygon';

export interface CoverageArea {
  id: string;
  warehouseId: string;
  type: CoverageAreaType;
  radiusMiles: number | null;
  polygonGeoJson: string | null;
}

export interface UpsertCoverageAreaRequest {
  warehouseId: string;
  type: CoverageAreaType;
  radiusMiles: number | null;
  polygonGeoJson: string | null;
}

export interface StockRecord {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  qtyOnHand: number;
  qtyReserved: number;
  reorderPoint: number;
}

export interface UpsertStockRequest {
  productId: string;
  warehouseId: string;
  qtyOnHand: number;
  reorderPoint: number;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: string;
  entityName: string;
  entityId: string;
  timestamp: string;
  details: Record<string, string>;
}

/** One page of the audit log and the size of the whole log (the API reports it in the `X-Total-Count` header). */
export interface AuditPage {
  entries: AuditLogEntry[];
  totalCount: number;
  /** The page these entries are (as asked for). */
  page: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  createEmployee(request: CreateEmployeeRequest): Observable<{ id: string }> {
    return this.http.post<{ id: string }>('/api/admin/employees', request);
  }

  approveClient(id: string, request: ApproveClientRequest): Observable<void> {
    return this.http.put<void>(`/api/admin/clients/${id}/approve`, request);
  }

  updateClientCredit(id: string, request: UpdateClientCreditRequest): Observable<void> {
    return this.http.put<void>(`/api/admin/clients/${id}/update-credit`, request);
  }

  /** The customer directory (`GET /api/employee/clients`, which admins may use too), one page. */
  searchClients(search: string, pageSize: number): Observable<PagedResult<ClientSummary>> {
    return this.http.get<PagedResult<ClientSummary>>('/api/employee/clients', { params: { search, pageSize } });
  }

  /**
   * Imports (or, with `dryRun`, only checks) a product CSV. A file with problems comes back as a 400 whose body is the report;
   * that is a result to show, not a failure, so it is returned as the report. Any other failure stays an error.
   */
  importProducts(file: File, dryRun: boolean, warehouseId: string): Observable<ProductImportReport> {
    const body = new FormData();
    body.append('file', file, file.name);
    const params: Record<string, string> = {};
    if (dryRun) {
      params['dryRun'] = 'true';
    }
    if (warehouseId) {
      params['warehouseId'] = warehouseId;
    }
    return this.http.post<ProductImportReport>('/api/admin/products/import', body, { params }).pipe(
      catchError((failure: unknown) =>
        failure instanceof HttpErrorResponse && failure.status === 400 && Array.isArray(failure.error?.errors)
          ? of(failure.error as ProductImportReport)
          : throwError(() => failure),
      ),
    );
  }

  suspendClient(id: string): Observable<void> {
    return this.http.put<void>(`/api/admin/clients/${id}/suspend`, {});
  }

  getCategories(): Observable<CategoryAdmin[]> {
    return this.http.get<CategoryAdmin[]>('/api/admin/categories');
  }

  createCategory(request: UpsertCategoryRequest): Observable<CategoryAdmin> {
    return this.http.post<CategoryAdmin>('/api/admin/categories', request);
  }

  updateCategory(id: string, request: UpsertCategoryRequest): Observable<CategoryAdmin> {
    return this.http.put<CategoryAdmin>(`/api/admin/categories/${id}`, request);
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/categories/${id}`);
  }

  getPricingTiers(): Observable<PricingTier[]> {
    return this.http.get<PricingTier[]>('/api/admin/pricing-tiers');
  }

  createPricingTier(request: UpsertPricingTierRequest): Observable<PricingTier> {
    return this.http.post<PricingTier>('/api/admin/pricing-tiers', request);
  }

  updatePricingTier(id: string, request: UpsertPricingTierRequest): Observable<PricingTier> {
    return this.http.put<PricingTier>(`/api/admin/pricing-tiers/${id}`, request);
  }

  getProductPrices(productId: string): Observable<ProductPrice[]> {
    return this.http.get<ProductPrice[]>(`/api/admin/products/${productId}/pricing`);
  }

  upsertProductPrice(productId: string, request: UpsertProductPriceRequest): Observable<ProductPrice> {
    return this.http.put<ProductPrice>(`/api/admin/products/${productId}/pricing`, request);
  }

  deleteProductPrice(productId: string, pricingTierId: string, minQty: number): Observable<void> {
    return this.http.delete<void>(`/api/admin/products/${productId}/pricing/${pricingTierId}/${minQty}`);
  }

  getProducts(): Observable<ProductAdmin[]> {
    return this.http.get<ProductAdmin[]>('/api/admin/products');
  }

  getProduct(id: string): Observable<ProductAdmin> {
    return this.http.get<ProductAdmin>(`/api/admin/products/${id}`);
  }

  createProduct(request: UpsertProductRequest): Observable<ProductAdmin> {
    return this.http.post<ProductAdmin>('/api/admin/products', request);
  }

  updateProduct(id: string, request: UpsertProductRequest): Observable<void> {
    return this.http.put<void>(`/api/admin/products/${id}`, request);
  }

  deleteProduct(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/products/${id}`);
  }

  getDeals(): Observable<DealAdmin[]> {
    return this.http.get<DealAdmin[]>('/api/admin/deals');
  }

  getDeal(id: string): Observable<DealAdmin> {
    return this.http.get<DealAdmin>(`/api/admin/deals/${id}`);
  }

  createDeal(request: UpsertDealRequest): Observable<DealAdmin> {
    return this.http.post<DealAdmin>('/api/admin/deals', request);
  }

  updateDeal(id: string, request: UpsertDealRequest): Observable<void> {
    return this.http.put<void>(`/api/admin/deals/${id}`, request);
  }

  deleteDeal(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/deals/${id}`);
  }

  getWarehouses(): Observable<Warehouse[]> {
    return this.http.get<Warehouse[]>('/api/admin/warehouses');
  }

  getWarehouse(id: string): Observable<Warehouse> {
    return this.http.get<Warehouse>(`/api/admin/warehouses/${id}`);
  }

  createWarehouse(request: UpsertWarehouseRequest): Observable<Warehouse> {
    return this.http.post<Warehouse>('/api/admin/warehouses', request);
  }

  updateWarehouse(id: string, request: UpsertWarehouseRequest): Observable<void> {
    return this.http.put<void>(`/api/admin/warehouses/${id}`, request);
  }

  deleteWarehouse(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/warehouses/${id}`);
  }

  getCoverageAreas(): Observable<CoverageArea[]> {
    return this.http.get<CoverageArea[]>('/api/admin/coverage-areas');
  }

  getCoverageArea(id: string): Observable<CoverageArea> {
    return this.http.get<CoverageArea>(`/api/admin/coverage-areas/${id}`);
  }

  createCoverageArea(request: UpsertCoverageAreaRequest): Observable<CoverageArea> {
    return this.http.post<CoverageArea>('/api/admin/coverage-areas', request);
  }

  updateCoverageArea(id: string, request: UpsertCoverageAreaRequest): Observable<void> {
    return this.http.put<void>(`/api/admin/coverage-areas/${id}`, request);
  }

  deleteCoverageArea(id: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/coverage-areas/${id}`);
  }

  // Admins may read the stock list through the employee endpoint (it allows Employee and Admin).
  getStock(): Observable<StockRecord[]> {
    return this.http.get<StockRecord[]>('/api/employee/inventory');
  }

  upsertStock(request: UpsertStockRequest): Observable<StockRecord> {
    return this.http.put<StockRecord>('/api/admin/inventory', request);
  }

  getAuditPage(page: number, pageSize: number): Observable<AuditPage> {
    return this.http.get<AuditLogEntry[]>('/api/admin/audit-log', { params: { page, pageSize }, observe: 'response' }).pipe(
      map((response) => {
        const entries = response.body ?? [];
        const header = response.headers.get('X-Total-Count');
        const reported = header === null ? NaN : Number(header);
        // Without the header (a proxy that strips it) the size is unknown: a full page means there may be more, so offer the next one.
        const total = Number.isFinite(reported) && reported >= 0 ? reported : (page - 1) * pageSize + entries.length + (entries.length >= pageSize ? 1 : 0);
        return { entries, totalCount: total, page };
      }),
    );
  }

  getAuditLog(page = 1, pageSize = 50): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>('/api/admin/audit-log', { params: { page, pageSize } });
  }
}
