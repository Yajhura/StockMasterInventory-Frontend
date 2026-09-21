import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
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

  kpisCobranza(): Observable<KpiCobranza> {
    return this.http.get<KpiCobranza>(`${this.url}/kpis-cobranza`);
  }

  listarDeudas(filtros?: VentaFiltros): Observable<Venta[]> {
    let params = new HttpParams();
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.clienteId != null) params = params.set('clienteId', String(filtros.clienteId));
    return this.http.get<Venta[]>(`${this.url}/deudas`, { params });
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
