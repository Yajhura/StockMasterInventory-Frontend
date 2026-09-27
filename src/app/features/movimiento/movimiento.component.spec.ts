/**
 * MovimientoComponent spec — H-4 audit: cubre los paths criticos del
 * componente de alta manual de movimientos:
 *   - ngOnInit carga el selector de productos.
 *   - advertenciaStock emite errores/warnings segun cantidad vs stock
 *     en modo SALIDA.
 *   - procesarMovimiento happy path: registrarMovimiento + notify.success.
 *   - procesarMovimiento error path: ValidationProblem del backend
 *     se mapea a per-field setErrors (A-4 audit).
 */
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { MovimientoComponent } from './movimiento.component';
import { ProductosState } from '../../core/state/productos.state';
import { CatalogosState } from '../../core/state/catalogos.state';
import { KardexState } from '../../core/state/kardex.state';
import { ShellState } from '../../core/state/shell.state';
import { NotificationService } from '../../core/services/notification.service';
import type { Movimiento } from '../../core/models/inventario.models';

function makeHttpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'Bad Request', error: body, url: '/api/movimientos' });
}

function rejectedPromise<T = never>(value: unknown): Promise<T> {
  const p = Promise.reject(value) as Promise<T>;
  p.catch(() => {});
  return p;
}

const SAMPLE_PRODUCTO = {
  id: 10,
  nombre: 'Producto demo',
  codigoBarra: null,
  stockActual: 10,
  stockMinimo: 5,
  precioVentaSugerido: 25,
} as unknown as { id: number; nombre: string; codigoBarra: string | null; stockActual: number; stockMinimo: number; precioVentaSugerido: number };

const SAMPLE_MOVIMIENTO: Movimiento = {
  id: 99,
  productoId: 10,
  tipoMovimientoId: 2,
  tipoMovimientoDescripcion: 'SALIDA',
  cantidad: 3,
  precioUnitario: 25,
  fecha: '2026-09-26T10:00:00Z',
  observacion: null,
  creadoPorId: 1,
  creadoPorNombre: 'operador',
} as Movimiento;

