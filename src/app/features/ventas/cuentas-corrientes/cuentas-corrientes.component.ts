import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Cliente } from '../../../core/models/cliente.models';
import { Venta, CrearAbonoPayload, VentaDetallada, Cuota, KpiCobranza, VentaFiltros, Abono } from '../../../core/models/venta.models';
import { DropdownComponent, DropdownOption } from '../../../core/components/dropdown.component';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';

interface CuotaConVencida extends Cuota {
  vencida: boolean;
}

type ModoAbonoCredito = 'cuota-vigente' | 'adelantar-cuotas' | 'pagar-todo' | 'otro-monto';

interface CuotaAfectada {
  numero: number;
  monto: number;
}

@Component({
  selector: 'app-cuentas-corrientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DropdownComponent, ConfirmDialogComponent],
  templateUrl: './cuentas-corrientes.component.html',
})
export class CuentasCorrientesComponent implements OnInit {
  private readonly apiVentas = inject(ApiVentasService);
  private readonly apiClientes = inject(ApiClientesService);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  // Estado general
  protected readonly ventas = signal<Venta[]>([]);
  protected readonly cargando = signal<boolean>(true);

  // KPIs de cobranza (endpoint dedicado, no depende de los filtros del listado)
  protected readonly kpisCobranza = signal<KpiCobranza>({
    deudaTotal: 0,
    clientesConDeuda: 0,
    deudaVencida: 0,
    cuotasVencenProximas: 0
  });

  // Filtros (signal reactivo con debounce al backend)
  protected readonly filtros = signal<VentaFiltros>({
    desde: null,
    hasta: null,
    clienteId: null,
    estadoPago: null
  });

  // Catálogo de clientes para popular el dropdown de filtro
  protected readonly clientes = signal<Cliente[]>([]);

  protected readonly opcionesFiltroCliente = computed<DropdownOption<number | null>[]>(() => [
    { value: null, label: 'Todos los clientes', sublabel: 'Sin filtro' },
    ...this.clientes().map(c => ({ value: c.id, label: c.nombre }))
  ]);

  // Las "deudas" ya vienen filtradas del backend (EstadoPago != 'Pagado' && !Eliminado).
  // No hace falta aplicar filtros client-side adicionales.
  protected readonly deudas = computed(() => this.ventas());

  // Modal de Abono
  protected readonly modalAbonoAbierto = signal<boolean>(false);
  protected readonly procesandoAbono = signal<boolean>(false);
  protected readonly ventaSeleccionada = signal<Venta | null>(null);
  protected readonly detalleAbono = signal<VentaDetallada | null>(null);
  protected readonly cargandoDetalleAbono = signal<boolean>(false);
  protected readonly modoAbonoCredito = signal<ModoAbonoCredito>('otro-monto');
  protected readonly cantidadCuotasAdelantar = signal<number>(1);
  private readonly montoAbono = signal<number>(0);

