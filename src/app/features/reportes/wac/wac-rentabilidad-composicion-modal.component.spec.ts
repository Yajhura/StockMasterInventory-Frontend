/**
 * RENT-BREAKDOWN-02 spec — WacRentabilidadComposicionModalComponent
 * Mirrors the Karma + Jasmine + HttpTestingController pattern from
 * `wac-rentabilidad-page.component.spec.ts`. Modal owns its own fetch:
 * we drive `open()` and `productoId()` inputs and assert the GET URL
 * plus the rendered composition + warning banner.
 */
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { WacRentabilidadComposicionModalComponent } from './wac-rentabilidad-composicion-modal.component';
import { environment } from '../../../../environments/environment';
import type { RentabilidadComposicionResponse } from './rentabilidad-composicion.dtos';

const API_URL = (productoId: number) =>
  `${environment.apiBaseUrl}/api/reportes/rentabilidad/${productoId}/composicion`;
const matchComposicion = (productoId: number) => (r: { url: string; method: string }) =>
  r.url === API_URL(productoId) && r.method === 'GET';
const DEBOUNCE = 0; // modal fetch is synchronous via firstValueFrom; only the effect microtask is async

const mockResponse: RentabilidadComposicionResponse = {
  productoId: 100,
  productoCodigo: 'P-100',
  productoNombre: 'Producto Alfa',
  desde: '2026-09-01',
  hasta: '2026-09-30',
  generadoEn: '2026-09-22T12:00:00Z',
  ingresos: [
    {
      movimientoId: 1, fecha: '2026-09-02T00:00:00Z',
      fechaUtc: '2026-09-02T00:00:00Z', fechaUtcNormalizadaEn: '2026-09-02T00:00:00Z',
      cantidad: 10, precioUnitario: 5, costoTotal: 50, observacion: null, esLegacy: false,
    },
    {
      movimientoId: 2, fecha: '2026-09-05T00:00:00Z',
      fechaUtc: null, fechaUtcNormalizadaEn: null,
      cantidad: 4, precioUnitario: 6, costoTotal: 24, observacion: 'carga manual', esLegacy: true,
    },
  ],
  costosAplicados: [
    {
      movimientoId: 11, ventaId: 555, ventaDetalleId: 7777,
      fecha: '2026-09-15T10:00:00Z',
      fechaUtc: '2026-09-15T10:00:00Z', fechaUtcNormalizadaEn: '2026-09-15T10:00:00Z',
      cantidad: 3, precioUnitario: 12, costoTotal: 18, esLegacy: false,
    },
  ],
  resumen: {
    totalCostoCompras: 74,
    totalUnidadesIngresadas: 14,
    totalCostoAplicadoVentas: 18,
    totalUnidadesVendidas: 3,
    costoPromedioCalculado: 5.2857,
    formulaAplicada: 'Costo promedio del período = Σ(PrecioUnitario × Cantidad) ÷ Σ(Cantidad)',
  },
  warnings: {
    hasLegacyMovimientos: true,
    totalLegacyMovimientos: 1,
    legacyIngresos: 1,
    legacyCostosAplicados: 0,
    mensaje: '1 movimiento(s) del período no tienen FechaUtc normalizada.',
  },
};

