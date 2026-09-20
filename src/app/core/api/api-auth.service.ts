import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginPayload, Usuario } from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class ApiAuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/auth`;

  /**
   * POST /api/auth/login — server sets the __Host-sm_session cookie
   * on 200. The response body is the user profile only (no tokens;
   * see REQ-AUTH-COOKIE-002).
   */
  login(payload: LoginPayload): Observable<Usuario> {
    return this.http.post<Usuario>(`${this.base}/login`, payload);
  }

  /**
   * GET /api/auth/me — validates the session cookie and returns the
   * current user profile. 401 if missing/invalid cookie.
   */
  me(): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.base}/me`);
  }

  /**
   * POST /api/auth/logout — server clears __Host-sm_session via
   * Set-Cookie Max-Age=0. Idempotent: 204 even without a cookie.
   */
  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, null);
  }

  usuarios(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(`${this.base}/usuarios`);
  }
}