  protected readonly cuotasPendientesAbono = computed(() => (this.detalleAbono()?.cuotas ?? [])
    .filter(c => c.montoPendiente > 0)
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.numero - b.numero));

  protected readonly cuotasAfectadas = computed<CuotaAfectada[]>(() => {
    const venta = this.ventaSeleccionada();
    if (!venta?.esCredito) return [];

    const pendientes = this.cuotasPendientesAbono();
    const monto = Math.min(this.montoAbono(), venta.saldoPendiente);
    let restante = monto;

    return pendientes.flatMap(cuota => {
      if (restante <= 0) return [];
      const aplicado = Math.min(cuota.montoPendiente, restante);
      restante = Math.round((restante - aplicado) * 100) / 100;
      return [{ numero: cuota.numero, monto: aplicado }];
    });
  });

  // Detalles e historial de una venta
  protected readonly modalDetalleAbierto = signal<boolean>(false);
  protected readonly ventaDetallada = signal<VentaDetallada | null>(null);
  protected readonly cargandoDetalle = signal<boolean>(false);

  // Confirmaciones de anulación
  protected readonly abonoAAnular = signal<Abono | null>(null);
  protected readonly ventaAAnular = signal<VentaDetallada | null>(null);
  protected readonly procesandoAnulacion = signal<boolean>(false);

  // Cronograma de cuotas con flag "vencida"
  protected readonly cronogramaConVencida = computed<CuotaConVencida[]>(() => {
    const d = this.ventaDetallada();
    if (!d || !d.esCredito) return [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return (d.cuotas ?? []).map(c => ({
      ...c,
      vencida: c.montoPendiente > 0 && new Date(c.fechaVencimiento) < hoy
    }));
  });

  protected readonly metodosPago = [
    { id: 1, nombre: 'Efectivo' },
    { id: 2, nombre: 'Transferencia Bancaria' },
    { id: 3, nombre: 'Yape' },
    { id: 4, nombre: 'Plin' }
  ];

  protected formAbono = this.fb.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    metodoPagoId: [1, Validators.required],
    observacion: ['']
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.formAbono.controls.monto.valueChanges.subscribe(monto => this.montoAbono.set(Number(monto) || 0));
  }

  ngOnInit(): void {
    this.cargarDeudas();
    this.cargarKpisCobranza();
    this.cargarClientes();
  }

  private cargarDeudas() {
    this.cargando.set(true);
    this.apiVentas.listarDeudas(this.filtros()).subscribe({
      next: (data) => {
        this.ventas.set(data);
        this.cargando.set(false);
      },
      error: () => {
        this.notify.error('No se pudieron cargar las cuentas corrientes');
        this.cargando.set(false);
      }
    });
  }

  private cargarClientes() {
    this.apiClientes.listar().subscribe({
      next: (data) => this.clientes.set(data),
      error: () => {
        // Si falla, el filtro de cliente queda solo con "Todos los clientes".
      }
    });
  }

  private cargarKpisCobranza() {
    this.apiVentas.kpisCobranza().subscribe({
      next: (data) => this.kpisCobranza.set(data),
      error: () => {
        // Si falla el endpoint, mantenemos los zeros por default.
        // No spameamos al usuario: es un recuadro informativo.
      }
    });
  }

  protected onFiltroFechaChange(campo: 'desde' | 'hasta', event: Event) {
    const valor = (event.target as HTMLInputElement).value;
    this.filtros.update(f => ({ ...f, [campo]: valor || null }));
    this.scheduleReload();
  }

  protected onFiltroClienteChange(value: unknown) {
    const id = value == null ? null : Number(value);
    this.filtros.update(f => ({ ...f, clienteId: Number.isFinite(id as number) ? id : null }));
    this.scheduleReload();
  }

  protected limpiarFiltros() {
    this.filtros.set({ desde: null, hasta: null, clienteId: null, estadoPago: null });
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.cargarDeudas();
  }

  private scheduleReload() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.cargarDeudas();
    }, 300);
  }

  protected abrirModalAbono(venta: Venta, detalle?: VentaDetallada) {
    this.ventaSeleccionada.set(venta);
    this.detalleAbono.set(null);
    this.cantidadCuotasAdelantar.set(1);
    this.formAbono.reset({
      monto: venta.esCredito ? 0 : venta.saldoPendiente,
      metodoPagoId: 1,
      observacion: ''
    });
    this.modalAbonoAbierto.set(true);

    if (!venta.esCredito) {
      this.modoAbonoCredito.set('otro-monto');
      return;
    }

    if (detalle) {
      this.prepararAtajosCredito(detalle);
      return;
    }

    this.cargandoDetalleAbono.set(true);
    this.apiVentas.obtener(venta.id).subscribe({
      next: (data) => {
        this.cargandoDetalleAbono.set(false);
        this.prepararAtajosCredito(data);
      },
      error: () => {
        this.cargandoDetalleAbono.set(false);
        this.cerrarModalAbono();
        this.notify.error('No se pudieron cargar las cuotas para registrar el abono');
      }
    });
  }

  protected seleccionarModoAbono(modo: ModoAbonoCredito) {
    this.modoAbonoCredito.set(modo);
    if (modo === 'otro-monto') return;

    const pendientes = this.cuotasPendientesAbono();
    const venta = this.ventaSeleccionada();
    if (!venta) return;

    const monto = modo === 'cuota-vigente'
      ? pendientes[0]?.montoPendiente ?? 0
      : modo === 'adelantar-cuotas'
        ? pendientes.slice(0, this.cantidadCuotasAdelantar()).reduce((total, cuota) => total + cuota.montoPendiente, 0)
        : venta.saldoPendiente;
    this.formAbono.patchValue({ monto: Math.round(monto * 100) / 100 });
  }

  protected cambiarCantidadCuotasAdelantar(event: Event) {
    const maximo = this.cuotasPendientesAbono().length;
    const cantidad = Math.max(1, Math.min(maximo, Number((event.target as HTMLInputElement).value) || 1));
    this.cantidadCuotasAdelantar.set(cantidad);
    this.seleccionarModoAbono('adelantar-cuotas');
  }

  protected seleccionarOtroMonto() {
    this.modoAbonoCredito.set('otro-monto');
  }

  protected cerrarModalAbono() {
    this.modalAbonoAbierto.set(false);
    this.ventaSeleccionada.set(null);
    this.detalleAbono.set(null);
    this.cargandoDetalleAbono.set(false);
  }

  protected guardarAbono() {
    if (this.formAbono.invalid) {
      this.formAbono.markAllAsTouched();
      return;
    }
    const venta = this.ventaSeleccionada();
    if (!venta) return;

    const val = this.formAbono.value;

    if (Number(val.monto) > venta.saldoPendiente) {
      this.notify.error(`El monto no puede superar la deuda actual (S/ ${venta.saldoPendiente})`);
      return;
    }

    const payload: CrearAbonoPayload = {
      monto: Number(val.monto),
      metodoPagoId: Number(val.metodoPagoId),
      observacion: val.observacion ? val.observacion.toString().trim() : null
    };

    this.procesandoAbono.set(true);
    this.apiVentas.registrarAbono(venta.id, payload).subscribe({
      next: () => {
        this.notify.success('Abono registrado exitosamente');
        this.cerrarModalAbono();
        this.procesandoAbono.set(false);
        this.cargarDeudas();
        this.cargarKpisCobranza();
      },
      error: (err) => {
        this.notify.error(this.mensajeError(err, 'Error al registrar abono'));
        this.procesandoAbono.set(false);
      }
    });
  }

  protected verDetalles(id: number) {
    this.cargandoDetalle.set(true);
    this.modalDetalleAbierto.set(true);
    this.apiVentas.obtener(id).subscribe({
      next: (data) => {
        this.ventaDetallada.set(data);
        this.cargandoDetalle.set(false);
      },
      error: () => {
        this.notify.error('No se pudo cargar el detalle');
        this.cargandoDetalle.set(false);
        this.modalDetalleAbierto.set(false);
      }
    });
  }

  protected cerrarModalDetalle() {
    this.modalDetalleAbierto.set(false);
    this.ventaDetallada.set(null);
  }

  protected solicitarAnulacionAbono(abono: Abono) {
    if (abono.estado !== 'Pagado') return;
    this.abonoAAnular.set(abono);
  }

  protected cancelarAnulacionAbono() {
    if (!this.procesandoAnulacion()) this.abonoAAnular.set(null);
  }

  protected confirmarAnulacionAbono() {
    const abono = this.abonoAAnular();
    const venta = this.ventaDetallada();
    if (!abono || !venta || this.procesandoAnulacion()) return;

    this.procesandoAnulacion.set(true);
    this.apiVentas.anularAbono(venta.id, abono.id).subscribe({
      next: () => {
        this.notify.success('Abono anulado exitosamente');
        this.abonoAAnular.set(null);
        this.procesandoAnulacion.set(false);
        this.refrescarDespuesDeAnulacion(venta.id);
      },
      error: (err) => {
        this.notify.error(this.mensajeError(err, 'Error al anular abono'));
        this.procesandoAnulacion.set(false);
      }
    });
  }

  protected solicitarAnulacionVenta(venta: VentaDetallada) {
    this.ventaAAnular.set(venta);
  }

  protected cancelarAnulacionVenta() {
    if (!this.procesandoAnulacion()) this.ventaAAnular.set(null);
  }

  protected confirmarAnulacionVenta() {
    const venta = this.ventaAAnular();
    if (!venta || this.procesandoAnulacion()) return;

    this.procesandoAnulacion.set(true);
    this.apiVentas.anularVenta(venta.id).subscribe({
      next: () => {
        this.notify.success('Venta anulada exitosamente');
        this.ventaAAnular.set(null);
        this.procesandoAnulacion.set(false);
        this.cerrarModalDetalle();
        this.cargarDeudas();
        this.cargarKpisCobranza();
      },
      error: (err) => {
        this.notify.error(this.mensajeError(err, 'Error al anular venta'));
        this.procesandoAnulacion.set(false);
      }
    });
  }

  protected abrirAbonoDesdeDetalle(d: VentaDetallada) {
    this.cerrarModalDetalle();
    // Esperar un tick para que se cierre el modal de detalle antes de abrir el de abono
    setTimeout(() => {
      this.abrirModalAbono({
        id: d.id,
        clienteId: d.clienteId,
        clienteNombre: d.clienteNombre,
        fecha: d.fecha,
        montoTotal: d.montoTotal,
        saldoPendiente: d.saldoPendiente,
        estadoPago: d.estadoPago,
        esCredito: d.esCredito,
        cantidadCuotas: d.cantidadCuotas,
        frecuencia: d.frecuencia,
        fechaInicioCredito: d.fechaInicioCredito
      }, d);
    }, 100);
  }

  private refrescarDespuesDeAnulacion(ventaId: number) {
    this.cargarDeudas();
    this.cargarKpisCobranza();
    this.verDetalles(ventaId);
  }

  private prepararAtajosCredito(detalle: VentaDetallada) {
    this.detalleAbono.set(detalle);
    this.seleccionarModoAbono('cuota-vigente');
  }

  private mensajeError(err: any, fallback: string): string {
    const mensaje = err?.error?.detail ?? err?.error?.error ?? err?.error;
    return typeof mensaje === 'string' ? mensaje : fallback;
  }
}
