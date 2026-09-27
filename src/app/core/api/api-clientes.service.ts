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
    // G-1 / C-1 audit (fix #8+#9): enviamos `q` solo si es no vacio para
    // no mandar un parametro vacio que confunda al backend o a proxies.
    if (filtros?.q && filtros.q.trim()) params = params.set('q', filtros.q.trim());
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

  /**
   * L-1 audit (fix #13): descarga el directorio de clientes en formato
   * XLSX. Acepta los mismos filtros que listar() para que el FE pueda
   * exportar la vista actual (incluyendo el toggle de papelera).
   * Devuelve un Blob para que el componente lo guarde via a[download].
   */
  exportarExcel(filtros?: ClienteFiltros): Observable<Blob> {
    let params = new HttpParams();
    if (filtros?.desde) params = params.set('desde', filtros.desde);
    if (filtros?.hasta) params = params.set('hasta', filtros.hasta);
    if (filtros?.tipoDocumentoId != null) params = params.set('tipoDocumentoId', String(filtros.tipoDocumentoId));
    if (filtros?.estadoDeuda) params = params.set('estadoDeuda', filtros.estadoDeuda);
    if (filtros?.q && filtros.q.trim()) params = params.set('q', filtros.q.trim());
    if (filtros?.incluirEliminados) params = params.set('incluirEliminados', 'true');
    return this.http.get(`${this.url}/exportar-excel`, {
      params,
      responseType: 'blob',
    });
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

  /**
   * G-3 / N-1 audit (fix #19+#20): busqueda de clientes similares al
   * nombre tipeado, con similitud JaroWinkler server-side. El POS
   * llama a este endpoint antes de pedir confirmacion para crear un
   * cliente nuevo inline — si hay match >= umbral (default 70),
   * muestra el modal de "posible duplicado" con el badge % similitud.
   *
   * El umbral default 70 fue elegido por el audit: por debajo
   * aparecen falsos positivos (nombres que no son realmente
   * duplicados); por encima de 99, solo matches exactos.
   */
  buscarSimilares(q: string, umbral: number = 70): Observable<ClienteSimilar[]> {
    let params = new HttpParams().set('q', q.trim());
    if (umbral !== 70) params = params.set('umbral', String(umbral));
    return this.http.get<ClienteSimilar[]>(`${this.url}/similares`, { params });
  }
}

/**
 * G-3 / N-1 audit: DTO del response de GET /api/clientes/similares.
 * Solo expone lo que el POS necesita para el modal de "posible
 * duplicado" — id para el patch del clienteId si el operador elige
 * uno existente, nombre+documento para confirmar visualmente, y
 * similitud (0..100) para el badge.
 */
export interface ClienteSimilar {
  id: number;
  nombre: string;
  documento: string | null;
  similitud: number;
}