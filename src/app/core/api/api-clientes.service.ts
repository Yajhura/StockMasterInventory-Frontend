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
} from '../models/cliente.models';

@Injectable({ providedIn: 'root' })
export class ApiClientesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/clientes`;

  listar(filtros?: ClienteFiltros): Observable<Cliente[]> {
    let params = new HttpParams();
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.tipoDocumentoId != null) params = params.set('tipoDocumentoId', String(filtros.tipoDocumentoId));
    if (filtros?.estadoDeuda) params = params.set('estadoDeuda', filtros.estadoDeuda);
    return this.http.get<Cliente[]>(this.url, { params });
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

  exportarExcel(): Observable<Blob> {
    return this.http.get(`${this.url}/exportar-excel`, { responseType: 'blob' });
  }

  obtenerEstadoCuenta(id: number): Observable<EstadoCuentaCliente> {
    return this.http.get<EstadoCuentaCliente>(`${this.url}/${id}/estado-cuenta`);
  }

  kpis(): Observable<KpiClientes> {
    return this.http.get<KpiClientes>(`${this.url}/kpis`);
  }
}