import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Cliente } from '../../../core/models/cliente.models';
import { Venta, CrearAbonoPayload, VentaDetallada, Cuota, KpiCobranza, VentaFiltros } from '../../../core/models/venta.models';
import { DropdownComponent, DropdownOption } from '../../../core/components/dropdown.component';

interface CuotaConVencida extends Cuota {
  vencida: boolean;
}

@Component({
  selector: 'app-cuentas-corrientes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DropdownComponent],
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

  // Detalles e historial de una venta
  protected readonly modalDetalleAbierto = signal<boolean>(false);
  protected readonly ventaDetallada = signal<VentaDetallada | null>(null);
  protected readonly cargandoDetalle = signal<boolean>(false);

  // Cronograma de cuotas con flag "vencida"
  protected readonly cronogramaConVencida = computed<CuotaConVencida[]>(() => {
    const d = this.ventaDetallada();
    if (!d || !d.esCredito) return [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return (d.cuotas ?? []).map(c => ({
      ...c,
      vencida: c.estado === 'Pendiente' && new Date(c.fechaVencimiento) < hoy
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

  protected abrirModalAbono(venta: Venta) {
    this.ventaSeleccionada.set(venta);
    this.formAbono.reset({
      monto: venta.saldoPendiente,
      metodoPagoId: 1,
      observacion: ''
    });
    this.modalAbonoAbierto.set(true);
  }

  protected aplicarPorcentaje(pct: number) {
    const v = this.ventaSeleccionada();
    if (!v) return;
    const monto = Math.round(v.saldoPendiente * pct * 100) / 100;
    this.formAbono.patchValue({ monto });
  }

  protected cerrarModalAbono() {
    this.modalAbonoAbierto.set(false);
    this.ventaSeleccionada.set(null);
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
        const msg = err?.error?.detail || err?.error || 'Error al registrar abono';
        this.notify.error(typeof msg === 'string' ? msg : 'Error al registrar abono');
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
      });
    }, 100);
  }
}
