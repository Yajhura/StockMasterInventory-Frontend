import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Categoria } from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class ApiCategoriasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/categorias`;

  listar(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(this.base);
  }

  obtener(id: number): Observable<Categoria> {
    return this.http.get<Categoria>(`${this.base}/${id}`);
  }

  crear(payload: { nombre: string }): Observable<Categoria> {
    return this.http.post<Categoria>(this.base, payload);
  }

  actualizar(id: number, payload: { nombre: string }): Observable<Categoria> {
    return this.http.put<Categoria>(`${this.base}/${id}`, payload);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
