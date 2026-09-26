/**
 * KardexState per-store spec.
 *
 * Covers the contract for the extracted `KardexState`:
 *   - `abrirKardexModal(productoId)` sets `kardexProductoId` and
 *     triggers a GET to `/api/movimientos/kardex?productoId=...`,
 *     populating `kardexMovimientos`.
 *   - `cerrarKardexModal()` resets both `kardexProductoId` and
 *     `kardexMovimientos` to null / empty.
 *   - `kardexCargando` toggles around the fetch.
 *
 * REPORT-AUDIT-03: the endpoint now returns a PaginatedResponse envelope
 * (items/page/size/totalItems/totalPages/hasNext/hasPrevious). The state
 * still flattens to a `Movimiento[]` for the modal but the test MUST
 * exercise the new envelope so a regression on either side is loud.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { KardexState } from './kardex.state';
import { ShellState } from './shell.state';
import { Movimiento, PaginatedResponse } from '../models/inventario.models';
import { environment } from '../../../environments/environment';

const KARDEX_URL = `${environment.apiBaseUrl}/api/movimientos/kardex`;

function makeMovimiento(id: number): Movimiento {
  return {
    id,
    productoId: 42,
    productoCodigo: `cb-${id}`,
    productoNombre: `prod-${id}`,
    tipoMovimientoId: 1,
    tipoMovimientoDescripcion: 'INGRESO',
    cantidad: 1,
    precioUnitario: 10,
    fecha: '2026-01-01T00:00:00Z',
    cliente: null,
    observacion: null,
    creadoEn: '2026-01-01T00:00:00Z',
    creadoPorId: null,
    creadoPorNombre: null,
    esStockInicial: false,
  };
}

function wrapAsPaginated(items: Movimiento[], totalItems?: number): PaginatedResponse<Movimiento> {
  return {
    items,
    page: 1,
    size: items.length || 50,
    totalItems: totalItems ?? items.length,
    totalPages: Math.max(1, Math.ceil((totalItems ?? items.length) / (items.length || 50))),
    hasNext: false,
    hasPrevious: false,
  };
}

describe('KardexState', () => {
  let httpTesting: HttpTestingController;
  let kardex: KardexState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    kardex = TestBed.inject(KardexState);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('abrirKardexModal(productoId) sets the productoId and fetches movements', async () => {
    expect(kardex.kardexProductoId()).toBeNull();
    expect(kardex.kardexMovimientos()).toEqual([]);
    expect(kardex.kardexCargando()).toBe(false);

    const promise = kardex.abrirKardexModal(42);

    // The fetch happens immediately after abrirKardexModal sets the id.
    expect(kardex.kardexProductoId()).toBe(42);
    expect(kardex.kardexCargando()).toBe(true);

    const req = httpTesting.expectOne((r) =>
      r.url === KARDEX_URL &&
      r.params.get('productoId') === '42' &&
      r.params.get('page') === '1' &&
      r.params.get('size') === '50',
    );
    expect(req.request.method).toBe('GET');
    req.flush(wrapAsPaginated([makeMovimiento(1), makeMovimiento(2)]));
    await promise;

    expect(kardex.kardexCargando()).toBe(false);
    expect(kardex.kardexMovimientos().length).toBe(2);
    expect(kardex.kardexMovimientos()[0].id).toBe(1);
  });

  it('cerrarKardexModal() resets productoId and movimientos', async () => {
    const promise = kardex.abrirKardexModal(99);
    httpTesting.expectOne((r) => r.url === KARDEX_URL).flush(wrapAsPaginated([makeMovimiento(1)]));
    await promise;

    expect(kardex.kardexProductoId()).toBe(99);
    expect(kardex.kardexMovimientos().length).toBe(1);

    kardex.cerrarKardexModal();

    expect(kardex.kardexProductoId()).toBeNull();
    expect(kardex.kardexMovimientos()).toEqual([]);
  });

  it('keeps the newest modal request when an older Kardex response arrives last', async () => {
    const firstRequest = kardex.abrirKardexModal(1);
    const firstHttpRequest = httpTesting.expectOne((r) => r.url === KARDEX_URL && r.params.get('productoId') === '1');
    const secondRequest = kardex.abrirKardexModal(2);
    const secondHttpRequest = httpTesting.expectOne((r) => r.url === KARDEX_URL && r.params.get('productoId') === '2');

    secondHttpRequest.flush(wrapAsPaginated([makeMovimiento(2)]));
    firstHttpRequest.flush(wrapAsPaginated([makeMovimiento(1)]));
    await Promise.all([firstRequest, secondRequest]);

    expect(kardex.kardexProductoId()).toBe(2);
    expect(kardex.kardexMovimientos().map((movement) => movement.id)).toEqual([2]);
    expect(kardex.kardexCargando()).toBeFalse();
  });

  it('abrirKardexModal writes to ShellState.error when the fetch fails', async () => {
    const shell = TestBed.inject(ShellState);

    const promise = kardex.abrirKardexModal(7);
    httpTesting.expectOne((r) => r.url === KARDEX_URL).flush(
      { message: 'boom' },
      { status: 500, statusText: 'Server Error' }
    );
    await promise;

    expect(shell.error()).toBeTruthy();
  });

  // REPORT-AUDIT-03 regression: a paginated server response MUST be
  // flattened to a plain Movimiento[] on the consumer side. This is the
  // contract the kardex-modal.component.ts template relies on.
  it('flattens the PaginatedResponse.items into the kardexMovimientos signal', async () => {
    const promise = kardex.abrirKardexModal(11);
    const req = httpTesting.expectOne((r) => r.url === KARDEX_URL);
    req.flush({
      items: [makeMovimiento(101), makeMovimiento(102), makeMovimiento(103)],
      page: 1,
      size: 50,
      totalItems: 3,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
    await promise;

    expect(kardex.kardexMovimientos().length).toBe(3);
    expect(kardex.kardexMovimientos().map((m) => m.id)).toEqual([101, 102, 103]);
  });
});
