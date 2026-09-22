import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Producto,
  CrearProductoPayload,
  ActualizarProductoPayload,
  ProductoListItem,
  ProductoSelectorItem,
  PaginatedResponse,
  ProductoSearchParams,
} from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class ApiProductosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/productos`;

  listar(): Observable<Producto[]> {
    return this.http.get<Producto[]>(this.base);
  }

  /**
   * Lista liviana para alimentar dropdowns (selector de producto en
   * "Registrar Movimiento"). Excluye imagen, atributos y productos
   * eliminados. When `q` is provided, filtering happens server-side before
   * applying the limit so matches beyond the initial selector page are found.
   */
  selector(q?: string, limit = 200): Observable<ProductoSelectorItem[]> {
    let p = new HttpParams().set('limit', String(limit));
    if (q?.trim()) p = p.set('q', q.trim());
    return this.http.get<ProductoSelectorItem[]>(`${this.base}/selector`, { params: p });
  }

  buscar(params: ProductoSearchParams): Observable<PaginatedResponse<ProductoListItem>> {
    let p = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('size', String(params.size ?? 20));
    if (params.q?.trim())             p = p.set('q', params.q.trim());
    // marcaId / categoriaId pueden ser number o el sentinel "null" (string)
    // que el backend interpreta como filtro por NULL.
    if (params.marcaId === 'null')     p = p.set('marcaId', 'null');
    else if (typeof params.marcaId === 'number') p = p.set('marcaId', String(params.marcaId));
    if (params.categoriaId === 'null') p = p.set('categoriaId', 'null');
    else if (typeof params.categoriaId === 'number') p = p.set('categoriaId', String(params.categoriaId));
    if (params.atributos?.length) {
      const serialized = JSON.stringify(params.atributos);
      p = p.set('atributos', serialized);
    }
    if (params.sortBy)                p = p.set('sortBy', params.sortBy);
    if (params.order)                 p = p.set('order', params.order);
    if (params.incluirEliminados)     p = p.set('incluirEliminados', 'true');
    if (params.stockMax !== undefined && params.stockMax !== null)
                                       p = p.set('stockMax', String(params.stockMax));
    return this.http.get<PaginatedResponse<ProductoListItem>>(`${this.base}/buscar`, { params: p });
  }

  /** Papelera: lista SOLO eliminados. Backend requiere rol Admin. */
  papelera(page = 1, size = 50): Observable<PaginatedResponse<ProductoListItem>> {
    const p = new HttpParams()
      .set('page', String(page))
      .set('size', String(size));
    return this.http.get<PaginatedResponse<ProductoListItem>>(`${this.base}/papelera`, { params: p });
  }

  obtener(id: number): Observable<Producto> {
    return this.http.get<Producto>(`${this.base}/${id}`);
  }

  crear(payload: CrearProductoPayload): Observable<Producto> {
    return this.http.post<Producto>(this.base, payload);
  }

  actualizar(id: number, payload: ActualizarProductoPayload): Observable<Producto> {
    return this.http.put<Producto>(`${this.base}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** Restaura un producto de la papelera. Solo Admin. */
  restaurar(id: number): Observable<Producto> {
    return this.http.post<Producto>(`${this.base}/${id}/restaurar`, {});
  }
}
