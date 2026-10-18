// Thin apiFetch wrappers — same pattern as fxRatesApi.ts. Mirrors
// revenact-backend's /api/v1/products/ — see docs/API_CONTRACTS.md's
// `customers` section, "Models — Product".
//
// The catalogue behind Customer.primary_product, which was free text until
// backend migration 0030. Reads are open to every member (the pickers need
// the list); writes need manage_org_settings.
import { apiFetch } from '../../lib/apiClient';

export interface Product {
  id: number;
  name: string;
  /** False retires a product from the pickers without touching the
   *  customers already on it, so last year's figures still say what they
   *  said. */
  is_active: boolean;
  /** Customers recorded against this product — also the answer to "may I
   *  delete it?": the backend refuses while this is above zero. */
  customers: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWritePayload {
  name?: string;
  is_active?: boolean;
}

// Unpaginated (see ProductListView's own docstring) — a plain array.
export function fetchProducts(): Promise<Product[]> {
  return apiFetch<Product[]>('/products/');
}

export function createProduct(payload: { name: string }): Promise<Product> {
  return apiFetch<Product>('/products/', { method: 'POST', body: payload });
}

export function updateProduct(id: number, payload: ProductWritePayload): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/`, { method: 'PATCH', body: payload });
}

export function deleteProduct(id: number): Promise<null> {
  return apiFetch<null>(`/products/${id}/`, { method: 'DELETE' });
}
