import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiAuthService } from '../api/api-auth.service';
import { AuthResponse, Usuario } from '../models/inventario.models';

const STORAGE_KEY = 'stockmaster.auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiAuthService);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<Usuario | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private readonly _refreshToken = signal<string | null>(null);
  private readonly _cargandoLogout = signal<boolean>(false);

  readonly currentUser     = this._currentUser.asReadonly();
  readonly accessToken     = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly rol             = computed(() => this._currentUser()?.rol ?? null);
  readonly esAdmin         = computed(() => this._currentUser()?.rol === 'Admin');
  readonly cargandoLogout  = this._cargandoLogout.asReadonly();

  /**
   * Restauracion al iniciar la app:
   *  1. Lee tokens de localStorage para tener sesion instantanea (no parpadea el login).
   *  2. Si hay token, consulta /api/auth/me para refrescar datos del usuario.
   *  3. Si /me falla (token expirado/invalido), limpia la sesion.
   */
  async init(): Promise<void> {
    const stored = this.leerStorage();
    if (!stored) return;

    this._currentUser.set(stored.usuario);
    this._accessToken.set(stored.accessToken);
    this._refreshToken.set(stored.refreshToken);

    // Refresca datos del usuario en background. No bloquea la UI.
    try {
      const fresh = await firstValueFrom(this.api.me());
      this._currentUser.set(fresh);
    } catch {
      // Token invalido o expirado. Forzamos logout silencioso.
      this.logout(true);
    }
  }

  async login(email: string, password: string): Promise<Usuario> {
    const resp = await firstValueFrom(
      this.api.login({ email: email.trim().toLowerCase(), password })
    );
    this.guardarSesion(resp);
    return resp.usuario;
  }

  /**
   * Cierra la sesion con un breve delay visual para que el usuario
   * vea el feedback "Cerrando sesion..." antes de navegar a /login.
   * El delay es de 350ms; no bloquea la red porque ya estamos en cliente.
   */
  async logout(navigateToLogin: boolean = true): Promise<void> {
    this._currentUser.set(null);
    this._accessToken.set(null);
    this._refreshToken.set(null);

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }

    if (navigateToLogin) {
      this.router.navigateByUrl('/login');
    }
  }

  private guardarSesion(resp: AuthResponse): void {
    this._currentUser.set(resp.usuario);
    this._accessToken.set(resp.accessToken);
    this._refreshToken.set(resp.refreshToken);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resp));
    }
  }

  private leerStorage(): AuthResponse | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
