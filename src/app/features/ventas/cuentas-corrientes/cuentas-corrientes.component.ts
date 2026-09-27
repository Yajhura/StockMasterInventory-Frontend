import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductosState } from '../../../core/state/productos.state';
import { Cliente } from '../../../core/models/cliente.models';
import { Venta, CrearAbonoPayload, VentaDetallada, Cuota, KpiCobranza, VentaFiltros, Abono, EstadoPago, MetodoPago } from '../../../core/models/venta.models';
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
export class CuentasCorrientesComponent implements OnInit, OnDestroy {
  private readonly apiVentas = inject(ApiVentasService);
  private readonly apiClientes = inject(ApiClientesService);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly productosState = inject(ProductosState);

  // Estado general
  protected readonly ventas = signal<Venta[]>([]);
  protected readonly cargando = signal<boolean>(true);

  // H-F1 audit: estado de paginación del listado de deudas.
  // page=1 + size=50 son los defaults del backend; el backend clamp a 1..200.
  protected readonly page = signal<number>(1);
  protected readonly pageSize = signal<number>(50);
  protected readonly totalItems = signal<number>(0);
  protected readonly totalPages = signal<number>(0);

  // KPIs de cobranza (endpoint dedicado, no depende de los filtros del listado)
  protected readonly kpisCobranza = signal<KpiCobranza>({
    deudaTotal: 0,
    clientesConDeuda: 0,
    deudaVencida: 0,
    cuotasVencenProximas: 0
  });

  // Métodos de pago — cargados server-side via /api/metodos-pago
  // (antes hardcoded; no reflejaba métodos agregados por el admin).
  protected readonly metodosPago = signal<MetodoPago[]>([]);

  // Filtros (signal reactivo con debounce al backend)
  protected readonly filtros = signal<VentaFiltros>({
    desde: null,
    hasta: null,
    clienteId: null,
    estadoPago: null,
    page: 1,
    size: 50
  });

  // Catálogo de clientes para popular el dropdown de filtro
  protected readonly clientes = signal<Cliente[]>([]);

  protected readonly opcionesFiltroCliente = computed<DropdownOption<number | null>[]>(() => [
    { value: null, label: 'Todos los clientes', sublabel: 'Sin filtro' },
    ...this.clientes().map(c => ({ value: c.id, label: c.nombre }))
  ]);

  protected readonly opcionesMetodosPago = computed<DropdownOption[]>(() =>
    this.metodosPago().map(m => ({ value: m.id, label: m.nombre }))
  );

  protected readonly opcionesEstadoPago: DropdownOption<EstadoPago | null>[] = [
    { value: null, label: 'Todos los estados', sublabel: 'Sin filtro' },
    { value: 'Pendiente', label: 'Pendiente' },
    { value: 'Parcial', label: 'Parcial' },
  ];

  // Las "deudas" ya vienen filtradas del backend (EstadoPago != 'Pagado' && !Eliminado).
  // No hace falta aplicar filtros client-side adicionales.
  protected readonly deudas = computed(() => this.ventas());

  // H-F1 audit: rango de filas mostrado (1-based, inclusivo).
  // Usado por el paginador "Mostrando X-Y de Z".
  protected readonly rangoInicio = computed(() =>
    this.totalItems() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1
  );
  protected readonly rangoFin = computed(() =>
    Math.min(this.page() * this.pageSize(), this.totalItems())
  );
  protected readonly hayPaginaAnterior = computed(() => this.page() > 1);
  protected readonly hayPaginaSiguiente = computed(() => this.page() < this.totalPages());

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

  // H-G1 audit: cuando una venta tiene pagos activos al intentar anular,
  // mostramos una advertencia específica (cantidad + monto total) y un
  // atajo "Ir al historial de pagos" en lugar del ConfirmDialog genérico.
  // El backend igual rechazaría con 400; acá le damos contexto accionable
  // antes de que intente.
  protected readonly ventaConPagosActivos = signal<VentaDetallada | null>(null);
  protected readonly pagosActivosResumen = computed(() => {
    const v = this.ventaConPagosActivos();
    if (!v) return { count: 0, total: 0 };
    const activos = (v.abonos ?? []).filter(a => a.estado === 'Pagado' && !a.eliminadoEn);
    return {
      count: activos.length,
      total: activos.reduce((acc, a) => acc + a.monto, 0)
    };
  });

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

