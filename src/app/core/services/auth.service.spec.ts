/**
 * AuthService specs — REQ-TEST-001.
 *
 * Verifies the three branches of `AuthService.init()`:
 *   1. Reads the `stockmaster.auth` localStorage entry and populates the
 *      `currentUser` / `accessToken` signals synchronously.
 *   2. Calls `GET /api/auth/me` in the background and refreshes the
 *      `currentUser` signal on success.
 *   3. On a 401 response from `/api/auth/me`, performs the silent logout
 *      path: clears signals, removes the storage key, and navigates to
 *      `/login`.
 *
 * Uses Angular 17 standalone testing patterns:
 *   - `provideHttpClient()` + `provideHttpClientTesting()` for HTTP.
 *   - `TestBed.runInInjectionContext(...)` to access service signals
 *     under the test injector without a component harness.
 *   - `Router` is spied via a Jasmine spy so we can assert navigation.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthResponse, Usuario } from '../models/inventario.models';
import { environment } from '../../../environments/environment';

const STORAGE_KEY = 'stockmaster.auth';
const ME_URL = `${environment.apiBaseUrl}/api/auth/me`;

const mockUsuario: Usuario = {
  id: 42,
  email: 'admin@test',
  nombreCompleto: 'Admin User',
  rol: 'Admin',
};

const mockFreshUsuario: Usuario = {
  id: 42,
  email: 'admin@test',
  nombreCompleto: 'Admin User (renovado)',
  rol: 'Admin',
};

const mockAuthResponse: AuthResponse = {
  accessToken: 'access-token-abc',
  accessTokenExpira: '2030-01-01T00:00:00Z',
  refreshToken: 'refresh-token-xyz',
  refreshTokenExpira: '2030-02-01T00:00:00Z',
  usuario: mockUsuario,
};

describe('AuthService (REQ-TEST-001)', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    // Reset storage between tests so each spec starts clean.
    localStorage.clear();
    sessionStorage.clear();

    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigateByUrl', 'createUrlTree']);
    routerSpy.navigateByUrl.and.returnValue(Promise.resolve(true));
    routerSpy.createUrlTree.and.returnValue({} as ReturnType<Router['createUrlTree']>);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerSpy },
        AuthService,
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('init_from_localStorage_populates_user_signal', async () => {
    // GIVEN: a stored session in localStorage.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockAuthResponse));

    // WHEN: init() runs.
    const initPromise = service.init();

    // THEN: signals are populated synchronously from storage.
    expect(service.currentUser()).toEqual(mockUsuario);
    expect(service.accessToken()).toBe('access-token-abc');
    expect(service.isAuthenticated()).toBeTrue();

    // AND: /api/auth/me is called exactly once. Drain the request to
    // let `init()` resolve.
    const req = httpTesting.expectOne(ME_URL);
    expect(req.request.method).toBe('GET');
    req.flush(mockUsuario);
    await initPromise;
  });

  it('refresh_me_on_success_updates_user_signal', async () => {
    // GIVEN: a stored session.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockAuthResponse));

    // WHEN: init() runs and /api/auth/me responds with fresher data.
    const initPromise = service.init();
    const req = httpTesting.expectOne(ME_URL);
    req.flush(mockFreshUsuario);
    await initPromise;

    // THEN: the user signal reflects the fresh response, not the
    // stored copy.
    expect(service.currentUser()).toEqual(mockFreshUsuario);
    expect(service.currentUser()?.nombreCompleto).toBe('Admin User (renovado)');
    expect(service.accessToken()).toBe('access-token-abc');
  });

  it('refresh_me_on_failure_triggers_silent_logout', async () => {
    // GIVEN: a stored session (token about to expire).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockAuthResponse));

    // WHEN: init() runs and /api/auth/me rejects with 401.
    const initPromise = service.init();
    const req = httpTesting.expectOne(ME_URL);
    req.flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });
    await initPromise;

    // THEN: signals cleared, storage cleared, navigation to /login.
    expect(service.currentUser()).toBeNull();
    expect(service.accessToken()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledOnceWith('/login');
  });
});