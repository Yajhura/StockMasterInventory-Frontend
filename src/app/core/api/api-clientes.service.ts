import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Cliente,
  CrearClientePayload,
  ClienteFiltros,
  TipoDocumento,
  EstadoCuentaCliente,
  KpiClientes,
  PaginatedClientes,
} from '../models/cliente.models';

@Injectable({ providedIn: 'root' })
export class ApiClientesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/clientes`;

  /**
   * C-4 / K-4 audit: el endpoint ahora devuelve el envelope
   * PaginatedResponse&lt;ClienteResponse&gt; en lugar de un array plano.
   * Los filtros de paginacion tienen defaults (page=1, size=50) para no
   * obligar al componente a setearlos siempre.
   *
   * F-1 / A-6 audit: cuando el FE quiere ver la papelera, manda
   * `incluirEliminados: true` y el backend ignora el HasQueryFilter
   * y devuelve tanto clientes activos como soft-deleted. Asi el
   * toggle de papelera no requiere un endpoint separado.
   */
  listar(filtros?: ClienteFiltros): Observable<PaginatedClientes> {
    let params = new HttpParams()
      .set('page', String(filtros?.page ?? 1))
      .set('size', String(filtros?.size ?? 50));
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.tipoDocumentoId != null) params = params.set('tipoDocumentoId', String(filtros.tipoDocumentoId));
    if (filtros?.estadoDeuda) params = params.set('estadoDeuda', filtros.estadoDeuda);
    if (filtros?.incluirEliminados) params = params.set('incluirEliminados', 'true');
    return this.http.get<PaginatedClientes>(this.url, { params });
  }

  listarTiposDocumento(): Observable<TipoDocumento[]> {
    return this.http.get<TipoDocumento[]>(`${this.url}/tipos-documento`);
  }

  obtener(id: number): Observable<Cliente> {
    return this.http.get<Cliente>(`${this.url}/${id}`);
  }

  crear(payload: CrearClientePayload): Observable<Cliente> {
    return this.http.post<Cliente>(this.url, payload);
  }

  actualizar(id: number, payload: CrearClientePayload): Observable<Cliente> {
    return this.http.put<Cliente>(`${this.url}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /**
   * F-1 / A-6 audit: revierte el soft delete de un cliente. Solo Admin.
   * El backend limpia Eliminado/EliminadoEn/EliminadoPor y actualiza
   * ModificadoPor/ModificadoEn via ICurrentUser.
   */
  restaurar(id: number): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/restaurar`, {});
  }

  exportarExcel(): Observable<Blob> {
    return this.http.get(`${this.url}/exportar-excel`, { responseType: 'blob' });
  }

  /**
   * E-2 audit (fix #7): acepta parametros de paginacion para la lista de
   * ventas. Los totales (facturado / pagado / deuda) siguen siendo globales
   * y se calculan server-side en SQL.
   */
  obtenerEstadoCuenta(
    id: number,
    pageVentas: number = 1,
    sizeVentas: number = 20,
  ): Observable<EstadoCuentaCliente> {
    let params = new HttpParams()
      .set('pageVentas', String(pageVentas))
      .set('sizeVentas', String(sizeVentas));
    return this.http.get<EstadoCuentaCliente>(`${this.url}/${id}/estado-cuenta`, { params });
  }

  kpis(): Observable<KpiClientes> {
    return this.http.get<KpiClientes>(`${this.url}/kpis`);
  }
}