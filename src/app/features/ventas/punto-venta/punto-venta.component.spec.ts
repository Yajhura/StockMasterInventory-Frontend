import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { ApiProductosService } from '../../../core/api/api-productos.service';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { Cliente } from '../../../core/models/cliente.models';
import { Venta } from '../../../core/models/venta.models';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductosState } from '../../../core/state/productos.state';
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
    // L-5 audit: completar los campos opcionales para que el mock
    // matchee exactamente la interface Cliente. Si agregamos un campo
    // nuevo al model y lo referenciamos desde el template, TS nos
    // avisa aca (en vez de fallar silenciosamente en runtime).
    creadoPorId: null,
    creadoPorNombre: null,
    modificadoEn: null,
    modificadoPorId: null,
    modificadoPorNombre: null,
    eliminadoEn: null,
    eliminadoPorId: null,
    eliminadoPorNombre: null,
    // L-2 audit (fix #22): contadores de actividad comercial que el
    // backend popula en el response single-cliente. En este mock los
    // dejamos en 0/null para reflejar el caso 'cliente sin ventas'.
    cantidadVentas: 0,
    cantidadAbonos: 0,
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
        { provide: ApiClientesService, useValue: { listar: () => of({ items: [], page: 1, size: 50, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false }), crear: () => of(client) } },
        { provide: ApiProductosService, useValue: { selector: () => of([]) } },
        { provide: NotificationService, useValue: notification },
        { provide: ProductosState, useValue: { notificarCambioStock: jasmine.createSpy('notificarCambioStock') } },
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

  function configureCashSale(payment: number): void {
    const instance = component as any;
    instance.clientes.set([client]);
    instance.productos.set([{ id: 10, nombre: 'Product', codigoBarra: null, stockActual: 5, stockMinimo: 1, precioVentaSugerido: 100 }]);
    instance.formVenta.patchValue({ clienteId: client.id });
    instance.onProductoSeleccionado(10);
    instance.pagosArray.at(0).patchValue({ monto: payment });
    instance.abrirPOS();
    fixture.detectChanges();
  }

  it('does not submit a cash sale with a partial payment', () => {
    configureCashSale(50);

    (component as any).procesarVenta();

    expect(notification.error).toHaveBeenCalledWith('El pago debe ser exactamente igual al total de la venta');
    expect(apiVentas.registrarVenta).not.toHaveBeenCalled();
  });

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

  it('submits a fully paid credit sale as its initial payment', () => {
    configureCreditSale(100);

    (component as any).procesarVenta();

    expect(notification.error).not.toHaveBeenCalled();
    expect(apiVentas.registrarVenta).toHaveBeenCalledWith(jasmine.objectContaining({
      pagos: [{ monto: 100, metodoPagoId: 1 }],
      cantidadCuotas: 3,
    }));
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

// =====================================================================
//  J-3 audit — POS inline cliente creation (modal rapido del POS).
// ---------------------------------------------------------------------
//  Cubre el camino:
//    - abrirModalCliente() deja formCliente.reset() con DNI default
//      y aplica el pattern validator
//    - intentarGuardarClienteRapido() con similitud >= umbral: el modal
//      de "posible duplicado" se abre con el score del backend
//    - elegirClienteSimilar() parcha clienteId en formVenta y cierra
//    - ejecutarGuardarClienteRapido() crea via API y agrega al signal
//      `clientes`, ademas de patchear formVenta
//    - validacion DNI/RUC se ajusta segun TipoDocumentoId
// =====================================================================

describe('PuntoVentaComponent inline cliente creation', () => {
  let fixture: ComponentFixture<PuntoVentaComponent>;
  let component: PuntoVentaComponent;
  let apiClientes: jasmine.SpyObj<ApiClientesService>;
  let notification: jasmine.SpyObj<NotificationService>;

  const newClient: Cliente = {
    id: 99,
    nombre: 'Juan Perez',
    documento: '12345678',
    telefono: '987654321',
    email: null,
    direccion: null,
    tipoDocumentoId: 1,
    tipoDocumentoNombre: 'DNI',
    creadoEn: '2026-09-27T00:00:00Z',
    tieneDeuda: false,
    creadoPorId: null,
    creadoPorNombre: null,
    modificadoEn: null,
    modificadoPorId: null,
    modificadoPorNombre: null,
    eliminadoEn: null,
    eliminadoPorId: null,
    eliminadoPorNombre: null,
    cantidadVentas: 0,
    cantidadAbonos: 0,
  };

  beforeEach(() => {
    apiClientes = jasmine.createSpyObj<ApiClientesService>('ApiClientesService', [
      'listar', 'crear', 'buscarSimilares', 'obtenerEstadoCuenta',
    ]);
    apiClientes.listar.and.returnValue(of({ items: [], page: 1, size: 50, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false }));
    apiClientes.crear.and.returnValue(of(newClient));
    apiClientes.buscarSimilares.and.returnValue(of([]));
    apiClientes.obtenerEstadoCuenta.and.returnValue(of({
      cliente: newClient,
      totalFacturado: 0, totalPagado: 0, deudaActual: 0,
      cantidadVentasTotal: 0, cantidadVentasMostradas: 0,
      cantidadAbonos: 0, ventas: [],
    }));

    notification = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [PuntoVentaComponent],
      providers: [
        { provide: ApiVentasService, useValue: { listar: () => of([]), listarMetodosPago: () => of([]), previewPlan: () => of([]), registrarVenta: () => of({} as Venta) } },
        { provide: ApiClientesService, useValue: apiClientes },
        // Mocks extra que el componente usa via effect/constructor.
        { provide: ApiProductosService, useValue: { selector: () => of([]) } },
        { provide: NotificationService, useValue: notification },
        { provide: ProductosState, useValue: { notificarCambioStock: jasmine.createSpy('notificarCambioStock') } },
      ],
    });

    fixture = TestBed.createComponent(PuntoVentaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('abrirModalCliente resets the form with DNI as default', () => {
    const instance = component as any;

    // Modify the form first to verify it's actually reset.
    instance.formCliente.patchValue({ nombre: 'preload', documento: '99999999' });
    instance.modalClienteAbierto.set(false);

    instance.abrirModalCliente();

    expect(instance.modalClienteAbierto()).toBeTrue();
    // form.reset() setea los campos a null (no '') por default. Lo que
    // nos importa es que NO tengan el valor viejo ('preload').
    expect(instance.formCliente.get('nombre')?.value).not.toBe('preload');
    expect(instance.formCliente.get('documento')?.value).not.toBe('99999999');
    expect(instance.formCliente.get('tipoDocumentoId')?.value).toBe(1,
      'DNI (1) is the default so the pattern validator kicks in immediately');
  });

  it('intentarGuardarClienteRapido con similitud abre el modal de confirmacion', () => {
    const instance = component as any;

    // The backend returns 1 candidato with 87% similitud.
    apiClientes.buscarSimilares.and.returnValue(of([
      { id: 5, nombre: 'Juan Pereira', documento: null, similitud: 87 },
    ]));

    instance.formCliente.patchValue({
      nombre: 'Juan Perez',
      documento: '',
      telefono: '',
      email: '',
      tipoDocumentoId: 1,
      direccion: '',
    });
    instance.aplicarValidadorDocumento(1);

    instance.intentarGuardarClienteRapido();

    expect(apiClientes.buscarSimilares).toHaveBeenCalledWith('Juan Perez');
    expect(instance.confirmarDuplicadosAbierto()).toBeTrue();
    expect(instance.clientesSimilares().length).toBe(1);
    expect(instance.clientesSimilares()[0].similitud).toBe(87);
    // No se llamo a crear todavia — espera la confirmacion del operador.
    expect(apiClientes.crear).not.toHaveBeenCalled();
  });

  it('ejecutarGuardarClienteRapido crea el cliente, lo agrega al signal y parchea formVenta', () => {
    const instance = component as any;

    instance.clientes.set([]);
    instance.clientesBusqueda.set([]);
    instance.formVenta.patchValue({ clienteId: null });

    instance.formCliente.patchValue({
      nombre: 'Juan Perez',
      documento: '12345678',
      telefono: '987654321',
      email: '',
      tipoDocumentoId: 1,
      direccion: '',
    });
    instance.aplicarValidadorDocumento(1);
    instance.modalClienteAbierto.set(true);

    instance.ejecutarGuardarClienteRapido();

    expect(apiClientes.crear).toHaveBeenCalledWith(jasmine.objectContaining({
      nombre: 'Juan Perez',
      documento: '12345678',
      telefono: '987654321',
      tipoDocumentoId: 1,
    }));
    expect(instance.clientes().length).toBe(1,
      'el nuevo cliente debe aparecer en el signal clientes para los lookups internos');
    expect(instance.clientesBusqueda().length).toBe(1,
      'tambien en clientesBusqueda que alimenta el dropdown del POS');
    expect(instance.formVenta.get('clienteId')?.value).toBe(99,
      'formVenta queda patcheado con el id del nuevo cliente — listo para procesar la venta');
    expect(instance.modalClienteAbierto()).toBeFalse();
    expect(notification.success).toHaveBeenCalledWith('Cliente creado y seleccionado');
  });

  it('validacion DNI se aplica cuando tipoDocumentoId=1 y RUC cuando tipoDocumentoId=2', () => {
    const instance = component as any;

    // Default state — DNI, document empty. Should pass required-check
    // (not apply pattern to empty string when no doc required).
    instance.abrirModalCliente();
    // Jasmine's toBeTrue/toBeFalse don't accept a reason; we just assert
    // and add a comment for the human reader.
    expect(instance.formCliente.get('documento')?.valid).toBeTrue();

    // DNI: 8 digitos exactos.
    instance.formCliente.patchValue({ documento: '12345678' });
    expect(instance.formCliente.get('documento')?.valid).toBeTrue();

    // DNI: 7 digitos — falla el pattern.
    instance.formCliente.patchValue({ documento: '1234567' });
    expect(instance.formCliente.get('documento')?.valid).toBeFalse();

    // Switch a RUC.
    instance.setTipoDocumento(2);
    // El valor preexistente (7 dig) no cumple el pattern de 11.
    expect(instance.formCliente.get('documento')?.valid).toBeFalse();

    // RUC: 11 digitos exactos.
    instance.formCliente.patchValue({ documento: '20123456789' });
    expect(instance.formCliente.get('documento')?.valid).toBeTrue();

    // RUC: 12 digitos — falla.
    instance.formCliente.patchValue({ documento: '201234567890' });
    expect(instance.formCliente.get('documento')?.valid).toBeFalse();

    // Switch a Sin doc. (3): documento debe quedar vacio.
    instance.setTipoDocumento(3);
    // setTipoDocumento limpia documento y lo deshabilita.
    expect(instance.formCliente.get('documento')?.value).toBe('');
    expect(instance.formCliente.get('documento')?.disabled).toBeTrue();
  });
});
