import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { KardexPageComponent } from './kardex-page.component';
import { ProductosState } from '../../core/state/productos.state';
import { CatalogosState } from '../../core/state/catalogos.state';
import { KardexState } from '../../core/state/kardex.state';
import { ApiAuthService } from '../../core/api/api-auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import type { Movimiento } from '../../core/models/inventario.models';

const sampleMovimiento: Movimiento = {
  id: 42,
  productoId: 1,
  productoNombre: 'Producto demo',
  tipoMovimientoId: 2,
  tipoMovimientoDescripcion: 'SALIDA',
  cantidad: 3,
  precioUnitario: 10,
  fecha: '2026-09-26T10:00:00Z',
  observacion: 'observacion previa',
  creadoPorId: 1,
  creadoPorNombre: 'operador',
} as Movimiento;

function makeHttpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: status === 400 ? 'Bad Request' : 'Error',
    error: body,
    url: '/api/movimientos/42',
  });
}

/**
 * Crea una Promise rechazada con un handler noop adjunto para que
 * jasmine/karma no la marque como "unhandled" antes de que el `await`
 * del componente la consuma via try/catch.
 */
function rejectedPromise<T = never>(value: unknown): Promise<T> {
  const p = Promise.reject(value) as Promise<T>;
  p.catch(() => {});
  return p;
}

describe('KardexPageComponent - error translation in edit/delete modals', () => {
  let fixture: ComponentFixture<KardexPageComponent>;
  let notify: { success: jasmine.Spy; error: jasmine.Spy };
  let actualizarSpy: jasmine.Spy;
  let eliminarSpy: jasmine.Spy;
  let listarSpy: jasmine.Spy;

  beforeEach(() => {
    notify = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };
    actualizarSpy = jasmine.createSpy('actualizarMovimiento').and.returnValue(Promise.resolve());
    eliminarSpy = jasmine.createSpy('eliminarMovimiento').and.returnValue(Promise.resolve());
    listarSpy = jasmine.createSpy('listarMovimientos').and.returnValue(
      Promise.resolve({ items: [], page: 1, size: 50, totalItems: 0, totalPages: 0 })
    );

    TestBed.configureTestingModule({
      imports: [KardexPageComponent],
      providers: [
        provideRouter([]),
        { provide: ProductosState, useValue: {
            productos: signal([]),
            productosSelector: signal([]),
            cargarSelectorProductos: () => Promise.resolve(),
            actualizarMovimiento: actualizarSpy,
            eliminarMovimiento: eliminarSpy,
          } },
        { provide: CatalogosState, useValue: {
            marcas: signal([]),
            categorias: signal([]),
            cargarCatalogos: () => Promise.resolve(),
          } },
        { provide: KardexState, useValue: { listarMovimientos: listarSpy } },
        { provide: ApiAuthService, useValue: { usuarios: () => Promise.resolve([]) } },
        { provide: NotificationService, useValue: notify },
        { provide: AuthService, useValue: { esAdmin: () => false } },
      ],
    });
  });

  function setMovimientoEnEdicion(m: Movimiento): void {
    (fixture.componentInstance as unknown as { movimientoAEditar: { set: (v: Movimiento | null) => void } })
      .movimientoAEditar.set(m);
    const c = fixture.componentInstance as unknown as { editCantidad: number; editPrecio: number; editObservacion: string };
    c.editCantidad = m.cantidad;
    c.editPrecio = m.precioUnitario;
    c.editObservacion = m.observacion ?? '';
  }

  function setMovimientoAEliminar(m: Movimiento): void {
    (fixture.componentInstance as unknown as { movimientoAEliminar: { set: (v: Movimiento | null) => void } })
      .movimientoAEliminar.set(m);
  }

  it('guardarEdicion translates a 400 ValidationProblem into the field message, not the browser HttpErrorResponse.message', fakeAsync(() => {
    actualizarSpy.and.returnValue(rejectedPromise(
      makeHttpError(400, {
        title: 'One or more validation errors occurred.',
        detail: 'See /swagger for the API contract.',
        errors: { Cantidad: ['La cantidad debe ser mayor o igual a 1.'] },
      })
    ));

    fixture = TestBed.createComponent(KardexPageComponent);
    fixture.detectChanges();
    tick();
    setMovimientoEnEdicion(sampleMovimiento);

    (fixture.componentInstance as unknown as { guardarEdicion: () => Promise<void> })
      .guardarEdicion();
    tick();

    expect(notify.error).toHaveBeenCalledTimes(1);
    const mensaje = notify.error.calls.mostRecent().args[0] as string;
    // Mensaje util del backend, no el string generico del browser.
    expect(mensaje).toContain('Cantidad');
    expect(mensaje).toContain('mayor o igual a 1');
    expect(mensaje).not.toContain('Http failure response');
    expect(mensaje).not.toContain('400 Bad Request');
    // notify.success NO debe haberse llamado porque la operacion fallo.
    expect(notify.success).not.toHaveBeenCalled();
  }));

  it('guardarEdicion translates a 400 plain detail string', fakeAsync(() => {
    actualizarSpy.and.returnValue(rejectedPromise(
      makeHttpError(400, 'Los movimientos de venta no se pueden modificar.')
    ));

    fixture = TestBed.createComponent(KardexPageComponent);
    fixture.detectChanges();
    tick();
    setMovimientoEnEdicion(sampleMovimiento);

    (fixture.componentInstance as unknown as { guardarEdicion: () => Promise<void> })
      .guardarEdicion();
    tick();

    const mensaje = notify.error.calls.mostRecent().args[0] as string;
    expect(mensaje).toBe('Los movimientos de venta no se pueden modificar.');
    expect(mensaje).not.toContain('Http failure response');
  }));

  it('ejecutarEliminacion translates a 409 FK constraint into a friendly message', fakeAsync(() => {
    eliminarSpy.and.returnValue(rejectedPromise(
      makeHttpError(500, {
        // Sin title/detail: translate() cae en el branch #4 (EF exceptionMessage).
        exceptionMessage:
          'The DELETE statement conflicted with the REFERENCE constraint "FK_MovimientosInventario_Productos_ProductoId".',
      })
    ));

    fixture = TestBed.createComponent(KardexPageComponent);
    fixture.detectChanges();
    tick();
    setMovimientoAEliminar(sampleMovimiento);

    (fixture.componentInstance as unknown as { ejecutarEliminacion: () => Promise<void> })
      .ejecutarEliminacion();
    tick();

    const mensaje = notify.error.calls.mostRecent().args[0] as string;
    expect(mensaje).toContain('No se puede eliminar');
    expect(mensaje).not.toContain('Http failure response');
    expect(mensaje).not.toContain('REFERENCE constraint');
  }));

  it('guardarEdicion success path calls notify.success and skips notify.error', fakeAsync(() => {
    fixture = TestBed.createComponent(KardexPageComponent);
    fixture.detectChanges();
    tick();
    setMovimientoEnEdicion(sampleMovimiento);

    (fixture.componentInstance as unknown as { guardarEdicion: () => Promise<void> })
      .guardarEdicion();
    tick();

    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.error).not.toHaveBeenCalled();
    // La modal debe haberse cerrado.
    const edit = (fixture.componentInstance as unknown as { movimientoAEditar: () => unknown }).movimientoAEditar();
    expect(edit).toBeNull();
  }));
});
