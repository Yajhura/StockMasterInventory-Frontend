/**
 * AuthGuard spec — REQ-TEST-002.
 *
 * Verifies that `authGuard`:
 *   - Returns `true` when the user is authenticated.
 *   - Returns a `UrlTree` for `/login?returnUrl=<state.url>` when the
 *     user is NOT authenticated, preserving the originally-attempted
 *     URL so the post-login redirect can resume it.
 *
 * Implementation detail:
 *   - The guard reads `AuthService.isAuthenticated()`, a computed
 *     signal backed by `currentUser` (no longer `accessToken`).
 *   - For the authenticated branch we drive the real `login()` flow
 *     via `HttpTestingController` — the response body is now the
 *     `Usuario` profile directly (no token fields).
 *   - `authGuard` is a functional guard (`CanActivateFn`); we resolve
 *     it inside `runInInjectionContext` so its `inject()` calls work.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';

import { AuthService } from '../services/auth.service';
import { authGuard, wacReportesGuard } from './auth.guard';
import { Usuario } from '../models/inventario.models';
import { environment } from '../../../environments/environment';

const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;

const mockUsuario: Usuario = {
  id: 1,
  email: 'admin@test',
  nombreCompleto: 'Admin User',
  rol: 'Admin',
};

describe('authGuard (REQ-TEST-002)', () => {
  let httpTesting: HttpTestingController;
  let authService: AuthService;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // A bare router config is sufficient — we never navigate, we
        // only resolve `authGuard` against a synthetic RouterStateSnapshot.
        provideRouter([]),
        AuthService,
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    injector = TestBed.inject(EnvironmentInjector);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('unauthenticated_user_redirected_to_login', () => {
    // GIVEN: no session. AuthService.isAuthenticated() is false.
    expect(authService.isAuthenticated()).toBeFalse();

    // WHEN: authGuard evaluates a guarded route targeting `/productos`.
    const targetUrl = '/productos';
    const result = runInInjectionContext(injector, () =>
      authGuard(
        // ActivatedRouteSnapshot stub — the guard never reads it.
        {} as never,
        // RouterStateSnapshot stub — only `url` is read by the guard.
        { url: targetUrl } as never,
      ),
    );

    // THEN: result is a UrlTree for /login with returnUrl set.
    expect(result).toBeDefined();
    expect(result instanceof UrlTree).toBeTrue();

    const urlTree = result as UrlTree;
    const segments = urlTree.root.children['primary']?.segments ?? [];
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].path).toBe('login');
    expect(urlTree.queryParams['returnUrl']).toBe(targetUrl);
  });

  it('authenticated_user_can_activate', async () => {
    // GIVEN: a logged-in user (driven through the real login flow).
    // The login response body is now the Usuario profile only.
    const loginPromise = authService.login('admin@test', 'secret');
    const loginReq = httpTesting.expectOne(LOGIN_URL);
    expect(loginReq.request.method).toBe('POST');
    loginReq.flush(mockUsuario);
    await loginPromise;

    expect(authService.isAuthenticated()).toBeTrue();

    // WHEN: authGuard evaluates a guarded route.
    const result = runInInjectionContext(injector, () =>
      authGuard({} as never, { url: '/dashboard' } as never),
    );

    // THEN: the guard allows navigation.
    expect(result).toBeTrue();
  });
});

describe('wacReportesGuard (WAC-GUARD-01)', () => {
  let injector: EnvironmentInjector;
  let originalReportesConWac: boolean;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    injector = TestBed.inject(EnvironmentInjector);
    originalReportesConWac = environment.reportesConWac;
  });

  afterEach(() => {
    environment.reportesConWac = originalReportesConWac;
  });

  it('redirects_direct_wac_route_to_reportes_when_disabled', () => {
    environment.reportesConWac = false;

    const result = runInInjectionContext(injector, () =>
      wacReportesGuard({} as never, { url: '/reportes/rentabilidad-wac' } as never),
    );

    expect(result instanceof UrlTree).toBeTrue();
    const urlTree = result as UrlTree;
    const segments = urlTree.root.children['primary']?.segments ?? [];
    expect(segments.map((segment) => segment.path)).toEqual(['reportes']);
  });

  it('allows_direct_wac_route_when_enabled', () => {
    environment.reportesConWac = true;

    const result = runInInjectionContext(injector, () =>
      wacReportesGuard({} as never, { url: '/reportes/rentabilidad-wac' } as never),
    );

    expect(result).toBeTrue();
  });
});
