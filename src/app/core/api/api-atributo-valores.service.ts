import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AtributoValor } from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class ApiAtributoValoresService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/atributo-valores`;

  listar(atributoId?: number): Observable<AtributoValor[]> {
    let p = new HttpParams();
    if (atributoId != null) p = p.set('atributoId', String(atributoId));
    return this.http.get<AtributoValor[]>(this.base, { params: p });
  }

  crear(payload: { atributoId: number; nombre: string }): Observable<AtributoValor> {
    return this.http.post<AtributoValor>(this.base, payload);
  }

  actualizar(id: number, payload: { nombre: string }): Observable<AtributoValor> {
    return this.http.put<AtributoValor>(`${this.base}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
