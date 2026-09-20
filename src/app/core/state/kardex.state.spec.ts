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
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { KardexState } from './kardex.state';
import { ShellState } from './shell.state';
import { Movimiento } from '../models/inventario.models';
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

    const req = httpTesting.expectOne((r) => r.url === KARDEX_URL && r.params.get('productoId') === '42');
    expect(req.request.method).toBe('GET');
    req.flush([makeMovimiento(1), makeMovimiento(2)]);
    await promise;

    expect(kardex.kardexCargando()).toBe(false);
    expect(kardex.kardexMovimientos().length).toBe(2);
    expect(kardex.kardexMovimientos()[0].id).toBe(1);
  });

  it('cerrarKardexModal() resets productoId and movimientos', async () => {
    const promise = kardex.abrirKardexModal(99);
    httpTesting.expectOne((r) => r.url === KARDEX_URL).flush([makeMovimiento(1)]);
    await promise;

    expect(kardex.kardexProductoId()).toBe(99);
    expect(kardex.kardexMovimientos().length).toBe(1);

    kardex.cerrarKardexModal();

    expect(kardex.kardexProductoId()).toBeNull();
    expect(kardex.kardexMovimientos()).toEqual([]);
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
});