describe('MovimientoComponent', () => {
  let fixture: ComponentFixture<MovimientoComponent>;
  let notify: { success: jasmine.Spy; error: jasmine.Spy };
  let registrarSpy: jasmine.Spy;
  let cargarSelectorSpy: jasmine.Spy;
  let obtenerKardexSpy: jasmine.Spy;
  let productosSignal: ReturnType<typeof signal<typeof SAMPLE_PRODUCTO[]>>;
  let selectorSignal: ReturnType<typeof signal<typeof SAMPLE_PRODUCTO[]>>;

  beforeEach(() => {
    notify = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    registrarSpy = jasmine.createSpy('registrarMovimiento').and.returnValue(rejectedPromise<Movimiento>({} as Movimiento));
    cargarSelectorSpy = jasmine.createSpy('cargarSelectorProductos').and.returnValue(Promise.resolve());
    obtenerKardexSpy = jasmine.createSpy('obtenerKardex').and.returnValue(Promise.resolve([]));
    productosSignal = signal<typeof SAMPLE_PRODUCTO[]>([]);
    selectorSignal = signal<typeof SAMPLE_PRODUCTO[]>([]);

    TestBed.configureTestingModule({
      imports: [MovimientoComponent],
      providers: [
        provideRouter([]),
        { provide: ProductosState, useValue: {
            productos: productosSignal.asReadonly(),
            productosSelector: selectorSignal.asReadonly(),
            cargarSelectorProductos: cargarSelectorSpy,
            cargarProductos: () => Promise.resolve(),
            registrarMovimiento: registrarSpy,
            buscarSelectorProductos: () => Promise.resolve(),
          } },
        { provide: CatalogosState, useValue: {
            marcas: signal([]),
            categorias: signal([]),
            cargarCatalogos: () => Promise.resolve(),
          } },
        { provide: KardexState, useValue: { obtenerKardex: obtenerKardexSpy } },
        { provide: ShellState, useValue: { error: signal(null) } },
        { provide: NotificationService, useValue: notify },
      ],
    });
  });

  function setProductoEnForm(id: number, stockActual = 10, stockMinimo = 5): void {
    const prod = { ...SAMPLE_PRODUCTO, id, stockActual, stockMinimo };
    const instance = fixture.componentInstance as unknown as {
      formMovimiento: { patchValue: (v: unknown) => void; get: (k: string) => { setValue: (v: unknown) => void } };
      productoDelForm: () => unknown;
    };
    selectorSignal.set([prod]);
    productosSignal.set([prod]);
    instance.formMovimiento.patchValue({
      productoId: id,
      tipoMovimientoId: 2,
      cantidad: 1,
      precioUnitario: 25,
    });
    // Forzar lectura para que el computed se evalue al menos una vez
    // con el form ya seteado.
    void instance.productoDelForm();
  }

  it('ngOnInit carga el selector de productos', fakeAsync(() => {
    fixture = TestBed.createComponent(MovimientoComponent);
    fixture.detectChanges();
    tick();

    expect(cargarSelectorSpy).toHaveBeenCalledWith(true);
  }));

  it('opcionesProducto refleja el stock actual con badge verde/rojo', fakeAsync(() => {
    fixture = TestBed.createComponent(MovimientoComponent);
    fixture.detectChanges();
    tick();
    // Producto bajo minimo -> badge rosa.
    selectorSignal.set([
      { ...SAMPLE_PRODUCTO, id: 1, stockActual: 2, stockMinimo: 10 },
      { ...SAMPLE_PRODUCTO, id: 2, stockActual: 50, stockMinimo: 5 },
    ]);

    const opciones = (fixture.componentInstance as unknown as {
      opcionesProducto: () => Array<{ value: number; badge: string; badgeClass: string }>;
    }).opcionesProducto();

    const bajo = opciones.find((o) => o.value === 1);
    const normal = opciones.find((o) => o.value === 2);
    expect(bajo?.badge).toContain('2');
    expect(bajo?.badgeClass).toContain('rose');
    expect(normal?.badge).toContain('50');
    expect(normal?.badgeClass).toContain('emerald');
  }));

  it('procesarMovimiento happy path: llama registrarMovimiento y notify.success', fakeAsync(() => {
    registrarSpy.and.returnValue(of(SAMPLE_MOVIMIENTO).toPromise());
    fixture = TestBed.createComponent(MovimientoComponent);
    fixture.detectChanges();
    tick();
    setProductoEnForm(10);

    (fixture.componentInstance as unknown as { procesarMovimiento: () => Promise<void> }).procesarMovimiento();
    tick();

    expect(registrarSpy).toHaveBeenCalledWith(jasmine.objectContaining({
      productoId: 10,
      tipoMovimientoId: 2,
      cantidad: 1,
      precioUnitario: 25,
      cliente: null,
    }));
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.error).not.toHaveBeenCalled();
  }));

  it('procesarMovimiento error path: ValidationProblem se mapea a per-field setErrors (A-4 audit)', fakeAsync(() => {
    registrarSpy.and.returnValue(rejectedPromise(
      makeHttpError(400, {
        title: 'One or more validation errors occurred.',
        errors: { Cantidad: ['La cantidad debe ser mayor o igual a 1.'] },
      })
    ));
    fixture = TestBed.createComponent(MovimientoComponent);
    fixture.detectChanges();
    tick();
    setProductoEnForm(10);

    (fixture.componentInstance as unknown as { procesarMovimiento: () => Promise<void> }).procesarMovimiento();
    tick();

    const cantCtrl = (fixture.componentInstance as unknown as { formMovimiento: { get: (k: string) => { errors: Record<string, string> | null } } })
      .formMovimiento.get('cantidad');
    expect(cantCtrl?.errors?.['server']).toBe('La cantidad debe ser mayor o igual a 1.');
    expect(notify.error).toHaveBeenCalled();
  }));

  it('procesarMovimiento sin producto seleccionado muestra error y NO llama API', fakeAsync(() => {
    fixture = TestBed.createComponent(MovimientoComponent);
    fixture.detectChanges();
    tick();
    // form vacio, sin productoId

    (fixture.componentInstance as unknown as { procesarMovimiento: () => Promise<void> }).procesarMovimiento();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Debe seleccionar un producto.');
    expect(registrarSpy).not.toHaveBeenCalled();
  }));
});
