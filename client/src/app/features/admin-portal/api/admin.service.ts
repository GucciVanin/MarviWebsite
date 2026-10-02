import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CreateEmployeeRequest {
  email: string;
  password: string;
  employeeCode: string;
  department: string | null;
  hireDate: string;
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

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: string;
  entityName: string;
  entityId: string;
  timestamp: string;
  details: Record<string, string>;
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

  suspendClient(id: string): Observable<void> {
    return this.http.put<void>(`/api/admin/clients/${id}/suspend`, {});
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

  getAuditLog(page = 1, pageSize = 50): Observable<AuditLogEntry[]> {
    return this.http.get<AuditLogEntry[]>('/api/admin/audit-log', { params: { page, pageSize } });
  }
}
