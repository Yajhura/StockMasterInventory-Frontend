import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaginatedResponse } from '../models/inventario.models';
import { Venta, VentaDetallada, CrearVentaPayload, CrearAbonoPayload, Abono, VentaFiltros, KpiCobranza, MetodoPago, CuotaPreview } from '../models/venta.models';

@Injectable({ providedIn: 'root' })
export class ApiVentasService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/ventas`;

  listar(filtros?: VentaFiltros): Observable<Venta[]> {
    let params = new HttpParams();
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.clienteId != null) params = params.set('clienteId', String(filtros.clienteId));
    if (filtros?.estadoPago) params = params.set('estadoPago', filtros.estadoPago);
    return this.http.get<Venta[]>(this.url, { params });
  }

  /**
   * H-E2 audit: el backend acepta un query param `dias` (1..30) para ajustar
   * la ventana de "cuotas que vencen en los proximos N dias". Default 7.
   * Si se omite, no se envia el param y el backend usa su default.
   */
  kpisCobranza(dias?: number): Observable<KpiCobranza> {
    let params = new HttpParams();
    if (dias != null) params = params.set('dias', String(dias));
    return this.http.get<KpiCobranza>(`${this.url}/kpis-cobranza`, { params });
  }

  /**
   * H-F1 audit: el endpoint devuelve una respuesta paginada (no un array).
   * El cliente debe leer `response.items`. Default `page=1`, `size=50`
   * (el backend clamp a 1..200 para evitar OOM por un cliente hostil).
   */
  listarDeudas(filtros?: VentaFiltros): Observable<PaginatedResponse<Venta>> {
    let params = new HttpParams();
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.clienteId != null) params = params.set('clienteId', String(filtros.clienteId));
    if (filtros?.estadoPago) params = params.set('estadoPago', filtros.estadoPago);
    params = params.set('page', String(filtros?.page ?? 1));
    params = params.set('size', String(filtros?.size ?? 50));
    return this.http.get<PaginatedResponse<Venta>>(`${this.url}/deudas`, { params });
  }

  obtener(id: number): Observable<VentaDetallada> {
    return this.http.get<VentaDetallada>(`${this.url}/${id}`);
  }

  registrarVenta(payload: CrearVentaPayload): Observable<Venta> {
    return this.http.post<Venta>(this.url, payload);
  }

  registrarAbono(ventaId: number, payload: CrearAbonoPayload): Observable<Abono> {
    return this.http.post<Abono>(`${this.url}/${ventaId}/abonos`, payload);
  }

  anularAbono(ventaId: number, abonoId: number): Observable<void> {
    return this.http.post<void>(`${this.url}/${ventaId}/abonos/${abonoId}/anular`, null);
  }

  anularVenta(ventaId: number): Observable<void> {
    return this.http.post<void>(`${this.url}/${ventaId}/anular`, null);
  }

  /**
   * Lista los métodos de pago activos desde el endpoint
   * `GET /api/metodos-pago` (no bajo `/api/ventas/...` porque es un
   * catálogo compartido). Ordenados alfabéticamente según el contrato
   * del backend. Reemplaza el array hardcoded que tenía
   * `punto-venta.component.ts` antes del fix.
   */
  listarMetodosPago(): Observable<MetodoPago[]> {
    return this.http.get<MetodoPago[]>(`${environment.apiBaseUrl}/api/metodos-pago`);
  }

  /**
   * Preview del plan de cuotas calculado server-side. Usa exactamente la
   * misma logica que persiste las cuotas (PlanCreditoCalculator en
   * backend), asi que el preview coincide byte-a-byte con lo que se
   * persiste. Reemplaza el calculo local que `punto-venta.component.ts`
   * tenia (con bugs de month-end overflow).
   */
  previewPlan(total: number, cantidadCuotas: number, fechaInicio: string, frecuencia?: string): Observable<CuotaPreview[]> {
    let params = new HttpParams()
      .set('total', String(total))
      .set('cantidadCuotas', String(cantidadCuotas))
      .set('fechaInicio', fechaInicio);
    if (frecuencia) params = params.set('frecuencia', frecuencia);
    return this.http.get<CuotaPreview[]>(`${this.url}/preview-plan`, { params });
  }
}
