import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';

import { ReportesComponent } from './reportes.component';
import { ProductosState } from '../../core/state/productos.state';
import { CatalogosState } from '../../core/state/catalogos.state';
import { KardexState } from '../../core/state/kardex.state';
import { KpisState } from '../../core/state/kpis.state';
import { ApiReportesService } from '../../core/api/api-reportes.service';
import { ApiAuthService } from '../../core/api/api-auth.service';
import { environment } from '../../../environments/environment';
import type { RentabilidadResponse } from './wac/rentabilidad.dtos';

const unavailableResponse: RentabilidadResponse = {
  desde: '2026-09-01', hasta: '2026-09-30', generadoEn: '2026-09-30T00:00:00Z',
  totales: { revenue: 100, cogs: null, gananciaNeta: null, margenPorcentaje: null, ventaCount: 1, productosConCostoFaltante: 1, productosCuarentenados: 0 },
  lineas: [{ productoId: 1, productoCodigo: 'P-1', productoNombre: 'Unknown cost', categoriaId: null, categoriaNombre: null, marcaId: null, marcaNombre: null, unidadesVendidas: 1, ventaCount: 1, revenue: 100, cogs: null, gananciaNeta: null, margenPorcentaje: null, completitud: 'ConCostoFaltante' }],
};

describe('ReportesComponent', () => {
  let fixture: ComponentFixture<ReportesComponent>;
  let originalReportesConWac: boolean;

  beforeEach(() => {
    originalReportesConWac = environment.reportesConWac;
    TestBed.configureTestingModule({
      imports: [ReportesComponent],
      // RENT-NAV-01: ReportesComponent is mounted at both /reportes and
      // /reportes/rentabilidad-wac so the focused active-state spec can
      // navigate between URLs without unmounting the template.
      providers: [
        provideRouter([
          { path: 'reportes', component: ReportesComponent },
          { path: 'reportes/rentabilidad-wac', component: ReportesComponent },
        ]),
        { provide: ProductosState, useValue: { productos: signal([]), productosSelector: signal([]) } },
        { provide: CatalogosState, useValue: { marcas: signal([]), categorias: signal([]), cargarCatalogos: () => Promise.resolve() } },
        { provide: KardexState, useValue: { listarMovimientos: () => Promise.resolve({ items: [] }) } },
        { provide: KpisState, useValue: {} },
        { provide: ApiAuthService, useValue: { usuarios: () => of([]) } },
        { provide: ApiReportesService, useValue: {
          kpiResumen: () => of({}), topVendidos: () => of({ items: [] }), topClientes: () => of([]),
          stockCriticoEstancados: () => of({ stockCritico: [], productosEstancados: [] }),
          rentabilidad: () => of(unavailableResponse),
          historialCliente: () => of({ clienteId: 1, clienteNombre: 'Customer', items: [], page: 1, size: 50, totalItems: 0 }),
        } },
      ],
    });
    fixture = TestBed.createComponent(ReportesComponent);
  });

  afterEach(() => {
    environment.reportesConWac = originalReportesConWac;
  });

  it('renders null COGS and profit as unavailable instead of zero', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    for (const selector of ['[data-testid="legacy-cogs-total"]', '[data-testid="legacy-profit-total"]', '[data-testid="legacy-cogs-line"]', '[data-testid="legacy-profit-line"]']) {
      const text = (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent ?? '';
      expect(text).toContain('No disponible');
      expect(text).not.toContain('0.00');
    }
  }));

  it('renders the sale-level customer history contract', async () => {
    const api = TestBed.inject(ApiReportesService) as unknown as { historialCliente: jasmine.Spy };
    api.historialCliente = jasmine.createSpy().and.returnValue(of({
      clienteId: 7,
      clienteNombre: 'Customer',
      items: [{ id: 11, fecha: '2026-09-26T10:00:00Z', montoTotal: 125.5, estadoPago: 'Pagado', esCredito: false, detalles: [] }],
      page: 1,
      size: 50,
      totalItems: 1,
    }));

    await (fixture.componentInstance as any).verHistorialCliente(7, 'Customer');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('125.50');
    expect(text).toContain('Pagado');
    expect(text).toContain('Contado');
    expect(text).not.toContain('Producto Vendido');
  });

  describe('RENT-NAV-01: WAC profitability nav link', () => {
    function renderFresh(): void {
      // Re-create the fixture so the `reportesConWac` readonly field is
      // re-initialized against the (possibly mutated) environment value.
      fixture.destroy();
      fixture = TestBed.createComponent(ReportesComponent);
      fixture.detectChanges();
      tick();
    }

    it('exposes a link in the header pointing to /reportes/rentabilidad-wac when reportesConWac=true', fakeAsync(() => {
      environment.reportesConWac = true;
      renderFresh();

      const link = fixture.nativeElement.querySelector('[data-testid="nav-rentabilidad-wac"]') as HTMLAnchorElement | null;
      expect(link).withContext('link must render when the flag is on').not.toBeNull();
      expect(link!.getAttribute('href')).toContain('/reportes/rentabilidad-wac');
      expect(link!.getAttribute('aria-label')).toBe('Abrir Rentabilidad WAC');
      expect(link!.textContent ?? '').toContain('Rentabilidad WAC');
      expect(link!.classList.contains('is-active')).withContext('not active while on /reportes').toBe(false);
    }));

    it('hides the link when reportesConWac=false so the guard is the sole gate', fakeAsync(() => {
      environment.reportesConWac = false;
      renderFresh();

      const link = fixture.nativeElement.querySelector('[data-testid="nav-rentabilidad-wac"]');
      expect(link).withContext('link must not render when the staged-rollout flag is off').toBeNull();
    }));

    it('adds the is-active class when the current URL is exactly /reportes/rentabilidad-wac', fakeAsync(() => {
      environment.reportesConWac = true;
      renderFresh();

      const router = TestBed.inject(Router);
      void router.navigateByUrl('/reportes/rentabilidad-wac');
      tick();
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector('[data-testid="nav-rentabilidad-wac"]') as HTMLAnchorElement | null;
      expect(link).withContext('link must still render after navigation').not.toBeNull();
      expect(link!.classList.contains('is-active'))
        .withContext('routerLinkActive must mark the link active on exact URL match')
        .toBe(true);
    }));

    it('keeps the link inactive on parent /reportes and the root redirect', fakeAsync(() => {
      environment.reportesConWac = true;
      renderFresh();

      const router = TestBed.inject(Router);
      void router.navigateByUrl('/reportes');
      tick();
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector('[data-testid="nav-rentabilidad-wac"]') as HTMLAnchorElement | null;
      expect(link).withContext('link must render on /reportes').not.toBeNull();
      expect(link!.classList.contains('is-active'))
        .withContext('exact:true must keep the link inactive on /reportes')
        .toBe(false);
    }));
  });
});
