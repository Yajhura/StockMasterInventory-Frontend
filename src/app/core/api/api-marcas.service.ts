import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Marca } from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class ApiMarcasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/marcas`;

  listar(): Observable<Marca[]> {
    return this.http.get<Marca[]>(this.base);
  }

  crear(payload: { nombre: string }): Observable<Marca> {
    return this.http.post<Marca>(this.base, payload);
  }

  actualizar(id: number, payload: { nombre: string }): Observable<Marca> {
    return this.http.put<Marca>(`${this.base}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
