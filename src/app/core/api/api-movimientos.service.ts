import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Movimiento,
  PaginatedResponse,
  RegistrarMovimientoPayload,
} from '../models/inventario.models';

export interface ListarMovimientosParams {
  desde?: string;
  hasta?: string;
  tipo?: 1 | 2;
  productoId?: number;
  marcaId?: number | string;
  categoriaId?: number | string;
  creadoPorId?: number;
  cliente?: string;
  q?: string;
  page?: number;
  size?: number;
  sortBy?: 'fecha' | 'id';
  order?: 'asc' | 'desc';
}

@Injectable({ providedIn: 'root' })
export class ApiMovimientosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/movimientos`;

  kardex(productoId: number, desde?: string, hasta?: string): Observable<Movimiento[]> {
    let params = new HttpParams().set('productoId', String(productoId));
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<Movimiento[]>(`${this.base}/kardex`, { params });
  }

  /**
   * Lista paginada de todos los movimientos (no requiere productoId).
   * Pensado para la pantalla de Reportes.
   */
  listar(params: ListarMovimientosParams = {}): Observable<PaginatedResponse<Movimiento>> {
    let httpParams = new HttpParams();
    if (params.desde)     httpParams = httpParams.set('desde', params.desde);
    if (params.hasta)     httpParams = httpParams.set('hasta', params.hasta);
    if (params.tipo)      httpParams = httpParams.set('tipo', String(params.tipo));
    if (params.productoId !== undefined && params.productoId !== null)
                          httpParams = httpParams.set('productoId', String(params.productoId));
    if (params.marcaId !== undefined && params.marcaId !== null && params.marcaId !== 'all')
                          httpParams = httpParams.set('marcaId', String(params.marcaId));
    if (params.categoriaId !== undefined && params.categoriaId !== null && params.categoriaId !== 'all')
                          httpParams = httpParams.set('categoriaId', String(params.categoriaId));
    if (params.creadoPorId !== undefined && params.creadoPorId !== null)
                          httpParams = httpParams.set('creadoPorId', String(params.creadoPorId));
    if (params.cliente)   httpParams = httpParams.set('cliente', params.cliente);
    if (params.q)         httpParams = httpParams.set('q', params.q);
    if (params.page)      httpParams = httpParams.set('page', String(params.page));
    if (params.size)      httpParams = httpParams.set('size', String(params.size));
    if (params.sortBy)    httpParams = httpParams.set('sortBy', params.sortBy);
    if (params.order)     httpParams = httpParams.set('order', params.order);
    return this.http.get<PaginatedResponse<Movimiento>>(this.base, { params: httpParams });
  }

  registrar(payload: RegistrarMovimientoPayload): Observable<Movimiento> {
    return this.http.post<Movimiento>(this.base, payload);
  }

  actualizar(id: number, payload: Partial<RegistrarMovimientoPayload>): Observable<Movimiento> {
    return this.http.put<Movimiento>(`${this.base}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
