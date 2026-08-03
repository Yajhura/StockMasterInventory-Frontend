import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Atributo } from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class ApiAtributosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/atributos`;

  listar(): Observable<Atributo[]> {
    return this.http.get<Atributo[]>(this.base);
  }

  crear(payload: { nombre: string }): Observable<Atributo> {
    return this.http.post<Atributo>(this.base, payload);
  }

  actualizar(id: number, payload: { nombre: string }): Observable<Atributo> {
    return this.http.put<Atributo>(`${this.base}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
