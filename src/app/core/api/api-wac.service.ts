import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WacQuarantineItem { id: number; productoId: number; productoNombre: string; motivo: string; movimientoOrigenId: number | null; observacion: string | null; creadoEn: string; }

@Injectable({ providedIn: 'root' })
export class ApiWacService {
  private readonly http = inject(HttpClient);
  quarantine(): Observable<WacQuarantineItem[]> { return this.http.get<WacQuarantineItem[]>(`${environment.apiBaseUrl}/api/wac/quarantine`); }
}
