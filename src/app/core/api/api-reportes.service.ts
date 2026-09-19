import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaginatedResponse } from '../models/inventario.models';

export interface KpiResumenResult {
  unidadesIngresadas: number;
  unidadesSalidas: number;
  saldoNeto: number;
  montoIngresos: number;
  montoSalidas: number;
  cantidadIngresos: number;
  cantidadSalidas: number;
}

export interface KpiInventarioResult {
  totalItems: number;
  totalUnidades: number;
  productosBajos: number;
}

export interface TopVendidoParams {
  desde?: string;     // ISO
  hasta?: string;     // ISO
  marcaId?: number;
  categoriaId?: number;
  limit?: number;     // default 20
}

export interface TopVendidoItem {
  productoId: number;
  productoNombre: string;
  productoCodigo: string | null;
  marcaId: number | null;
  marcaNombre: string | null;
  categoriaId: number | null;
  categoriaNombre: string | null;
  cantidadVendida: number;
  montoVendido: number;
  movimientos: number;
}

export interface TopClienteParams {
  desde?: string;
  hasta?: string;
  limit?: number;
}

export interface TopClienteItem {
  clienteNombre: string;
  totalTransacciones: number;
  unidadesCompradas: number;
  montoTotalComprado: number;
  ultimaCompra: string;
}

export interface RentabilidadParams {
  desde?: string;
  hasta?: string;
  marcaId?: number;
  categoriaId?: number;
}

export interface RentabilidadItem {
  productoId: number;
  productoNombre: string;
  productoCodigo: string | null;
  marcaId: number | null;
  marcaNombre: string | null;
  categoriaId: number | null;
  categoriaNombre: string | null;
  unidadesIngresadas: number;
  unidadesVendidas: number;
  totalGastoCompras: number;
  totalIngresoVentas: number;
  gananciaNeta: number;
  margenPorcentaje: number;
}

export interface StockCriticoItem {
  productoId: number;
  productoNombre: string;
  productoCodigo: string | null;
  marcaNombre: string | null;
  categoriaNombre: string | null;
  stockActual: number;
  stockMinimo: number;
  deficit: number;
  precioCompra: number;
  valorInversion: number;
}

export interface ProductoEstancadoItem {
  productoId: number;
  productoNombre: string;
  productoCodigo: string | null;
  marcaNombre: string | null;
  categoriaNombre: string | null;
  stockActual: number;
  ultimoMovimientoFecha: string | null;
  diasSinMovimiento: number;
  capitalEstancado: number;
}

export interface StockCriticoEstancadosResult {
  stockCritico: StockCriticoItem[];
  productosEstancados: ProductoEstancadoItem[];
  totalCriticos: number;
  totalAgotados: number;
  totalEstancados: number;
  capitalEstancadoTotal: number;
}

export interface AuditoriaParams {
  desde?: string;
  hasta?: string;
  usuarioId?: number;
  tipo?: 'producto' | 'movimiento';
  page?: number;
  size?: number;
}

