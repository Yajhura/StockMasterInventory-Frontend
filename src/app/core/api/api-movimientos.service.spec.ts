/**
 * ApiMovimientosService spec — regression coverage for REPORT-AUDIT-03.
 *
 * Pins the kardex-by-product contract:
 *   - GET /api/movimientos/kardex with productoId + page=1 + size=50.
 *   - Returns PaginatedResponse<Movimiento> (NOT a bare array).
 *
 * Pins the cliente-history contract (REPORT-AUDIT-02 consumer side):
 *   - api-reportes.service.ts historialCliente emits the documented
 *     { clienteId, clienteNombre, items, page, size, totalItems } envelope.
 *
 * The frontend consumes this from kardex-modal.component.ts and
 * reportes.component.ts; a regression in the URL, query params, or
 * response shape must fail loudly here before the consumer is hit.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { ApiMovimientosService } from './api-movimientos.service';
import { ApiReportesService } from './api-reportes.service';
import { environment } from '../../../environments/environment';

describe('ApiMovimientosService.kardex (REPORT-AUDIT-03)', () => {
  let httpTesting: HttpTestingController;
  let service: ApiMovimientosService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ApiMovimientosService);
  });

  afterEach(() => httpTesting.verify());

  it('issues GET /api/movimientos/kardex with productoId + page=1 + size=50 defaults', (done) => {
    service.kardex(42).subscribe((response) => {
      expect(response.page).toBe(1);
      expect(response.size).toBe(50);
      expect(response.items.length).toBe(1);
      expect(response.items[0].id).toBe(7);
      done();
    });

    const req = httpTesting.expectOne(
      (r) => r.url === `${environment.apiBaseUrl}/api/movimientos/kardex`
        && r.params.get('productoId') === '42'
        && r.params.get('page') === '1'
        && r.params.get('size') === '50'
        && r.params.get('desde') === null
        && r.params.get('hasta') === null,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [{
        id: 7, productoId: 42, productoCodigo: 'cb-7', productoNombre: 'prod-7',
        tipoMovimientoId: 1, tipoMovimientoDescripcion: 'INGRESO',
        cantidad: 1, precioUnitario: 10,
        fecha: '2026-01-01T00:00:00Z',
        cliente: null, observacion: null,
        creadoEn: '2026-01-01T00:00:00Z',
        creadoPorId: null, creadoPorNombre: null,
        esStockInicial: false,
      }],
      page: 1, size: 50, totalItems: 1, totalPages: 1, hasNext: false, hasPrevious: false,
    });
  });

  it('forwards desde / hasta / page / size overrides verbatim', (done) => {
    service.kardex(99, {
      desde: '2026-08-01T00:00:00.000Z',
      hasta: '2026-09-01T00:00:00.000Z',
      page: 3,
      size: 25,
    }).subscribe(() => done());

    const req = httpTesting.expectOne(
      (r) => r.params.get('productoId') === '99'
        && r.params.get('desde') === '2026-08-01T00:00:00.000Z'
        && r.params.get('hasta') === '2026-09-01T00:00:00.000Z'
        && r.params.get('page') === '3'
        && r.params.get('size') === '25',
    );
    req.flush({ items: [], page: 3, size: 25, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: true });
  });
});

describe('ApiReportesService.historialCliente (REPORT-AUDIT-02 consumer)', () => {
  let httpTesting: HttpTestingController;
  let service: ApiReportesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ApiReportesService);
  });

  afterEach(() => httpTesting.verify());

  it('issues GET /api/clientes/{id}/historial-reportes with page + size', (done) => {
    service.historialCliente(7, 2, 25).subscribe((response) => {
      expect(response.clienteId).toBe(7);
      expect(response.clienteNombre).toBe('Audit Customer');
      expect(response.page).toBe(2);
      expect(response.size).toBe(25);
      expect(response.totalItems).toBe(1);
      expect(response.items.length).toBe(1);
      expect(response.items[0].id).toBe(11);
      done();
    });

    const req = httpTesting.expectOne(
      (r) => r.url === `${environment.apiBaseUrl}/api/clientes/7/historial-reportes`
        && r.params.get('page') === '2'
        && r.params.get('size') === '25',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      clienteId: 7,
      clienteNombre: 'Audit Customer',
      items: [{
        id: 11, fecha: '2026-09-26T10:00:00Z', montoTotal: 125.5,
        estadoPago: 'Pagado', esCredito: false, detalles: [],
      }],
      page: 2, size: 25, totalItems: 1,
    });
  });
});

describe('ApiReportesService.topClientes (REPORT-AUDIT-01 consumer)', () => {
  let httpTesting: HttpTestingController;
  let service: ApiReportesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ApiReportesService);
  });

  afterEach(() => httpTesting.verify());

  it('exposes clienteId on each top-cliente row so the Ver Historial button can deep-link', (done) => {
    service.topClientes({ limit: 20 }).subscribe((rows) => {
      expect(rows.length).toBe(2);
      const r1 = rows.find((r) => r.clienteId === 7)!;
      expect(r1.clienteNombre).toBe('Cliente A');
      const r2 = rows.find((r) => r.clienteId === 0)!;
      expect(r2.clienteNombre).toBe('Walk-in');
      done();
    });

    const req = httpTesting.expectOne((r) => r.url === `${environment.apiBaseUrl}/api/reportes/top-clientes`);
    req.flush([
      {
        clienteId: 7, clienteNombre: 'Cliente A',
        totalTransacciones: 3, unidadesCompradas: 5,
        montoTotalComprado: 250, ultimaCompra: '2026-09-26T10:00:00Z',
      },
      {
        clienteId: 0, clienteNombre: 'Walk-in',
        totalTransacciones: 1, unidadesCompradas: 1,
        montoTotalComprado: 50, ultimaCompra: '2026-09-25T10:00:00Z',
      },
    ]);
  });
});
