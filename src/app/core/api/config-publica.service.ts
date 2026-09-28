import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConfigPublica } from '../models/config-publica.model';

/**
 * ConfigPublicaService (CFG-10).
 *
 * Expone la fila unica de configuracion publica que la landing consume
 * via `GET /api/public/config`. Este service habla con los endpoints
 * autenticados (`GET/PUT /api/config`) que usa el admin para editarla.
 *
 * Mismo patron que el resto de `core/api`: `http` inyectado, `url` derivada
 * de `environment.apiBaseUrl`, metodos que devuelven Observables crudos
 * (sin map/toast) para que cada componente maneje su propio estado de carga.
 */
@Injectable({ providedIn: 'root' })
export class ConfigPublicaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/config`;

  /**
   * Lectura de la configuracion actual. El backend devuelve la fila
   * unica (Id=1) con los 7 campos editables mas `ModificadoEn`.
   */
  get(): Observable<ConfigPublica> {
    return this.http.get<ConfigPublica>(this.url);
  }

  /**
   * Persistencia. El PUT recibe el mismo shape que devuelve el GET, asi
   * que re-enviamos la respuesta del servidor (que ya trae `ModificadoEn`
   * actualizado) para que el componente refresque su snapshot.
   */
  update(cfg: ConfigPublica): Observable<ConfigPublica> {
    return this.http.put<ConfigPublica>(this.url, cfg);
  }
}
