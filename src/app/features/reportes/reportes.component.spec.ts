import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';

import { ReportesComponent } from './reportes.component';
import { ProductosState } from '../../core/state/productos.state';
import { CatalogosState } from '../../core/state/catalogos.state';
import { KardexState } from '../../core/state/kardex.state';
import { KpisState } from '../../core/state/kpis.state';
import { ApiReportesService } from '../../core/api/api-reportes.service';
import { ApiAuthService } from '../../core/api/api-auth.service';
import type { RentabilidadResponse } from './wac/rentabilidad.dtos';

const unavailableResponse: RentabilidadResponse = {
  desde: '2026-09-01', hasta: '2026-09-30', generadoEn: '2026-09-30T00:00:00Z',
  totales: { revenue: 100, cogs: null, gananciaNeta: null, margenPorcentaje: null, ventaCount: 1, productosConCostoFaltante: 1, productosCuarentenados: 0 },
  lineas: [{ productoId: 1, productoCodigo: 'P-1', productoNombre: 'Unknown cost', categoriaId: null, categoriaNombre: null, marcaId: null, marcaNombre: null, unidadesVendidas: 1, ventaCount: 1, revenue: 100, cogs: null, gananciaNeta: null, margenPorcentaje: null, completitud: 'ConCostoFaltante' }],
};

describe('ReportesComponent', () => {
  let fixture: ComponentFixture<ReportesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReportesComponent],
      providers: [
        { provide: ProductosState, useValue: { productos: signal([]), productosSelector: signal([]) } },
        { provide: CatalogosState, useValue: { marcas: signal([]), categorias: signal([]), cargarCatalogos: () => Promise.resolve() } },
        { provide: KardexState, useValue: { listarMovimientos: () => Promise.resolve({ items: [] }) } },
        { provide: KpisState, useValue: {} },
        { provide: ApiAuthService, useValue: { usuarios: () => of([]) } },
        { provide: ApiReportesService, useValue: {
          kpiResumen: () => of({}), topVendidos: () => of({ items: [] }), topClientes: () => of([]),
          stockCriticoEstancados: () => of({ stockCritico: [], productosEstancados: [] }),
          rentabilidad: () => of(unavailableResponse),
        } },
      ],
    });
    fixture = TestBed.createComponent(ReportesComponent);
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
});
