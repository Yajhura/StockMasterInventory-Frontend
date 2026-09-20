import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiAuthService } from '../api/api-auth.service';
import { Usuario } from '../models/inventario.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiAuthService);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<Usuario | null>(null);
  private readonly _cargandoLogout = signal<boolean>(false);

  readonly currentUser     = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly rol             = computed(() => this._currentUser()?.rol ?? null);
  readonly esAdmin         = computed(() => this._currentUser()?.rol === 'Admin');
  readonly cargandoLogout  = this._cargandoLogout.asReadonly();

  /**
   * Validates the session on app boot by probing /api/auth/me.
   * The browser sends the __Host-sm_session cookie automatically via
   * the credentialsInterceptor. No localStorage read — the cookie jar
   * is the single source of truth for auth state.
   */
  async init(): Promise<void> {
    try {
      const user = await firstValueFrom(this.api.me());
      this._currentUser.set(user);
    } catch {
      // 401 (no cookie / invalid cookie) or network error: stay
      // anonymous. /me is the only session check.
      this._currentUser.set(null);
    }
  }

  /**
   * Posts credentials to /api/auth/login. The server sets the
   * __Host-sm_session cookie on success; the browser stores it in the
   * cookie jar and attaches it on every subsequent API request.
   * Login response body is the user profile only (no tokens).
   */
  async login(email: string, password: string): Promise<Usuario> {
    const user = await firstValueFrom(
      this.api.login({ email: email.trim().toLowerCase(), password }),
    );
    this._currentUser.set(user);
    return user;
  }

  /**
   * Closes the session by issuing POST /api/auth/logout. The server
   * clears the __Host-sm_session cookie via Set-Cookie Max-Age=0.
   * Per REQ-AUTH-COOKIE-008: the HTTP call resolves (success or
   * failure) BEFORE currentUser is cleared, so the client never
   * claims "logged out" while the server cookie is still live.
   */
  async logout(navigateToLogin: boolean = true): Promise<void> {
    this._cargandoLogout.set(true);
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      // Server may be unreachable or 401. The cookie's lifetime on
      // the server is the authoritative thing; clearing local state
      // regardless is the right call — worst case the user sees a
      // stale session until the cookie expires (Max-Age=86400).
    } finally {
      this._currentUser.set(null);
      this._cargandoLogout.set(false);
      if (navigateToLogin) {
        this.router.navigateByUrl('/login');
      }
    }
  }
}