  protected formAbono = this.fb.group({
    monto: [0, [Validators.required, Validators.min(0.01)]],
    metodoPagoId: [1, Validators.required],
    observacion: ['']
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // H-F2 audit: BroadcastChannel + storage-event fallback para sincronizar
  // el listado entre pestañas. Si el operador tiene /cuentas-corrientes
  // abierto en dos pestañas y registra/anula un abono en una, la otra se
  // refresca automáticamente sin tener que recargar manualmente. Usamos el
  // canal cuando está disponible (todos los browsers modernos) y caemos al
  // evento `storage` cuando no — el evento storage NO se dispara en la
  // pestaña que escribe, sólo en las demás, así que no hay doble-refresh.
  private static readonly BROADCAST_KEY = 'stockmaster.cuentas-corrientes';
  private bc: BroadcastChannel | null = null;
  private readonly storageHandler = (e: StorageEvent) => {
    if (e.key === CuentasCorrientesComponent.BROADCAST_KEY && e.newValue) {
      this.cargarDeudas();
      this.cargarKpisCobranza();
    }
  };

  constructor() {
    this.formAbono.controls.monto.valueChanges.subscribe(monto => this.montoAbono.set(Number(monto) || 0));
  }

  ngOnInit(): void {
    this.cargarDeudas();
    this.cargarKpisCobranza();
    this.cargarClientes();
    this.cargarMetodosPago();
    this.iniciarBroadcastChannel();
  }

  ngOnDestroy(): void {
    this.bc?.close();
    this.bc = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageHandler);
    }
  }