export interface AuditoriaItem {
  id: number;
  fecha: string;
  tipo: 'PRODUCTO' | 'MOVIMIENTO';
  accion: string;
  usuarioId: number | null;
  usuarioNombre: string | null;
  usuarioEmail: string | null;
  entidadId: number | null;
  entidadNombre: string | null;
  detalle: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiReportesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/reportes`;

  kpiResumen(): Observable<KpiResumenResult> {
    return this.http.get<KpiResumenResult>(`${this.base}/kpi-resumen`);
  }

  /**
   * Server-side aggregate inventory KPIs. Replaces the buggy page-slice
   * computation that InventarioState used to do client-side. Now totals
   * are computed over the entire Productos table (excluding soft-deleted
   * via the backend's global EF query filter), so the dashboard never
   * sees misleading numbers from the current pagination slice.
   *
   * Returns the response shape `{ totalItems, totalUnidades, productosBajos }`
   * from `GET /api/reportes/kpis-inventario`.
   */
  kpisInventario(): Observable<KpiInventarioResult> {
    return this.http.get<KpiInventarioResult>(`${this.base}/kpis-inventario`);
  }

  stockCriticoEstancados(diasMinimosEstancado = 30): Observable<StockCriticoEstancadosResult> {
    const p = new HttpParams().set('diasMinimosEstancado', String(diasMinimosEstancado));
    return this.http.get<StockCriticoEstancadosResult>(`${this.base}/stock-critico-estancados`, { params: p });
  }

  topClientes(params: TopClienteParams = {}): Observable<TopClienteItem[]> {
    let p = new HttpParams();
    if (params.desde) p = p.set('desde', params.desde);
    if (params.hasta) p = p.set('hasta', params.hasta);
    if (params.limit) p = p.set('limit', String(params.limit));
    return this.http.get<TopClienteItem[]>(`${this.base}/top-clientes`, { params: p });
  }

  rentabilidad(params: RentabilidadParams = {}): Observable<RentabilidadItem[]> {
    let p = new HttpParams();
    if (params.desde)       p = p.set('desde', params.desde);
    if (params.hasta)       p = p.set('hasta', params.hasta);
    if (params.marcaId)     p = p.set('marcaId', String(params.marcaId));
    if (params.categoriaId) p = p.set('categoriaId', String(params.categoriaId));
    return this.http.get<RentabilidadItem[]>(`${this.base}/rentabilidad`, { params: p });
  }

  topVendidos(params: TopVendidoParams = {}): Observable<PaginatedResponse<TopVendidoItem>> {
    let p = new HttpParams();
    if (params.desde)      p = p.set('desde', params.desde);
    if (params.hasta)      p = p.set('hasta', params.hasta);
    if (params.marcaId)    p = p.set('marcaId', String(params.marcaId));
    if (params.categoriaId) p = p.set('categoriaId', String(params.categoriaId));
    if (params.limit)      p = p.set('limit', String(params.limit));
    return this.http.get<PaginatedResponse<TopVendidoItem>>(`${this.base}/top-vendidos`, { params: p });
  }

  auditoria(params: AuditoriaParams = {}): Observable<PaginatedResponse<AuditoriaItem>> {
    let p = new HttpParams();
    if (params.desde)     p = p.set('desde', params.desde);
    if (params.hasta)     p = p.set('hasta', params.hasta);
    if (params.usuarioId) p = p.set('usuarioId', String(params.usuarioId));
    if (params.tipo)      p = p.set('tipo', params.tipo);
    if (params.page)      p = p.set('page', String(params.page));
    if (params.size)      p = p.set('size', String(params.size));
    return this.http.get<PaginatedResponse<AuditoriaItem>>(`${this.base}/auditoria`, { params: p });
  }

  catalogoPdfUrl(marcaId?: number | null, categoriaId?: number | null): string {
    const qs: string[] = [];
    if (marcaId)     qs.push(`marcaId=${marcaId}`);
    if (categoriaId) qs.push(`categoriaId=${categoriaId}`);
    const sufijo = qs.length > 0 ? `?${qs.join('&')}` : '';
    return `${this.base}/catalogo.pdf${sufijo}`;
  }

  descargarCatalogoPdf(
    marcaId?: number | null,
    categoriaId?: number | null,
    agrupacion: 'categoria' | 'marca' = 'categoria'
  ): Observable<Blob> {
    let p = new HttpParams();
    if (marcaId)     p = p.set('marcaId', String(marcaId));
    if (categoriaId) p = p.set('categoriaId', String(categoriaId));
    if (agrupacion)   p = p.set('agrupacion', agrupacion);
    return this.http.get(`${this.base}/catalogo.pdf`, {
      params: p,
      responseType: 'blob',
      observe: 'body',
    });
  }
}
