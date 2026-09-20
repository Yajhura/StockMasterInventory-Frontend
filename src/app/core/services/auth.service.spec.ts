/**
 * AuthService specs — REQ-AUTH-COOKIE-007 + REQ-AUTH-COOKIE-008.
 *
 * Verifies the cookie-based session model:
 *   1. `init()` issues `GET /api/auth/me` and populates `currentUser`
 *      on 200. No localStorage read — the cookie jar is the source
 *      of truth.
 *   2. `init()` leaves `currentUser` null on a 401 (no cookie /
 *      invalid cookie).
 *   3. `logout()` issues `POST /api/auth/logout`, awaits the response
 *      (success or failure), and THEN clears `currentUser`.
 *
 * Cookies are browser-managed. Tests assert the HTTP requests fire
 * correctly via HttpTestingController; they never touch `localStorage`
 * or read/write cookies directly.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Usuario } from '../models/inventario.models';
import { environment } from '../../../environments/environment';

const ME_URL = `${environment.apiBaseUrl}/api/auth/me`;
const LOGOUT_URL = `${environment.apiBaseUrl}/api/auth/logout`;

const mockUsuario: Usuario = {
  id: 42,
  email: 'admin@test',
  nombreCompleto: 'Admin User',
  rol: 'Admin',
};

describe('AuthService (REQ-AUTH-COOKIE-007/008)', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
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

  it('init_with_valid_cookie_populates_currentUser', async () => {
    // GIVEN: a session cookie is present in the browser (simulated by
    // the test runner — HttpTestingController matches the URL the
    // server-side cookie is associated with).
    // WHEN: init() runs.
    const initPromise = service.init();

    // THEN: one GET /api/auth/me fires (the browser attaches the cookie
    // automatically via withCredentials: true).
    const req = httpTesting.expectOne(ME_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();

    // AND: when the server replies 200 with the user profile, the
    // currentUser signal reflects it.
    req.flush(mockUsuario);
    await initPromise;

    expect(service.currentUser()).toEqual(mockUsuario);
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('init_with_invalid_cookie_leaves_currentUser_null', async () => {
    // GIVEN: no cookie (or an invalid one). The server will respond 401.
    // WHEN: init() runs.
    const initPromise = service.init();

    // THEN: one GET /api/auth/me fires.
    const req = httpTesting.expectOne(ME_URL);
    expect(req.request.method).toBe('GET');

    // AND: on 401, currentUser stays null and isAuthenticated() is false.
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await initPromise;

    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('logout_calls_API_and_clears_currentUser', async () => {
    // GIVEN: an authenticated user (seeded via init()).
    const initPromise = service.init();
    const meReq = httpTesting.expectOne(ME_URL);
    meReq.flush(mockUsuario);
    await initPromise;
    expect(service.isAuthenticated()).toBeTrue();

    // WHEN: logout() runs.
    const logoutPromise = service.logout(false);

    // THEN: one POST /api/auth/logout fires. The server clears the
    // cookie via Set-Cookie Max-Age=0.
    const logoutReq = httpTesting.expectOne(LOGOUT_URL);
    expect(logoutReq.request.method).toBe('POST');
    expect(logoutReq.request.withCredentials).toBeTrue();

    // AND: only AFTER the API call resolves does the client clear
    // currentUser (REQ-AUTH-COOKIE-008).
    logoutReq.flush(null, { status: 204, statusText: 'No Content' });
    await logoutPromise;

    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.cargandoLogout()).toBeFalse();
  });
});