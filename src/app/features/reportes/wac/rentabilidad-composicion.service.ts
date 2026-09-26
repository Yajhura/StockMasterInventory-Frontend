import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RentabilidadComposicionFiltros, RentabilidadComposicionResponse } from './rentabilidad-composicion.dtos';

/**
 * RENT-BREAKDOWN-02 — Fetches the per-product WAC cost composition
 * from `GET /api/reportes/rentabilidad/{productoId}/composicion`. The
 * response explains how the headline COGS in the WAC Rentabilidad grid
 * was assembled: every INGRESO and every Costo Aplicado on a confirmed
 * sale in the window, plus an explicit warning when legacy movements
 * (FechaUtc IS NULL) participated in the math.
 *
 * Auth is cookie-based (see `credentialsInterceptor`); no Bearer header
 * is added here.
 */
@Injectable({ providedIn: 'root' })
export class RentabilidadComposicionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/reportes`;

  getComposicion(
    productoId: number,
    filtros: RentabilidadComposicionFiltros,
  ): Observable<RentabilidadComposicionResponse> {
    const p = new HttpParams()
      .set('desde', filtros.desde)
      .set('hasta', filtros.hasta);
    return this.http.get<RentabilidadComposicionResponse>(
      `${this.base}/rentabilidad/${productoId}/composicion`,
      { params: p },
    );
  }
}