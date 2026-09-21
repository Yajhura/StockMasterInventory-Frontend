import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { VentaDetallada } from '../../../core/models/venta.models';
import { NotificationService } from '../../../core/services/notification.service';
import { CuentasCorrientesComponent } from './cuentas-corrientes.component';

describe('CuentasCorrientesComponent cancellations', () => {
  let fixture: ComponentFixture<CuentasCorrientesComponent>;
  let component: CuentasCorrientesComponent;
  let apiVentas: jasmine.SpyObj<ApiVentasService>;
  let notification: jasmine.SpyObj<NotificationService>;

  const venta: VentaDetallada = {
    id: 12,
    clienteId: 7,
    clienteNombre: 'Cliente Test',
    fecha: '2026-09-21T12:00:00Z',
    montoTotal: 100,
    saldoPendiente: 40,
    estadoPago: 'Parcial',
    esCredito: true,
    cantidadCuotas: 2,
    frecuencia: 'Mensual',
    fechaInicioCredito: '2026-09-21',
    detalles: [],
    abonos: [{
      id: 8,
      monto: 60,
      fecha: '2026-09-21T12:00:00Z',
      metodoPagoId: 1,
      metodoPagoNombre: 'Efectivo',
      observacion: null,
      estado: 'Pagado',
      eliminadoEn: null,
    }],
    cuotas: [{
      id: 4,
      numero: 2,
      monto: 7.5,
      montoPagado: 2.5,
      montoPendiente: 5,
      fechaVencimiento: '2026-10-01',
      fechaPago: null,
      estado: 'Parcial',
      eliminadoEn: null,
    }],
  };

  beforeEach(() => {
    apiVentas = jasmine.createSpyObj<ApiVentasService>('ApiVentasService', [
      'listarDeudas', 'kpisCobranza', 'obtener', 'registrarAbono', 'anularAbono', 'anularVenta',
    ]);
    apiVentas.listarDeudas.and.returnValue(of([]));
    apiVentas.kpisCobranza.and.returnValue(of({ deudaTotal: 0, clientesConDeuda: 0, deudaVencida: 0, cuotasVencenProximas: 0 }));
    apiVentas.obtener.and.returnValue(of(venta));
    apiVentas.anularAbono.and.returnValue(of(void 0));
    apiVentas.anularVenta.and.returnValue(of(void 0));
    notification = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [CuentasCorrientesComponent],
      providers: [
        { provide: ApiVentasService, useValue: apiVentas },
        { provide: ApiClientesService, useValue: { listar: () => of([]) } },
        { provide: NotificationService, useValue: notification },
      ],
    });

    fixture = TestBed.createComponent(CuentasCorrientesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('cancels an active payment and refreshes current accounts, KPIs, and history', () => {
    const instance = component as any;
    instance.ventaDetallada.set(venta);

    instance.solicitarAnulacionAbono(venta.abonos[0]);
    instance.confirmarAnulacionAbono();

    expect(apiVentas.anularAbono).toHaveBeenCalledWith(12, 8);
    expect(notification.success).toHaveBeenCalledWith('Abono anulado exitosamente');
    expect(apiVentas.listarDeudas).toHaveBeenCalledTimes(2);
    expect(apiVentas.kpisCobranza).toHaveBeenCalledTimes(2);
    expect(apiVentas.obtener).toHaveBeenCalledWith(12);
  });

  it('shows paid and pending amounts for a partially allocated installment', () => {
    const instance = component as any;
    instance.modalDetalleAbierto.set(true);
    instance.ventaDetallada.set(venta);
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Parcial');
    expect(content).toContain('S/ 2.50');
    expect(content).toContain('S/ 5.00');
  });

  it('loads credit installments and defaults the payment to the first pending installment', () => {
    const instance = component as any;

    instance.abrirModalAbono(venta);

    expect(apiVentas.obtener).toHaveBeenCalledWith(12);
    expect(instance.modoAbonoCredito()).toBe('cuota-vigente');
    expect(instance.formAbono.controls.monto.value).toBe(5);
    expect(instance.cuotasAfectadas()).toEqual([{ numero: 2, monto: 5 }]);
  });

  it('advances only consecutive pending installments in FIFO order', () => {
    const instance = component as any;
    const detalleConCuotas = {
      ...venta,
      cuotas: [
        { ...venta.cuotas[0], id: 3, numero: 1, monto: 4, montoPagado: 0, montoPendiente: 4, fechaVencimiento: '2026-09-25', estado: 'Pendiente' },
        venta.cuotas[0],
      ],
    };

    instance.abrirModalAbono(detalleConCuotas, detalleConCuotas);
    instance.cantidadCuotasAdelantar.set(2);
    instance.seleccionarModoAbono('adelantar-cuotas');

    expect(instance.formAbono.controls.monto.value).toBe(9);
    expect(instance.cuotasAfectadas()).toEqual([
      { numero: 1, monto: 4 },
      { numero: 2, monto: 5 },
    ]);
  });

  it('shows a FIFO summary for another amount instead of allowing installment selection', () => {
    const instance = component as any;
    const detalleConCuotas = {
      ...venta,
      cuotas: [
        { ...venta.cuotas[0], id: 3, numero: 1, monto: 4, montoPagado: 0, montoPendiente: 4, fechaVencimiento: '2026-09-25', estado: 'Pendiente' },
        venta.cuotas[0],
      ],
    };

    instance.abrirModalAbono(detalleConCuotas, detalleConCuotas);
    instance.formAbono.patchValue({ monto: 6 });
    instance.seleccionarOtroMonto();

    expect(instance.cuotasAfectadas()).toEqual([
      { numero: 1, monto: 4 },
      { numero: 2, monto: 2 },
    ]);
  });

  it('keeps the payment confirmation open and shows the backend error on failure', () => {
    const instance = component as any;
    apiVentas.anularAbono.and.returnValue(throwError(() => ({ error: { error: 'El abono ya fue anulado.' } })));
    instance.ventaDetallada.set(venta);

    instance.solicitarAnulacionAbono(venta.abonos[0]);
    instance.confirmarAnulacionAbono();

    expect(notification.error).toHaveBeenCalledWith('El abono ya fue anulado.');
    expect(instance.abonoAAnular()).toEqual(venta.abonos[0]);
    expect(instance.procesandoAnulacion()).toBeFalse();
  });

  it('cancels the sale and refreshes current accounts and KPIs', () => {
    const instance = component as any;
    instance.modalDetalleAbierto.set(true);
    instance.ventaDetallada.set(venta);

    instance.solicitarAnulacionVenta(venta);
    instance.confirmarAnulacionVenta();

    expect(apiVentas.anularVenta).toHaveBeenCalledWith(12);
    expect(notification.success).toHaveBeenCalledWith('Venta anulada exitosamente');
    expect(apiVentas.listarDeudas).toHaveBeenCalledTimes(2);
    expect(apiVentas.kpisCobranza).toHaveBeenCalledTimes(2);
    expect(instance.modalDetalleAbierto()).toBeFalse();
  });
});