describe('WacRentabilidadComposicionModalComponent (RENT-BREAKDOWN-02)', () => {
  let fixture: ComponentFixture<WacRentabilidadComposicionModalComponent>;
  let component: WacRentabilidadComposicionModalComponent;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, WacRentabilidadComposicionModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(WacRentabilidadComposicionModalComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('no emite GET cuando está cerrado', () => {
    fixture.detectChanges();
    httpTesting.expectNone(() => true);
    const overlay = fixture.nativeElement.querySelector('app-modal-overlay');
    expect(overlay).toBeTruthy();
  });

  it('emite GET con desde/hasta cuando se abre con productoId válido', fakeAsync(() => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('productoId', 100);
    fixture.componentRef.setInput('desde', '2026-09-01');
    fixture.componentRef.setInput('hasta', '2026-09-30');
    fixture.detectChanges();
    tick();

    const req = httpTesting.expectOne(matchComposicion(100));
    expect(req.request.params.get('desde')).toBe('2026-09-01');
    expect(req.request.params.get('hasta')).toBe('2026-09-30');
    req.flush(mockResponse);
    tick();
    fixture.detectChanges();
  }));

  it('renderiza la composición (compras, costos aplicados, resumen y fórmula)', fakeAsync(() => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('productoId', 100);
    fixture.componentRef.setInput('desde', '2026-09-01');
    fixture.componentRef.setInput('hasta', '2026-09-30');
    fixture.detectChanges();
    tick();
    httpTesting.expectOne(matchComposicion(100)).flush(mockResponse);
    tick();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Producto Alfa');
    expect(text).toContain('Compras del período');
    expect(text).toContain('Costos aplicados a ventas');
    expect(text).toContain('Resumen WAC del período');
    expect(text).toContain('Fórmula aplicada');
    expect(text).toContain('S/. 74.00');
    expect(text).toContain('S/. 18.00');
    expect(text).toContain('5.2857');

    const ingresoRows = fixture.nativeElement.querySelectorAll('[data-testid="composicion-ingreso-row"]');
    expect(ingresoRows.length).toBe(2);
    const costoRows = fixture.nativeElement.querySelectorAll('[data-testid="composicion-costo-row"]');
    expect(costoRows.length).toBe(1);
  }));

  it('muestra el banner de legacy cuando warnings.hasLegacyMovimientos=true', fakeAsync(() => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('productoId', 100);
    fixture.componentRef.setInput('desde', '2026-09-01');
    fixture.componentRef.setInput('hasta', '2026-09-30');
    fixture.detectChanges();
    tick();
    httpTesting.expectOne(matchComposicion(100)).flush(mockResponse);
    tick();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="composicion-legacy-warning"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('1 movimiento(s) sin FechaUtc normalizada');
    expect(banner!.textContent).toContain('no tienen FechaUtc normalizada');

    // Filas legacy deben tener la clase CSS legacy-row.
    const legacyRows = fixture.nativeElement.querySelectorAll('.legacy-row');
    expect(legacyRows.length).toBe(1, "1 INGRESO legacy en la fixture");
  }));

  it('muestra "Costo promedio: —" cuando el backend devuelve null', fakeAsync(() => {
    const empty = structuredClone(mockResponse);
    empty.resumen.costoPromedioCalculado = null;
    empty.ingresos = [];
    empty.costosAplicados = [];

    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('productoId', 100);
    fixture.componentRef.setInput('desde', '2026-09-01');
    fixture.componentRef.setInput('hasta', '2026-09-30');
    fixture.detectChanges();
    tick();
    httpTesting.expectOne(matchComposicion(100)).flush(empty);
    tick();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No hay compras ni costos aplicados');
    const cell = fixture.nativeElement.querySelector('[data-testid="composicion-costo-promedio"]');
    expect(cell?.textContent?.trim()).toBe('—');
  }));

  it('emite close cuando el backdrop del overlay se dispara', fakeAsync(() => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('productoId', 100);
    fixture.componentRef.setInput('desde', '2026-09-01');
    fixture.componentRef.setInput('hasta', '2026-09-30');
    fixture.detectChanges();
    tick();
    httpTesting.expectOne(matchComposicion(100)).flush(mockResponse);
    tick();
    fixture.detectChanges();

    let emitted = false;
    component.close.subscribe(() => (emitted = true));
    // El botón "Cerrar" del header dispara onBackdropClose → (close).
    const closeBtn: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      'header button[aria-label="Cerrar"]',
    );
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();
    expect(emitted).toBeTrue();
  }));
});