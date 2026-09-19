import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Venta, VentaDetallada, CrearVentaPayload, CrearAbonoPayload, Abono, VentaFiltros, KpiCobranza } from '../models/venta.models';

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
}

