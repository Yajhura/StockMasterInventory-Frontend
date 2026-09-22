/**
 * ApiVentasService specs — REQ-TEST-004.
 *
 * Verifies:
 *   - `registrarVenta(payload)` POSTs the payload to
 *     `${environment.apiBaseUrl}/api/ventas` and emits the parsed
 *     `Venta` returned by the server.
 *   - When the response is 401, the `httpErrorInterceptor` fires the
 *     logout chain: calls `AuthService.logout(true)` which issues
 *     `POST /api/auth/logout`, then navigates to `/login`.
 *
 * Implementation detail:
 *   - The success path uses `provideHttpClient()` with no
 *     interceptors — we only care about the request shape and the
 *     emitted response.
 *   - The 401 path uses the real `httpErrorInterceptor` +
 *     `credentialsInterceptor` chain. We use a Jasmine spy for
 *     `Router` because the interceptor calls `router.url.startsWith('/login')`
 *     to decide whether to emit the toast — a synthetic URL works.
 *   - Auth state is now cookie-based: seeding happens via the real
 *     `authService.login()` flow (no localStorage seed).
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiVentasService } from './api-ventas.service';
import { AuthService } from '../services/auth.service';
import { credentialsInterceptor } from '../interceptors/credentials.interceptor';
import { httpErrorInterceptor } from '../interceptors/http-error.interceptor';
import { NotificationService } from '../services/notification.service';
import { CrearVentaPayload, Venta } from '../models/venta.models';
import { Usuario } from '../models/inventario.models';
import { environment } from '../../../environments/environment';

const API_VENTAS = `${environment.apiBaseUrl}/api/ventas`;
const LOGIN_URL = `${environment.apiBaseUrl}/api/auth/login`;
const LOGOUT_URL = `${environment.apiBaseUrl}/api/auth/logout`;

const payload: CrearVentaPayload = {
  clienteId: 7,
  detalles: [
    { productoId: 1, cantidad: 2, precioUnitario: 100 },
  ],
  pagos: [{ monto: 200, metodoPagoId: 1 }],
  observacion: 'Test venta',
  cantidadCuotas: 3,
  frecuencia: 'Mensual',
  fechaInicioCredito: '2026-09-18',
};

const mockVenta: Venta = {
  id: 99,
  clienteId: 7,
  clienteNombre: 'Cliente Test',
  fecha: '2026-09-18T12:00:00Z',
  montoTotal: 200,
  saldoPendiente: 200,
  estadoPago: 'Pendiente',
  esCredito: true,
  cantidadCuotas: 3,
  frecuencia: 'Mensual',
  fechaInicioCredito: '2026-09-18',
};

const mockUsuario: Usuario = {
  id: 1,
  email: 'u@test',
  nombreCompleto: 'U',
  rol: 'Operador',
};

describe('ApiVentasService (REQ-TEST-004)', () => {
  let httpTesting: HttpTestingController;
  let service: ApiVentasService;
  let authService: AuthService;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigateByUrl', 'createUrlTree']);
    routerSpy.navigateByUrl.and.returnValue(Promise.resolve(true));
    routerSpy.createUrlTree.and.returnValue({} as ReturnType<Router['createUrlTree']>);
    // router.url is read by httpErrorInterceptor to decide whether to
    // show a toast; default to /ventas so the interceptor proceeds.
    Object.defineProperty(routerSpy, 'url', {
      get: () => '/ventas',
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([credentialsInterceptor, httpErrorInterceptor])),
        provideHttpClientTesting(),
        // NotificationService is injected by httpErrorInterceptor; we
        // provide a real instance — it only writes to its own toasts
        // signal which we don't observe here.
        NotificationService,
        { provide: Router, useValue: routerSpy },
        AuthService,
        ApiVentasService,
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ApiVentasService);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('post_ventas_returns_response_on_success', async () => {
    // GIVEN: a `CrearVentaPayload` with one detalle and three cuotas.
    // WHEN: registrarVenta(payload) is called.
    const ventaPromise = firstValueFrom(service.registrarVenta(payload));

    // THEN: one POST /api/ventas carries the JSON payload.
    const req = httpTesting.expectOne(API_VENTAS);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);

    // AND: when the server replies 201 with a Venta, the observable
    // emits that Venta.
    req.flush(mockVenta, { status: 201, statusText: 'Created' });
    const venta = await ventaPromise;
    expect(venta).toEqual(mockVenta);
  });

  it('post_ventas_on_401_triggers_logout', async () => {
    // GIVEN: a logged-in user so the interceptor has a session to
    // tear down. The httpErrorInterceptor only emits the logout path
    // when status === 401 AND we are not already on /login (see
    // http-error.interceptor.ts).
    //
    // Cookie-based auth: seed via the real login flow. The login
    // response body is the Usuario profile only.
    const loginPromise = authService.login('u@test', 'secret');
    const loginReq = httpTesting.expectOne(LOGIN_URL);
    expect(loginReq.request.method).toBe('POST');
    loginReq.flush(mockUsuario);
    await loginPromise;
    expect(authService.isAuthenticated()).toBeTrue();

    // WHEN: registrarVenta(payload) is called and the server replies 401.
    const ventaPromise = firstValueFrom(service.registrarVenta(payload));

    const req = httpTesting.expectOne(API_VENTAS);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

    // The interceptor re-emits the error to the caller; the observable
    // errors out — we await the rejection so the test does not appear
    // as an uncaught-error failure.
    await expectAsync(ventaPromise).toBeRejected();

    // THEN: AuthService.logout(true) issued POST /api/auth/logout to
    // clear the server cookie. The interceptor fires the request
    // immediately (without waiting for the caller to subscribe).
    const logoutReq = httpTesting.expectOne(LOGOUT_URL);
    expect(logoutReq.request.method).toBe('POST');
    logoutReq.flush(null, { status: 204, statusText: 'No Content' });

    // Flush microtasks so the logout() async continuation runs:
    // firstValueFrom resolves, then _currentUser.set(null) +
    // router.navigateByUrl('/login') execute.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // AND: the auth chain cleared the session and navigated to /login.
    expect(authService.currentUser()).toBeNull();
    expect(authService.isAuthenticated()).toBeFalse();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('preview_plan_sends_selected_frequency', () => {
    service.previewPlan(90, 3, '2026-09-21', 'Diario').subscribe();

    const req = httpTesting.expectOne(`${API_VENTAS}/preview-plan?total=90&cantidadCuotas=3&fechaInicio=2026-09-21&frecuencia=Diario`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('frecuencia')).toBe('Diario');
    req.flush([]);
  });

  it('listar_deudas_sends_the_payment_status_filter', () => {
    service.listarDeudas({ desde: null, hasta: null, clienteId: null, estadoPago: 'Parcial' }).subscribe();

    const req = httpTesting.expectOne(`${API_VENTAS}/deudas?estadoPago=Parcial`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('post_anular_abono_uses_finalized_cancellation_contract', () => {
    service.anularAbono(99, 12).subscribe();

    const req = httpTesting.expectOne(`${API_VENTAS}/99/abonos/12/anular`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('post_anular_venta_uses_finalized_cancellation_contract', () => {
    service.anularVenta(99).subscribe();

    const req = httpTesting.expectOne(`${API_VENTAS}/99/anular`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
