/**
 * KpisState per-store spec.
 *
 * Covers the contract for the extracted `KpisState`:
 *   - `cargarKpisInventario()` issues a GET to
 *     `/api/reportes/kpis-inventario` and stores the response in the
 *     `kpiInventario` signal.
 *   - In-flight promise cache coalesces concurrent calls.
 *   - `force=true` bypasses both the cache and the loaded-once guard.
 *
 * Mirrors the Karma + Jasmine 5 + `HttpTestingController` pattern used
 * in `inventario.state.spec.ts`.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { KpisState } from './kpis.state';
import { ShellState } from './shell.state';
import { environment } from '../../../environments/environment';

const KPIS_INVENTARIO = `${environment.apiBaseUrl}/api/reportes/kpis-inventario`;

describe('KpisState', () => {
  let httpTesting: HttpTestingController;
  let kpis: KpisState;
  let shell: ShellState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    kpis = TestBed.inject(KpisState);
    shell = TestBed.inject(ShellState);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('issues a GET to /api/reportes/kpis-inventario and stores the response', async () => {
    const promise = kpis.cargarKpisInventario();
    const req = httpTesting.expectOne(KPIS_INVENTARIO);
    expect(req.request.method).toBe('GET');
    req.flush({ totalItems: 5, totalUnidades: 35, productosBajos: 3 });
    await promise;

    expect(kpis.kpiInventario()).toEqual({ totalItems: 5, totalUnidades: 35, productosBajos: 3 });
    expect(kpis.kpisCargando()).toBe(false);
    // Successful load clears any previous error.
    expect(shell.error()).toBeNull();
  });

  it('coalesces concurrent calls into a single HTTP request', async () => {
    const p1 = kpis.cargarKpisInventario();
    const p2 = kpis.cargarKpisInventario();
    const p3 = kpis.cargarKpisInventario();

    // Only one HTTP request is in flight.
    const req = httpTesting.expectOne(KPIS_INVENTARIO);
    req.flush({ totalItems: 1, totalUnidades: 10, productosBajos: 0 });

    await Promise.all([p1, p2, p3]);

    expect(kpis.kpiInventario()).toEqual({ totalItems: 1, totalUnidades: 10, productosBajos: 0 });
  });

  it('skips the network when already loaded and force is false', async () => {
    // First load — populates the cache.
    const first = kpis.cargarKpisInventario();
    httpTesting.expectOne(KPIS_INVENTARIO).flush({ totalItems: 5, totalUnidades: 35, productosBajos: 3 });
    await first;

    // Second call without force — should NOT trigger an HTTP request.
    await kpis.cargarKpisInventario();

    // The data is still cached from the first load. httpTesting.verify()
    // in afterEach will fail if any request is unmatched.
    expect(kpis.kpiInventario()).toEqual({ totalItems: 5, totalUnidades: 35, productosBajos: 3 });
  });

  it('force=true bypasses both the in-flight cache and the loaded-once guard', async () => {
    // First load.
    const first = kpis.cargarKpisInventario();
    httpTesting.expectOne(KPIS_INVENTARIO).flush({ totalItems: 5, totalUnidades: 35, productosBajos: 3 });
    await first;

    // Forced reload — even though we have data, this MUST hit the network.
    const forced = kpis.cargarKpisInventario(true);
    const req = httpTesting.expectOne(KPIS_INVENTARIO);
    expect(req.request.method).toBe('GET');
    req.flush({ totalItems: 7, totalUnidades: 99, productosBajos: 1 });
    await forced;

    expect(kpis.kpiInventario()).toEqual({ totalItems: 7, totalUnidades: 99, productosBajos: 1 });
  });
});