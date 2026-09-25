/**
 * WAC-03 frontend spec — REQ-TEST-WAC03. Mirrors the Karma + Jasmine +
 * `HttpTestingController` pattern from `kpis.state.spec.ts`. Uses
 * `fakeAsync` + `tick(300)` to wait out the 250 ms filter debounce.
 */
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { signal } from '@angular/core';

import { WacRentabilidadPageComponent } from './wac-rentabilidad-page.component';
import { CatalogosState } from '../../../core/state/catalogos.state';
import { environment } from '../../../../environments/environment';
import type { RentabilidadResponse } from './rentabilidad.dtos';

class CatalogosStateStub {
  readonly categorias = signal<{ id: number; nombre: string }[]>([
    { id: 1, nombre: 'Bebidas' },
    { id: 2, nombre: 'Snacks' },
  ]);
  readonly marcas = signal<{ id: number; nombre: string }[]>([{ id: 5, nombre: 'Acme' }]);
  cargarCatalogos = jasmine.createSpy('cargarCatalogos').and.returnValue(Promise.resolve());
}

const API_URL = `${environment.apiBaseUrl}/api/reportes/rentabilidad`;
const matchRentabilidad = (r: { url: string; method: string }) =>
  r.url === API_URL && r.method === 'GET';
const DEBOUNCE = 300;

const mockResponse: RentabilidadResponse = {
  desde: '2026-08-01',
  hasta: '2026-08-31',
  generadoEn: '2026-09-22T12:00:00Z',
  totales: {
    revenue: 12345.67,
    cogs: 8000,
    gananciaNeta: 4345.67,
    margenPorcentaje: 35.21,
    ventaCount: 42,
    productosConCostoFaltante: 1,
    productosCuarentenados: 2,
  },
  lineas: [
    {
      productoId: 100, productoCodigo: 'P-100', productoNombre: 'Producto Alfa',
      categoriaId: 1, categoriaNombre: 'Bebidas', marcaId: 5, marcaNombre: 'Acme',
      unidadesVendidas: 30, ventaCount: 12, revenue: 9000, cogs: 5000, gananciaNeta: 4000,
      margenPorcentaje: 44.44, completitud: 'Completa',
    },
    {
      productoId: 200, productoCodigo: 'P-200', productoNombre: 'Producto Bravo',
      categoriaId: 2, categoriaNombre: 'Snacks', marcaId: null, marcaNombre: null,
      unidadesVendidas: 10, ventaCount: 5, revenue: 0, cogs: 0, gananciaNeta: 0,
      margenPorcentaje: null, completitud: 'ConQuarentena',
    },
  ],
};

/** Helper: drive the component to the loaded state. */
function cargar(fixture: ComponentFixture<WacRentabilidadPageComponent>, http: HttpTestingController): void {
  fixture.detectChanges();
  tick(DEBOUNCE);
  http.expectOne(matchRentabilidad).flush(mockResponse);
  tick();
  fixture.detectChanges();
}

describe('WacRentabilidadPageComponent (WAC-03)', () => {
  let fixture: ComponentFixture<WacRentabilidadPageComponent>;
  let component: WacRentabilidadPageComponent;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, NoopAnimationsModule, RouterTestingModule, WacRentabilidadPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CatalogosState, useClass: CatalogosStateStub },
      ],
    });
    fixture = TestBed.createComponent(WacRentabilidadPageComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('renderiza totales.revenue formateado como moneda (S/. 12,345.67)', fakeAsync(() => {
    cargar(fixture, httpTesting);
    expect(fixture.nativeElement.textContent as string).toContain('S/. 12,345.67');
  }));

  it('renderiza "—" cuando margenPorcentaje es null', fakeAsync(() => {
    cargar(fixture, httpTesting);
    const rowBravo: HTMLElement | null = fixture.nativeElement.querySelector('[data-producto-id="200"]');
    expect(rowBravo).not.toBeNull();
    expect(rowBravo!.textContent).toContain('—');
  }));

  it('renders null COGS and profit as unavailable instead of zero', fakeAsync(() => {
    const unavailable = structuredClone(mockResponse);
    unavailable.totales.cogs = null;
    unavailable.totales.gananciaNeta = null;
    unavailable.lineas[0].cogs = null;
    unavailable.lineas[0].gananciaNeta = null;

    fixture.detectChanges();
    tick(DEBOUNCE);
    httpTesting.expectOne(matchRentabilidad).flush(unavailable);
    tick();
    fixture.detectChanges();

    for (const selector of ['[data-testid="wac-cogs-total"]', '[data-testid="wac-profit-total"]', '[data-testid="wac-cogs-line"]', '[data-testid="wac-profit-line"]']) {
      const text = (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent ?? '';
      expect(text).toContain('No disponible');
      expect(text).not.toContain('0.00');
    }
  }));

  it('aplica wac-row-warning a filas con completitud=ConQuarentena', fakeAsync(() => {
    cargar(fixture, httpTesting);
    const rowBravo: HTMLElement | null = fixture.nativeElement.querySelector('[data-producto-id="200"]');
    const rowAlfa: HTMLElement | null = fixture.nativeElement.querySelector('[data-producto-id="100"]');
    expect(rowBravo).not.toBeNull();
    expect(rowBravo!.classList.contains('wac-row-warning')).toBeTrue();
    expect(rowAlfa!.classList.contains('wac-row-warning')).toBeFalse();
  }));

  it('muestra el chip de warning cuando hay cuarentenados o costo faltante', fakeAsync(() => {
    cargar(fixture, httpTesting);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('2'); // cuarentenados
    expect(text).toContain('1'); // costo faltante
    expect(fixture.nativeElement.querySelector('[data-testid="wac-warning"]')).not.toBeNull();
  }));

  it('emite un nuevo GET cuando cambian los filtros desde/hasta', fakeAsync(() => {
    cargar(fixture, httpTesting);

    const inst = component as unknown as {
      filtrosForm: { patchValue: (v: object) => void };
      aplicarFiltros: () => void;
    };
    inst.filtrosForm.patchValue({ desde: '2026-01-01', hasta: '2026-06-30' });
    inst.aplicarFiltros();
    tick(DEBOUNCE);

    const second = httpTesting.expectOne(matchRentabilidad);
    expect(second.request.params.get('desde')).toBe('2026-01-01');
    expect(second.request.params.get('hasta')).toBe('2026-06-30');
    second.flush(mockResponse);
  }));

  it('consulta el endpoint correcto en ngOnInit y guarda la respuesta', fakeAsync(() => {
    fixture.detectChanges();
    tick(DEBOUNCE);
    const req = httpTesting.expectOne(matchRentabilidad);
    expect(req.request.params.has('desde')).toBeTrue();
    expect(req.request.params.has('hasta')).toBeTrue();
    req.flush(mockResponse);
    tick();
    fixture.detectChanges();

    const inst = component as unknown as { respuesta: () => RentabilidadResponse | null };
    const respuesta = inst.respuesta();
    expect(respuesta).not.toBeNull();
    expect(respuesta!.totales.revenue).toBe(12345.67);
    expect(respuesta!.lineas.length).toBe(2);
  }));
});
