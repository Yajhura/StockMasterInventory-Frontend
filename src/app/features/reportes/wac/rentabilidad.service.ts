import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RentabilidadFiltros, RentabilidadResponse } from './rentabilidad.dtos';

/**
 * WAC-aware rentabilidad endpoint. Auth is cookie-based (see
 * `credentialsInterceptor`); no Bearer is added here.
 */
@Injectable({ providedIn: 'root' })
export class RentabilidadService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/reportes`;

  getRentabilidad(filtros: RentabilidadFiltros): Observable<RentabilidadResponse> {
    let p = new HttpParams().set('desde', filtros.desde).set('hasta', filtros.hasta);
    if (filtros.categoriaId != null) p = p.set('categoriaId', String(filtros.categoriaId));
    if (filtros.marcaId != null)     p = p.set('marcaId', String(filtros.marcaId));
    return this.http.get<RentabilidadResponse>(`${this.base}/rentabilidad`, { params: p });
  }
}