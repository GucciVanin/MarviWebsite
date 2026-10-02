import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  attributes: Record<string, string>;
  price: number;
  dealName: string | null;
  inStock: boolean;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  attributes: Record<string, string>;
  price: number;
  dealName: string | null;
  inStock: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);

  getProducts(category?: string, search?: string): Observable<ProductListItem[]> {
    const params: Record<string, string> = {};
    if (category) {
      params['category'] = category;
    }
    if (search) {
      params['search'] = search;
    }
    return this.http.get<ProductListItem[]>('/api/products', { params });
  }

  getProduct(id: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`/api/products/${id}`);
  }
}