  private iniciarBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(CuentasCorrientesComponent.BROADCAST_KEY);
      this.bc.onmessage = () => {
        this.cargarDeudas();
        this.cargarKpisCobranza();
      };
      return;
    }
    // Fallback para entornos sin BroadcastChannel.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.storageHandler);
    }
  }

  /**
   * H-F2 audit: notifica a las demás pestañas que hubo un cambio de estado
   * (abono registrado, anulado o venta anulada) para que refresquen su
   * listado. La pestaña que originó el cambio ya actualizó su propia vista
   * antes de emitir — el BroadcastChannel sólo sincroniza las pestañas
   * restantes.
   */
  private emitirBroadcastCobranza(): void {
    if (this.bc) {
      this.bc.postMessage({ at: Date.now() });
      return;
    }
    if (typeof localStorage !== 'undefined') {
      // El evento `storage` se dispara en TODAS las pestañas menos la que
      // escribió, así que evitamos auto-refrescarnos.
      localStorage.setItem(
        CuentasCorrientesComponent.BROADCAST_KEY,
        String(Date.now())
      );
    }
  }

  protected cargarMetodosPago(): void {
    this.apiVentas.listarMetodosPago().subscribe({
      next: (res) => {
        this.metodosPago.set(res);
        // H-H2 audit: si el form tiene el default metodoPagoId=1 y ese
        // método existe en la respuesta, lo dejamos. Si NO existe (porque
        // el admin lo borró o desactivó), seteamos al primer método activo
        // disponible. Esto evita que el submit mande un id inválido y el
        // backend responda con un 400 confuso.
        const currentId = this.formAbono.controls.metodoPagoId.value;
        const existe = res.some(m => m.id === currentId);
        if (!existe && res.length > 0) {
          this.formAbono.patchValue({ metodoPagoId: res[0].id });
        }
      },
      error: () => {
        // Si falla, dejamos el dropdown vacío (no spameamos al usuario).
      }
    });
  }

  private cargarDeudas() {
    this.cargando.set(true);
    this.apiVentas.listarDeudas(this.filtros()).subscribe({
      next: (data) => {
        // H-F1 audit: el backend ahora devuelve PaginatedResponse<Venta>.
        this.ventas.set(data.items);
        this.totalItems.set(data.totalItems);
        this.totalPages.set(data.totalPages);
        this.page.set(data.page);
        this.pageSize.set(data.size);
        this.cargando.set(false);
      },
      error: () => {
        this.notify.error('No se pudieron cargar las cuentas corrientes');
        this.cargando.set(false);
      }
    });
  }

  protected irAPaginaAnterior() {
    if (!this.hayPaginaAnterior()) return;
    this.filtros.update(f => ({ ...f, page: this.page() - 1 }));
    this.cargarDeudas();
  }

  protected irAPaginaSiguiente() {
    if (!this.hayPaginaSiguiente()) return;
    this.filtros.update(f => ({ ...f, page: this.page() + 1 }));
    this.cargarDeudas();
  }

  private cargarClientes() {
    // C-4 audit: el dropdown de filtro consume la primera pagina. 200 es
    // suficiente para el set realista de clientes que usan POS + cobranza.
    this.apiClientes.listar({ page: 1, size: 200 }).subscribe({
      next: (data) => this.clientes.set(data.items),
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

  protected onFiltroEstadoChange(value: unknown) {
    this.filtros.update(f => ({ ...f, estadoPago: (value as EstadoPago | null) ?? null }));
    this.scheduleReload();
  }

  protected limpiarFiltros() {
    this.filtros.set({ desde: null, hasta: null, clienteId: null, estadoPago: null, page: 1, size: 50 });
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
      // H-F1 audit: cualquier cambio de filtro vuelve a página 1 para no
      // dejar al usuario en una página vacía fuera del nuevo subset.
      this.filtros.update(f => ({ ...f, page: 1 }));
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
        this.emitirBroadcastCobranza();
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
        this.emitirBroadcastCobranza();
      },
      error: (err) => {
        this.notify.error(this.mensajeError(err, 'Error al anular abono'));
        this.procesandoAnulacion.set(false);
      }
    });
  }

  protected solicitarAnulacionVenta(venta: VentaDetallada) {
    // H-G1 audit: si la venta tiene abonos vigentes (Pagado y no
    // eliminados), el backend rechaza con 400 — le mostramos al usuario
    // el motivo concreto (cantidad + monto total) y lo mandamos al
    // historial de pagos para que anule primero cada uno. Sin pagos
    // activos, el ConfirmDialog habitual confirma la cancelación.
    const pagosActivos = (venta.abonos ?? [])
      .filter(a => a.estado === 'Pagado' && !a.eliminadoEn);
    if (pagosActivos.length > 0) {
      this.ventaConPagosActivos.set(venta);
      return;
    }
    this.ventaAAnular.set(venta);
  }

  protected cancelarAnulacionVenta() {
    if (!this.procesandoAnulacion()) this.ventaAAnular.set(null);
  }

  /**
   * H-G1 audit: el usuario ya está viendo el detalle de la venta cuando
   * hace click en "Anular venta" — así que "ir al historial" simplemente
   * cierra el warning y scrollea el modal de detalle hasta la sección de
   * abonos. Si la invocación viniera de otro contexto (futuro), esto se
   * podría extender para abrir el modal de detalle primero.
   */
  protected irAlHistorialDePagos() {
    const venta = this.ventaConPagosActivos();
    this.ventaConPagosActivos.set(null);
    if (!venta) return;
    // Si el detalle abierto es el mismo, scrollear; si no, abrirlo.
    if (this.ventaDetallada()?.id === venta.id) {
      setTimeout(() => {
        document.getElementById('seccion-historial-pagos')?.scrollIntoView({
          behavior: 'smooth', block: 'start'
        });
      }, 100);
    } else {
      this.verDetalles(venta.id);
    }
  }

  protected descartarAdvertenciaPagosActivos() {
    this.ventaConPagosActivos.set(null);
  }

  protected confirmarAnulacionVenta() {
    const venta = this.ventaAAnular();
    if (!venta || this.procesandoAnulacion()) return;

    this.procesandoAnulacion.set(true);
    this.apiVentas.anularVenta(venta.id).subscribe({
      next: () => {
        this.notify.success('Venta anulada exitosamente');
        // La anulacion genera INGRESOs compensadores en backend -> stockActual cambia.
        // Bumpear productosRev invalida caches downstream (KpisState).
        this.productosState.notificarCambioStock();
        this.ventaAAnular.set(null);
        this.procesandoAnulacion.set(false);
        this.cerrarModalDetalle();
        this.cargarDeudas();
        this.cargarKpisCobranza();
        this.emitirBroadcastCobranza();
      },
      error: (err) => {
        this.notify.error(this.mensajeError(err, 'Error al anular venta'));
        this.procesandoAnulacion.set(false);
      }
    });
  }

  protected abrirAbonoDesdeDetalle(d: VentaDetallada) {
    this.cerrarModalDetalle();
    // H-H1 audit: antes había un setTimeout(..., 100) para coordinar el
    // cierre del modal de detalle y la apertura del modal de abono. El delay
    // era un hack frágil: en dispositivos lentos 100ms no alcanzaba y los
    // modales se solapaban visualmente. queueMicrotask agenda el callback
    // después del tick actual de la microtask queue (Angular ya terminó
    // de procesar el cambio de signal en este frame), lo que es suficiente
    // para que el modal de detalle termine su transición antes de que
    // abramos el de abono — sin la latencia arbitraria de 100ms.
    queueMicrotask(() => {
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
    });
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
