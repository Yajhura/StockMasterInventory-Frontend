/**
 * InventarioState KPI spec — REQ-TEST-003.
 *
 * Originally RED by design (intentional page-slice bug captured in
 * PR-F1 of the test scaffolding change). Turned GREEN by PR-F2 of
 * the `kpi-inventario-server-totals` change, which refactored
 * `InventarioState.kpiInventario` from a `computed` over
 * `_productosPaginados()` to a server-fetched signal that hits
 * `GET /api/reportes/kpis-inventario`.
 *
 * The contract asserted here is unchanged across the fix:
 *
 *   totalItems       = 5   (server-side count over the WHOLE Productos table,
 *                            excluding soft-deleted via the global EF filter)
 *   productosBajos   = 3   (A, B, C all have StockActual <= StockMinimo)
 *   totalUnidades    = 35  (sum over all 5 matching productos: 3+2+5+10+15)
 *
 * Before the fix the page-slice implementation returned
 * `productosBajos = 0, totalUnidades = 25` (only saw page 2). After
 * the fix the values match the asserted contract because the signal
 * is hydrated from the server aggregate, not derived from a page.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { InventarioState } from './inventario.state';
import { ProductoListItem } from '../models/inventario.models';
import { environment } from '../../../environments/environment';

const BUSCAR_URL        = `${environment.apiBaseUrl}/api/productos/buscar`;
const KPIS_INVENTARIO   = `${environment.apiBaseUrl}/api/reportes/kpis-inventario`;

/**
 * Build a `ProductoListItem` shaped exactly like the server response
 * for `/api/productos/buscar`. `stockActual < stockMinimo` means the
 * producto is "stock bajo".
 */
function makeProducto(id: number, stockActual: number, stockMinimo: number): ProductoListItem {
  return {
    id,
    nombre: `prod-${id}`,
    codigoBarra: `cb-${id}`,
    categoriaId: 1,
    marcaId: 1,
    stockActual,
    stockMinimo,
    precioVentaSugerido: 100,
    atributosCount: 0,
    eliminado: false,
    creadoEn: '2026-01-01T00:00:00Z',
    creadoPorId: null,
    creadoPorNombre: null,
    modificadoEn: null,
    modificadoPorId: null,
    modificadoPorNombre: null,
    imagenMime: null,
    imagenDataUrl: null,
  };
}

describe('InventarioState.kpiInventario (REQ-TEST-003)', () => {
  let httpTesting: HttpTestingController;
  let state: InventarioState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        InventarioState,
      ],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    state = TestBed.inject(InventarioState);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('REQ-TEST-003 (RED by design) computes KPIs over totals, not just current page', async () => {
    // GIVEN: 5 productos across 2 pages (page 1 has A/B/C stock-bajo,
    // page 2 has D/E stock-ok). totalItems server-side is 5.
    //
    // Stock distribution: A=3/10, B=2/10, C=5/10 (below minimo) →
    // productosBajos=3, totalUnidades = 3+2+5+10+15 = 35.

    // Start page 1 search — DO NOT await yet, we need to flush the
    // HTTP request first.
    const page1Promise = state.buscarProductos({ page: 1, size: 3 });
    const req1 = httpTesting.expectOne((r) => r.url === BUSCAR_URL && r.params.get('page') === '1');
    expect(req1.request.params.get('size')).toBe('3');
    req1.flush({
      items: [
        makeProducto(1, 3, 10),
        makeProducto(2, 2, 10),
        makeProducto(3, 5, 10),
      ],
      page: 1,
      size: 3,
      totalItems: 5,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false,
    });
    await page1Promise;

    // Page 2: [D(stock=10, min=10), E(stock=15, min=10)] — none below.
    const page2Promise = state.buscarProductos({ page: 2, size: 3 });
    const req2 = httpTesting.expectOne((r) => r.url === BUSCAR_URL && r.params.get('page') === '2');
    req2.flush({
      items: [
        makeProducto(4, 10, 10),
        makeProducto(5, 15, 10),
      ],
      page: 2,
      size: 3,
      totalItems: 5,
      totalPages: 2,
      hasNext: false,
      hasPrevious: true,
    });
    await page2Promise;

    // WHEN: the dashboard requests the server-side aggregate KPIs
    // (this is what `DashboardComponent.ngOnInit` and the 5 mutation
    // reload sites now call).
    const kpisPromise = state.cargarKpisInventario();
    const kpiReq = httpTesting.expectOne(KPIS_INVENTARIO);
    kpiReq.flush({ totalItems: 5, totalUnidades: 35, productosBajos: 3 });
    await kpisPromise;

    // THEN: `kpiInventario()` reflects the server aggregate, not the
    // current page slice.
    const kpis = state.kpiInventario()!;

    // THEN: `totalItems` matches the server (5); `productosBajos` and
    // `totalUnidades` reflect the WHOLE 5-product set, not just the
    // current page.
    //
    //   productosBajos = 3  (A, B, C all < min=10)
    //   totalUnidades  = 35 (3 + 2 + 5 + 10 + 15)
    //
    // The current implementation only sees page 2 (the last `buscar`
    // call), so:
    //   productosBajos (BUG) = 0 (D=10 NOT < 10, E=15 NOT < 10)
    //   totalUnidades (BUG)  = 25 (10 + 15)
    //
    // This is why the spec is RED today: it asserts the correct
    // values, not the buggy ones.
    expect(kpis.totalItems).toBe(5);
    expect(kpis.productosBajos).toBe(3);
    expect(kpis.totalUnidades).toBe(35);
  });
});