import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { OnlyNumbersDirective } from '../../../core/directives/only-numbers.directive';
import { ApiVentasService } from '../../../core/api/api-ventas.service';
import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { ApiProductosService } from '../../../core/api/api-productos.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ProductoSelectorItem } from '../../../core/models/inventario.models';
import { Cliente, CrearClientePayload } from '../../../core/models/cliente.models';
import { CrearVentaPayload, PagoInicial, Venta, VentaFiltros, KpiVentas, EstadoPago, MetodoPago, CuotaPreview } from '../../../core/models/venta.models';
import { DropdownComponent, DropdownOption } from '../../../core/components/dropdown.component';
@Component({
  selector: 'app-punto-venta',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DropdownComponent, OnlyNumbersDirective],
  templateUrl: './punto-venta.component.html',
})
export class PuntoVentaComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly apiVentas = inject(ApiVentasService);
  private readonly apiClientes = inject(ApiClientesService);
  private readonly apiProductos = inject(ApiProductosService);
  private readonly notify = inject(NotificationService);

  protected readonly procesando = signal<boolean>(false);

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly productos = signal<ProductoSelectorItem[]>([]);

  protected readonly ventas = signal<Venta[]>([]);
  protected readonly cargandoVentas = signal<boolean>(true);
  protected readonly isPosOpen = signal<boolean>(false);

  // --- Estado del plan de credito ---
  protected readonly esCredito = signal<boolean>(false);
  protected readonly cantidadCuotas = signal<number | null>(null);
  protected readonly fechaInicioCredito = signal<string>(new Date().toISOString().split('T')[0]);
  // Frecuencia del plan. Default 'Mensual' (coincide con el backend cuando
  // el campo viene null o no se manda).
  protected readonly frecuencias: Array<{ value: 'Diario' | 'Semanal' | 'Quincenal' | 'Mensual'; label: string }> = [
    { value: 'Diario', label: 'Diaria' },
    { value: 'Semanal', label: 'Semanal' },
    { value: 'Quincenal', label: 'Quincenal' },
    { value: 'Mensual', label: 'Mensual' }
  ];
  protected readonly frecuencia = signal<'Diario' | 'Semanal' | 'Quincenal' | 'Mensual'>('Mensual');
  // Pago inicial (down-payment) para ventas a crédito. Default 0 — el
  // cliente no siempre da inicial. En contado este valor se ignora
  // (los pagos vienen del array `pagos`).
  protected readonly pagoInicialCredito = signal<number>(0);

  protected readonly opcionesCliente = computed<DropdownOption[]>(() =>
    this.clientes().map(c => ({
      value: c.id,
      label: c.nombre,
      sublabel: c.documento ? `Doc: ${c.documento}` : 'Sin documento'
    }))
  );

  protected readonly opcionesProducto = computed<DropdownOption[]>(() =>
    this.productos().map(p => ({
      value: p.id,
      label: p.nombre,
      sublabel: p.codigoBarra ?? '',
      badge: `Stock ${p.stockActual}`,
      badgeClass: p.stockActual < (p.stockMinimo ?? 10) ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
    }))
  );

  protected readonly metodosPago = signal<MetodoPago[]>([]);
  protected readonly cargandoMetodosPago = signal<boolean>(true);

  protected readonly opcionesMetodosPago = computed<DropdownOption[]>(() =>
    this.metodosPago().map(m => ({
      value: m.id,
      label: m.nombre
    }))
  );

  protected readonly opcionesEstadoPago: DropdownOption<EstadoPago | null>[] = [
    { value: 'Pagado', label: 'Pagado' },
    { value: 'Parcial', label: 'Parcial' },
    { value: 'Pendiente', label: 'Pendiente' }
  ];

  // --- Filtros del listado ---
  protected readonly filtros = signal<VentaFiltros>({
    desde: null,
    hasta: null,
    clienteId: null,
    estadoPago: null
  });

  protected readonly opcionesFiltroCliente = computed<DropdownOption<number | null>[]>(() => [
    { value: null, label: 'Todos los clientes', sublabel: 'Sin filtro' },
    ...this.clientes().map(c => ({ value: c.id, label: c.nombre }))
  ]);

  // --- KPIs calculados sobre las ventas filtradas ---
  protected readonly kpis = computed<KpiVentas>(() => {
    const lista = this.ventas();
    // Acumulamos con redondeo a 2 decimales para evitar drift de floating-point
    // (p.ej. 33.33 * 3 = 99.99000000000001 sin redondeo).
    const totalVendido = lista.reduce((acc, v) => this.round2(acc + (Number(v.montoTotal) || 0)), 0);
    const cantidadVentas = lista.length;
    const ticketPromedio = cantidadVentas > 0 ? this.round2(totalVendido / cantidadVentas) : 0;
    const ventasCreditoCount = lista.filter(v => v.esCredito).length;
    const ventasCreditoPorcentaje = cantidadVentas > 0
      ? Math.round((ventasCreditoCount / cantidadVentas) * 100)
      : 0;
    return {
      totalVendido,
      cantidadVentas,
      ticketPromedio,
      ventasCreditoCount,
      ventasCreditoPorcentaje
    };
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected formVenta: FormGroup = this.fb.group({
    clienteId: [null, Validators.required],
    observacion: ['', Validators.maxLength(500)],
    detalles: this.fb.array([], Validators.required),
    pagos: this.fb.array([])
  });

  // Modal Cliente
  protected modalClienteAbierto = signal(false);
  protected guardandoCliente = signal(false);
  protected formCliente = this.fb.group({
    tipoDocumentoId: [1],
    nombre: ['', [Validators.required, Validators.maxLength(150)]],
    documento: ['', Validators.maxLength(50)],
    telefono: ['', Validators.maxLength(50)],
    email: ['', [Validators.email, Validators.maxLength(100)]],
    direccion: ['', Validators.maxLength(250)]
  });

  protected confirmarDuplicadosAbierto = signal(false);
  protected clientesDuplicados = signal<Cliente[]>([]);

  get detallesArray(): FormArray {
    return this.formVenta.get('detalles') as FormArray;
  }

  get pagosArray(): FormArray {
    return this.formVenta.get('pagos') as FormArray;
  }

  protected formValue = toSignal(this.formVenta.valueChanges, { initialValue: this.formVenta.value });

  protected readonly totalVenta = computed(() => {
    const val = this.formValue();
    let total = 0;
    if (val && val.detalles) {
      for (const item of val.detalles) {
        // Redondeo a 2 decimales en cada item para evitar drift acumulado
        // (sin esto, 33.33 * 3 da 99.99000000000001).
        const itemTotal = this.round2((Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0));
        total = this.round2(total + itemTotal);
      }
    }
    return total;
  });

  protected readonly totalPagado = computed(() => {
    // En contado, los pagos vienen del array `pagos`.
    // En crédito, el pago inicial es el input dedicado `pagoInicialCredito`
    // y NO usamos el array `pagos` (que en crédito no se muestra al usuario).
    if (this.esCredito()) {
      return this.round2(this.pagoInicialCredito());
    }
    const val = this.formValue();
    let pagado = 0;
    if (val && val.pagos) {
      for (const pago of val.pagos) {
        pagado = this.round2(pagado + (Number(pago.monto) || 0));
      }
    }
    return pagado;
  });

  protected readonly saldoPendiente = computed(() => {
    return this.round2(this.totalVenta() - this.totalPagado());
  });

  protected readonly pagoExcedido = computed(() => {
    return this.totalPagado() > this.totalVenta();
  });

  protected readonly pagoInvalido = computed(() => {
    const val = this.formValue();
    if (!val || !val.pagos) return false;
    // En ventas a crédito no se requiere pago inicial; el (único) row vacío
    // que se auto-crea en ngOnInit (monto=0) sería "inválido" sin este guard.
    // En contado, sí exigimos que cada pago tenga monto > 0.
    if (this.esCredito()) return false;
    return val.pagos.some((p: any) => Number(p.monto) <= 0);
  });

  protected readonly detalleInvalido = computed(() => {
    const val = this.formValue();
    if (!val || !val.detalles) return false;
    return val.detalles.some((d: any) => Number(d.cantidad) <= 0 || Number(d.precioUnitario) < 0);
  });

  protected readonly stockExcedido = computed(() => {
    const val = this.formValue();
    if (!val || !val.detalles) return false;
    return val.detalles.some((d: any) => (Number(d.cantidad) || 0) > (Number(d.stockActual) || 0));
  });

  // --- Computed: cliente seleccionado actualmente ---
  protected readonly clienteSeleccionado = computed<Cliente | null>(() => {
    const id = this.formValue()?.clienteId;
    if (id == null) return null;
    return this.clientes().find(c => c.id === Number(id)) ?? null;
  });

  // --- Computed: deuda actual del cliente seleccionado ---
  protected readonly saldoActualCliente = computed<number>(() => {
    const cli = this.clienteSeleccionado();
    if (!cli) return 0;
    return this.ventas()
      .filter(v => v.clienteId === cli.id && v.estadoPago !== 'Pagado')
      .reduce((acc, v) => this.round2(acc + (Number(v.saldoPendiente) || 0)), 0);
  });

  /** Redondeo a 2 decimales — evita drift acumulado de floating-point
   *  (33.33 + 33.33 + 33.34 debería ser exactamente 100.00). */
  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
  // --- Preview del plan de cuotas (server-side via /preview-plan) ---
  // Antes era un `computed` con math en JS — tenia un bug de month-end
  // overflow (31/01 → 03/03 en lugar de 28/02) porque `Date.setMonth` no
  // maneja overflow como .NET AddMonths. Ahora el backend calcula el
  // plan y lo expone via `previewPlan()`. El effect dispara el fetch
  // cada vez que cambian los inputs; el `onCleanup` cancela el request
  // in-flight del input anterior (switchMap-like).
  private readonly _planCuotas = signal<CuotaPreview[]>([]);
  protected readonly planCuotas = this._planCuotas.asReadonly();

  // Effect definido en el constructor abajo (necesita `inject()` despues del field init).


  // --- Computed: excede limite de credito? ---
  protected readonly excedeLimiteCredito = computed<boolean>(() => {
    if (!this.esCredito()) return false;
    const cli = this.clienteSeleccionado();
    if (!cli || cli.limiteCredito == null) return false;
    return (this.saldoActualCliente() + this.totalVenta()) > cli.limiteCredito;
  });

  // --- Validacion: cantidad de cuotas invalida ---
  protected readonly cantidadCuotasInvalida = computed<boolean>(() => {
    if (!this.esCredito()) return false;
    const n = this.cantidadCuotas();
    return n == null || n < 1 || n > 36 || !Number.isInteger(n);
  });

  constructor() {
    // Effect: cada vez que cambian los inputs del plan, dispara un
    // preview-plan al backend. El `onCleanup` cancela el request
    // pendiente del input anterior (efecto = switchMap manual).
    effect((onCleanup) => {
      const esCredito = this.esCredito();
      const n = this.cantidadCuotas();
      const total = this.totalVenta();
      const inicio = this.fechaInicioCredito();

      if (!esCredito || !n || n < 1 || n > 36 || total <= 0 || !inicio) {
        this._planCuotas.set([]);
        return;
      }

      const sub = this.apiVentas.previewPlan(total, n, inicio, this.frecuencia()).subscribe({
        next: (cuotas) => this._planCuotas.set(cuotas),
        error: () => this._planCuotas.set([])
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.cargarVentas();
    this.cargarDatos();
    this.cargarMetodosPago();
    this.agregarPagoVacio();
  }

  protected cargarMetodosPago(): void {
    this.cargandoMetodosPago.set(true);
    this.apiVentas.listarMetodosPago().subscribe({
      next: (res) => {
        this.metodosPago.set(res);
        this.cargandoMetodosPago.set(false);
      },
      error: () => {
        this.notify.error('Error al cargar métodos de pago');
        this.cargandoMetodosPago.set(false);
      }
    });
  }

  protected cargarVentas() {
    this.cargandoVentas.set(true);
    this.apiVentas.listar(this.filtros()).subscribe({
      next: (res) => {
        this.ventas.set(res);
        this.cargandoVentas.set(false);
      },
      error: () => {
        this.notify.error('Error al cargar ventas');
        this.cargandoVentas.set(false);
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
    this.filtros.set({ desde: null, hasta: null, clienteId: null, estadoPago: null });
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.cargarVentas();
  }

  private scheduleReload() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.cargarVentas();
    }, 300);
  }

  protected abrirPOS() {
    this.isPosOpen.set(true);
  }

  protected cerrarPOS() {
    this.isPosOpen.set(false);
    this.formVenta.reset({ clienteId: null, observacion: '' });
    this.detallesArray.clear();
    this.pagosArray.clear();
    this.agregarPagoVacio();
    this.esCredito.set(false);
    this.cantidadCuotas.set(null);
    this.fechaInicioCredito.set(new Date().toISOString().split('T')[0]);
  }

  private async cargarDatos() {
    this.apiClientes.listar().subscribe({
      next: (res) => this.clientes.set(res),
      error: () => this.notify.error('Error al cargar clientes')
    });

    this.apiProductos.selector().subscribe({
      next: (res) => this.productos.set(res),
      error: () => this.notify.error('Error al cargar productos')
    });
  }

  protected onProductoSeleccionado(id: unknown) {
    if (id == null) return;
    const prodId = Number(id);
    const prod = this.productos().find(p => p.id === prodId);
    if (prod) {
      this.agregarProductoAlCarrito(prod);
    }
  }

  private agregarProductoAlCarrito(prod: ProductoSelectorItem) {
    const existente = this.detallesArray.controls.find(c => c.get('productoId')?.value === prod.id);
    if (existente) {
      const cant = existente.get('cantidad')?.value || 1;
      existente.patchValue({ cantidad: cant + 1 });
      this.notify.success(`+1 agregado a ${prod.nombre}`);
      return;
    }

    this.detallesArray.push(this.fb.group({
      productoId: [prod.id, Validators.required],
      nombre: [prod.nombre],
      stockActual: [prod.stockActual],
      cantidad: [1, [Validators.required, Validators.min(1), Validators.max(2147483647)]],
      precioUnitario: [prod.precioVentaSugerido || 0, [Validators.required, Validators.min(0), Validators.max(99999999999999.99)]]
    }));
  }

  protected removerDetalle(index: number) {
    this.detallesArray.removeAt(index);
  }

  protected agregarPagoVacio() {
    this.pagosArray.push(this.fb.group({
      metodoPagoId: [1, Validators.required],
      monto: [0, [Validators.required, Validators.min(0), Validators.max(99999999999999.99)]]
    }));
  }

  protected removerPago(index: number) {
    this.pagosArray.removeAt(index);
  }

  protected toggleEsCredito(value: boolean) {
    this.esCredito.set(value);
    if (!value) {
      // Switching to contado: reset credito fields and clear credit-related state
      this.cantidadCuotas.set(null);
      this.pagoInicialCredito.set(0);
      this.frecuencia.set('Mensual');
    } else {
      // Switching to credito: reset contado payments to start fresh
      this.pagosArray.clear();
      this.agregarPagoVacio();
    }
  }

  protected onCantidadCuotasChange(value: unknown) {
    const n = value == null || value === '' ? null : Number(value);
    this.cantidadCuotas.set(Number.isFinite(n!) ? n : null);
  }

  protected onFechaInicioChange(value: string) {
    this.fechaInicioCredito.set(value);
  }

  protected abrirModalCliente() {
    this.formCliente.reset();
    this.modalClienteAbierto.set(true);
  }

  protected cerrarModalCliente() {
    this.modalClienteAbierto.set(false);
  }

  protected setTipoDocumento(tipoId: number) {
    this.formCliente.patchValue({ tipoDocumentoId: tipoId });
    if (tipoId === 3) { // Sin doc
      this.formCliente.patchValue({ documento: '' });
      this.formCliente.get('documento')?.disable();
    } else {
      this.formCliente.get('documento')?.enable();
    }
  }

  protected intentarGuardarClienteRapido() {
    if (this.formCliente.invalid) {
      this.formCliente.markAllAsTouched();
      return;
    }

    const nombre = this.formCliente.get('nombre')?.value?.toLowerCase().trim() || '';
    const documento = this.formCliente.get('documento')?.value?.trim() || '';

    const coincidencias = this.clientes().filter(c => {
      const matchNombre = c.nombre.toLowerCase().includes(nombre);
      const matchDoc = documento !== '' && c.documento === documento;
      return matchNombre || matchDoc;
    });

    if (coincidencias.length > 0) {
      this.clientesDuplicados.set(coincidencias);
      this.confirmarDuplicadosAbierto.set(true);
    } else {
      this.ejecutarGuardarClienteRapido();
    }
  }

  protected cancelarGuardarDuplicado() {
    this.confirmarDuplicadosAbierto.set(false);
    this.clientesDuplicados.set([]);
  }

  protected ejecutarGuardarClienteRapido() {
    this.confirmarDuplicadosAbierto.set(false);
    const val = this.formCliente.getRawValue();
    const payload: CrearClientePayload = {
      nombre: val.nombre!,
      documento: val.documento || undefined,
      telefono: val.telefono || undefined,
      email: val.email || undefined,
      tipoDocumentoId: val.tipoDocumentoId,
      direccion: val.direccion || undefined
    } as any;

    this.guardandoCliente.set(true);
    this.apiClientes.crear(payload).subscribe({
      next: (cliente) => {
        this.clientes.update(c => [...c, cliente]);
        this.formVenta.patchValue({ clienteId: cliente.id });
        this.notify.success('Cliente creado y seleccionado');
        this.cerrarModalCliente();
        this.guardandoCliente.set(false);
      },
      error: () => {
        this.notify.error('Error al crear cliente');
        this.guardandoCliente.set(false);
      }
    });
  }

  protected procesarVenta() {
    if (this.formVenta.invalid) {
      this.formVenta.markAllAsTouched();
      this.notify.error('Completa los campos obligatorios');
      return;
    }

    if (this.detallesArray.length === 0) {
      this.notify.error('Agrega al menos un producto a la venta');
      return;
    }

    if (this.detalleInvalido()) {
      this.notify.error('Las cantidades y precios deben ser mayores a 0');
      return;
    }

    if (this.pagoExcedido()) {
      this.notify.error('El monto pagado no puede superar el total de la venta');
      return;
    }

    if (this.pagoInvalido()) {
      this.notify.error('Los montos de pago deben ser mayores a 0. Si es a crédito, no agregue pagos.');
      return;
    }

    if (this.stockExcedido()) {
      this.notify.error('La cantidad solicitada supera el stock disponible de uno o más productos');
      return;
    }

    if (this.esCredito()) {
      if (this.cantidadCuotasInvalida()) {
        this.notify.error('Indique una cantidad de cuotas válida (1 a 36).');
        return;
      }
      if (this.totalPagado() >= this.totalVenta()) {
        this.notify.error('Una venta a crédito debe tener saldo pendiente mayor a 0. Use una venta normal si va a cobrar el total.');
        return;
      }
      if (this.excedeLimiteCredito()) {
        const cli = this.clienteSeleccionado();
        this.notify.error(
          `El cliente supera su límite de crédito. Deuda actual: S/ ${this.saldoActualCliente().toFixed(2)}, nuevo total: S/ ${this.totalVenta().toFixed(2)}, límite: S/ ${(cli?.limiteCredito ?? 0).toFixed(2)}.`
        );
        return;
      }
    }

    const value = this.formVenta.value;
    // En crédito, el pago inicial va como un único pago en el array `pagos`
    // (el backend lo trata igual que cualquier otro abono).
    // En contado, mantenemos el array actual del form.
    let pagosFinales: Array<{ monto: number; metodoPagoId: number }>;
    if (this.esCredito()) {
      const pagoInicial = this.pagoInicialCredito();
      pagosFinales = pagoInicial > 0
        ? [{ monto: pagoInicial, metodoPagoId: Number(value.pagos?.[0]?.metodoPagoId ?? 1) }]
        : [];
    } else {
      pagosFinales = (value.pagos ?? []).map((p: any) => ({
        monto: Number(p.monto),
        metodoPagoId: Number(p.metodoPagoId)
      }));
    }

    const payload: CrearVentaPayload = {
      clienteId: Number(value.clienteId),
      detalles: value.detalles.map((d: any) => ({
        productoId: Number(d.productoId),
        cantidad: Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario)
      })),
      pagos: pagosFinales.length > 0 && pagosFinales.some(p => p.monto > 0) ? pagosFinales : [],
      observacion: value.observacion ? value.observacion.toString().trim() : undefined,
      cantidadCuotas: this.esCredito() ? this.cantidadCuotas() : null,
      frecuencia: this.esCredito() ? this.frecuencia() : null,
      fechaInicioCredito: this.esCredito() ? this.fechaInicioCredito() : null
    };

    this.procesando.set(true);
    this.apiVentas.registrarVenta(payload).subscribe({
      next: () => {
        this.notify.success('Venta registrada exitosamente');
        this.procesando.set(false);
        this.cerrarPOS();
        this.cargarVentas();
      },
      error: (err) => {
        const msg = err?.error?.detail || err?.error || 'Error al registrar la venta';
        this.notify.error(typeof msg === 'string' ? msg : 'Error al registrar la venta');
        this.procesando.set(false);
      }
    });
  }
}
