import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { ApiProductosService } from '../../../core/api/api-productos.service';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { Cliente } from '../../../core/models/cliente.models';
import { Venta } from '../../../core/models/venta.models';
import { NotificationService } from '../../../core/services/notification.service';
import { PuntoVentaComponent } from './punto-venta.component';

describe('PuntoVentaComponent credit sales', () => {
  let fixture: ComponentFixture<PuntoVentaComponent>;
  let component: PuntoVentaComponent;
  let apiVentas: jasmine.SpyObj<ApiVentasService>;
  let notification: jasmine.SpyObj<NotificationService>;

  const client: Cliente = {
    id: 1,
    nombre: 'Credit customer',
    documento: null,
    telefono: null,
    email: null,
    direccion: null,
    tipoDocumentoId: 1,
    tipoDocumentoNombre: 'DNI',
    creadoEn: '2026-09-21T00:00:00Z',
    tieneDeuda: true,
  };

  beforeEach(() => {
    apiVentas = jasmine.createSpyObj<ApiVentasService>('ApiVentasService', [
      'listar', 'listarMetodosPago', 'previewPlan', 'registrarVenta',
    ]);
    apiVentas.listar.and.returnValue(of([]));
    apiVentas.listarMetodosPago.and.returnValue(of([]));
    apiVentas.previewPlan.and.returnValue(of([]));
    apiVentas.registrarVenta.and.returnValue(of({} as Venta));

    notification = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [PuntoVentaComponent],
      providers: [
        { provide: ApiVentasService, useValue: apiVentas },
        { provide: ApiClientesService, useValue: { listar: () => of([]), crear: () => of(client) } },
        { provide: ApiProductosService, useValue: { selector: () => of([]) } },
        { provide: NotificationService, useValue: notification },
      ],
    });

    fixture = TestBed.createComponent(PuntoVentaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function configureCreditSale(initialPayment: number): void {
    const instance = component as any;
    instance.clientes.set([client]);
    instance.productos.set([{ id: 10, nombre: 'Product', codigoBarra: null, stockActual: 5, stockMinimo: 1, precioVentaSugerido: 100 }]);
    instance.formVenta.patchValue({ clienteId: client.id });
    instance.onProductoSeleccionado(10);
    instance.toggleEsCredito(true);
    instance.cantidadCuotas.set(3);
    instance.fechaInicioCredito.set('2026-09-21');
    instance.frecuencia.set('Diario');
    instance.pagoInicialCredito.set(initialPayment);
    instance.abrirPOS();
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('submits a credit sale with a down payment despite the zero payment placeholder', () => {
    configureCreditSale(10);

    expect((component as any).pagoInvalido()).toBeFalse();

    (component as any).procesarVenta();

    expect(notification.error).not.toHaveBeenCalled();
    expect(apiVentas.registrarVenta).toHaveBeenCalledWith(jasmine.objectContaining({
      pagos: [{ monto: 10, metodoPagoId: 1 }],
      cantidadCuotas: 3,
      frecuencia: 'Diario',
    }));
  });

  it('uses the financed balance and selected frequency for the plan preview', () => {
    configureCreditSale(10);

    expect(apiVentas.previewPlan).toHaveBeenCalledWith(90, 3, '2026-09-21', 'Diario');
    expect(fixture.nativeElement.textContent).toContain('frecuencia Diario');
  });

  it('allows a credit sale without an initial payment', () => {
    configureCreditSale(0);

    expect((component as any).pagoInvalido()).toBeFalse();
  });

  it('uses the selected active payment method for an initial payment', () => {
    configureCreditSale(10);
    (component as any).metodoPagoInicialId.set(4);

    (component as any).procesarVenta();

    expect(apiVentas.registrarVenta).toHaveBeenCalledWith(jasmine.objectContaining({
      pagos: [{ monto: 10, metodoPagoId: 4 }],
    }));
  });

  it('resets the initial payment and frequency when the POS closes', () => {
    configureCreditSale(10);
    const instance = component as any;

    instance.cerrarPOS();

    expect(instance.pagoInicialCredito()).toBe(0);
    expect(instance.metodoPagoInicialId()).toBe(1);
    expect(instance.frecuencia()).toBe('Mensual');
  });
});
