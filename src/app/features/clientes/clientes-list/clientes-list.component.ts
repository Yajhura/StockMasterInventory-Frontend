import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ApiClientesService } from '../../../core/api/api-clientes.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  Cliente,
  CrearClientePayload,
  ClienteFiltros,
  TipoDocumento,
  EstadoCuentaCliente,
  KpiClientes,
  PaginatedClientes,
} from '../../../core/models/cliente.models';
import { DropdownComponent, DropdownOption } from '../../../core/components/dropdown.component';

@Component({
  selector: 'app-clientes-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DropdownComponent],
  templateUrl: './clientes-list.component.html',
})
export class ClientesListComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly apiClientes = inject(ApiClientesService);
  private readonly notify = inject(NotificationService);

  // --- Estado general ---
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargando = signal<boolean>(true);
  protected readonly tiposDocumento = signal<TipoDocumento[]>([]);

  // --- Paginacion (C-4 / K-4 audit) ---
  protected readonly totalClientes = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly page = signal<number>(1);
  protected readonly pageSize = signal<number>(50);

  // --- Papelera (F-1 / A-6 audit): toggle que cambia el set visible
  //     entre "solo activos" (default) y "incluye soft-deleted".
  protected readonly mostrarPapelera = signal<boolean>(false);

  // --- KPIs del directorio ---
  protected readonly kpis = signal<KpiClientes | null>(null);

  // --- Drawer estado de cuenta ---
  protected readonly drawerAbierto = signal<boolean>(false);
  protected readonly clienteSeleccionado = signal<number | null>(null);
  protected readonly estadoCuenta = signal<EstadoCuentaCliente | null>(null);
  protected readonly cargandoEstadoCuenta = signal<boolean>(false);

  // --- Filtros ---
  protected readonly filtros = signal<ClienteFiltros>({
    desde: null,
    hasta: null,
    tipoDocumentoId: null,
    estadoDeuda: null,
    q: null,
  });
  protected readonly filtroBusqueda = signal<string>('');

  protected readonly opcionesTipoDocumento = computed<DropdownOption<number | null>[]>(() => [
    { value: null, label: 'Todos los tipos' },
    ...this.tiposDocumento().map((t) => ({ value: t.id, label: t.nombre })),
  ]);

  protected readonly opcionesEstadoDeuda = computed<DropdownOption<string | null>[]>(() => [
    { value: null, label: 'Todos' },
    { value: 'con-deuda', label: 'Con deuda' },
    { value: 'sin-deuda', label: 'Sin deuda' },
  ]);

  /**
   * G-1 / C-1 audit (fix #8+#9): antes el FE filtraba en memoria con
   * substring sobre la pagina recibida. Ahora el filtro va al backend
   * via `q` (server-side LIKE). El array que pinta la tabla es el que
   * devuelve el endpoint paginado, sin filtrar de nuevo.
   */
  protected readonly clientesFiltrados = computed<Cliente[]>(() => this.clientes());

  // --- Modal Crear/Editar ---
  protected readonly modalAbierto = signal<boolean>(false);
  protected readonly procesando = signal<boolean>(false);
  protected readonly clienteEnEdicion = signal<Cliente | null>(null);
  protected readonly documentoDuplicado = signal<string | null>(null);

  protected readonly opcionesTipoDocumentoForm = computed<DropdownOption<number>[]>(() =>
    this.tiposDocumento().map((t) => ({ value: t.id, label: t.nombre })),
  );

  /**
   * A-1 / B-1 audit (fix #6): placeholder dinamico segun el tipo de
   * documento seleccionado. DNI = "12345678", RUC = "20123456789", Sin doc.
   * = vacio.
   */
  protected readonly placeholderDocumento = computed<string>(() => {
    const tipo = this.formCliente.get('tipoDocumentoId')?.value;
    if (tipo === 1) return 'DNI (8 digitos)';
    if (tipo === 2) return 'RUC (11 digitos)';
    return 'Opcional';
  });

  /**
   * A-1 / B-1 audit (fix #6): mensaje de error inline para el campo
   * documento segun el tipo y el motivo del fallo.
   */
  protected readonly mensajeErrorDocumento = computed<string>(() => {
    const ctrl = this.formCliente.get('documento');
    if (!ctrl || !ctrl.errors) return '';
    const tipo = this.formCliente.get('tipoDocumentoId')?.value;
    if (tipo === 1) {
      if (ctrl.errors['required']) return 'El DNI es obligatorio.';
      if (ctrl.errors['pattern']) return 'El DNI debe tener exactamente 8 digitos.';
    }
    if (tipo === 2) {
      if (ctrl.errors['required']) return 'El RUC es obligatorio.';
      if (ctrl.errors['pattern']) return 'El RUC debe tener exactamente 11 digitos.';
    }
    return 'Documento invalido.';
  });

  protected formCliente = this.fb.group({
    nombre: ['', Validators.required],
    documento: [''],
    telefono: [''],
    // B-3 audit: Validators.email + maxLength. El campo es opcional (no
    // required), asi que Validators.email solo dispara cuando el operador
    // tipea algo — empty string lo deja valido.
    email: ['', [Validators.email, Validators.maxLength(100)]],
    tipoDocumentoId: [3 as number | null, Validators.required],
    direccion: ['', Validators.maxLength(250)],
  });

  // --- Debounce para recarga cuando cambian filtros ---
  private readonly filtros$ = new Subject<ClienteFiltros>();
  private filtrosSub?: Subscription;
  private bootstrapped = false;

  // --- Debounce para validación de duplicados ---
  private readonly documento$ = new Subject<string>();
  private documentoSub?: Subscription;

  constructor() {
    // Cada vez que cambia el signal filtros, emitir al Subject con debounce.
    // Se ignora la primera emisión porque ngOnInit ya dispara la carga inicial.
    effect(() => {
      const f = this.filtros();
      if (this.bootstrapped) {
        this.filtros$.next(f);
      }
    });

    // Cada vez que cambia el documento en el form, validar duplicado
    this.formCliente.get('documento')?.valueChanges.subscribe((val) => {
      this.documento$.next((val ?? '').toString());
    });

    // A-1 / B-1 audit (fix #6): ajustar validators de `documento` segun
    // el `tipoDocumentoId`. DNI = 8 digitos, RUC = 11 digitos, Sin doc.
    // = null/empty (campo opcional). valueChanges dispara cuando el usuario
    // cambia el dropdown o cuando cargarTiposDocumento re-asigna defaults.
    this.formCliente.get('tipoDocumentoId')?.valueChanges.subscribe((tipo) => {
      this.aplicarValidadorDocumento(tipo);
    });
    // Aplicar el inicial por si el default (3) ya estaba al construir el form.
    this.aplicarValidadorDocumento(this.formCliente.get('tipoDocumentoId')?.value);
  }

  /**
   * A-1 / B-1 audit (fix #6): agrega o remueve el `Validators.pattern`
   * del campo `documento` segun el TipoDocumentoId. DNI = exactamente 8
   * digitos, RUC = exactamente 11, Sin doc. = documento vacio (sin pattern).
   * Si el valor actual no cumple el nuevo pattern, lo borra y marca el
   * control como touched para que el error sea visible al usuario.
   */
  private aplicarValidadorDocumento(tipoId: number | null | undefined): void {
    const docCtrl = this.formCliente.get('documento');
    if (!docCtrl) return;
    // Siempre limpiamos validators custom y luego re-aplicamos segun tipo.
    docCtrl.clearValidators();
    if (tipoId === 1) {
      docCtrl.addValidators([Validators.pattern(/^\d{8}$/)]);
    } else if (tipoId === 2) {
      docCtrl.addValidators([Validators.pattern(/^\d{11}$/)]);
    }
    // Sin doc. (3) o tipo desconocido: sin pattern, sigue siendo opcional.
    docCtrl.updateValueAndValidity();
    // Si el valor actual no matchea el nuevo pattern, no lo limpiamos
    // automaticamente — el usuario lo vera en rojo y lo corregira.
    if (docCtrl.invalid && docCtrl.value) {
      docCtrl.markAsTouched();
    }
  }

  ngOnInit(): void {
    this.cargarTiposDocumento();
    this.cargarClientes();
    this.cargarKpis();

    // Debounce 300ms para recargar al cambiar filtros
    this.filtrosSub = this.filtros$
      .pipe(debounceTime(300), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe(() => this.cargarClientes());

    // Debounce 200ms para la busqueda server-side (G-1 / C-1 audit fix #8+#9)
    this.busquedaSub = this.busqueda$
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((q) => {
        // Al cambiar `q`, reseteamos a la primera pagina porque el
        // set de resultados cambia. Si el usuario esta en la pagina 5 y
        // escribe un termino que solo tiene 2 paginas, queremos que vea
        // la primera pagina de los resultados filtrados.
        this.filtros.update((f) => ({ ...f, q: q.trim() || null }));
        this.page.set(1);
      });

    // Debounce 300ms para validar duplicado
    this.documentoSub = this.documento$
      .pipe(debounceTime(300))
      .subscribe((doc) => this.validarDocumentoDuplicado(doc));

    this.bootstrapped = true;
  }

  ngOnDestroy(): void {
    this.filtrosSub?.unsubscribe();
    this.busquedaSub?.unsubscribe();
    this.documentoSub?.unsubscribe();
  }

  private cargarTiposDocumento(): void {
    this.apiClientes.listarTiposDocumento().subscribe({
      next: (tipos) => this.tiposDocumento.set(tipos),
      error: () => this.notify.error('Error al cargar los tipos de documento'),
    });
  }

  private cargarClientes(): void {
    this.cargando.set(true);
    const f = this.filtros();
    const filtrosEnviar: ClienteFiltros = {
      desde: f.desde,
      hasta: f.hasta,
      tipoDocumentoId: f.tipoDocumentoId,
      estadoDeuda: f.estadoDeuda,
      q: f.q,
      page: this.page(),
      size: this.pageSize(),
      // F-1 audit: si la papelera esta activa, pedimos explicitamente
      // que el backend incluya soft-deleted en el listado.
      incluirEliminados: this.mostrarPapelera(),
    };
    this.apiClientes.listar(filtrosEnviar).subscribe({
      next: (data: PaginatedClientes) => {
        // C-4 audit: el backend ahora devuelve un envelope paginado.
        // items es la pagina actual; totalItems/totalPages alimentan la UI.
        this.clientes.set(data.items);
        this.totalClientes.set(data.totalItems);
        this.totalPages.set(data.totalPages);
        // Si el backend clamp-eo la pagina (ej. borraron el ultimo registro),
        // sincronizamos el signal con la pagina efectiva que devolvio.
        if (data.page !== this.page()) this.page.set(data.page);
        this.cargando.set(false);
      },
      error: () => {
        this.notify.error('Error al cargar la lista de clientes');
        this.cargando.set(false);
      },
    });
  }

  /**
   * G-1 / C-1 audit (fix #8+#9): el input de busqueda dispara un debounce
   * de 200ms antes de pedir la pagina 1 con `q` al backend. Asi evitamos
   * mandar un request por cada tecla tipeada. Tambien resetea la pagina
   * a 1 — sino quedaria en la pagina 5 sin resultados visibles.
   */
  private readonly busqueda$ = new Subject<string>();
  private busquedaSub?: Subscription;

  protected onFiltroBusquedaChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.filtroBusqueda.set(val);
    this.busqueda$.next(val);
  }

  protected onFiltroFechaChange(campo: 'desde' | 'hasta', valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor || null }));
  }

  protected onFiltroTipoDocChange(valor: number | null): void {
    this.filtros.update((f) => ({ ...f, tipoDocumentoId: valor }));
  }

  protected onFiltroEstadoChange(valor: string | null): void {
    const estado = valor === 'con-deuda' || valor === 'sin-deuda' ? valor : null;
    this.filtros.update((f) => ({ ...f, estadoDeuda: estado }));
  }

  protected limpiarFiltros(): void {
    this.filtros.set({ desde: null, hasta: null, tipoDocumentoId: null, estadoDeuda: null, q: null });
    this.filtroBusqueda.set('');
    // Reset a la primera pagina para que el usuario vea todo el catalogo
    // despues de limpiar. El effect() del constructor re-disparara la carga.
    this.page.set(1);
  }

  /**
   * F-1 audit: toggle de papelera. Al activarla, recargamos el listado
   * pidiendo incluirEliminados=true. Al desactivarla, tambien recargamos
   * para volver a la vista por defecto (solo activos). Reset a pagina 1
   * porque el set cambia.
   */
  protected togglePapelera(): void {
    this.mostrarPapelera.update((v) => !v);
    this.page.set(1);
    // El effect() del constructor va a re-disparar cargarClientes cuando
    // detecte el cambio de mostrarPapelera... pero aca NO esta en el
    // signal `filtros`, asi que lo invocamos manualmente.
    this.cargarClientes();
  }

  /**
   * F-1 audit: revierte el soft delete. Solo Admin. El backend limpia
   * Eliminado/EliminadoEn/EliminadoPor y actualiza ModificadoPor.
   * Despues recargamos el listado y los KPIs.
   */
  protected confirmarRestaurar(cliente: Cliente): void {
    if (!confirm(`Restaurar a ${cliente.nombre}? Volvera a estar visible en el directorio activo.`)) {
      return;
    }
    this.apiClientes.restaurar(cliente.id).subscribe({
      next: () => {
        this.notify.success('Cliente restaurado');
        this.cargarClientes();
        this.cargarKpis();
      },
      error: (err) => {
        // 409 Conflict tipico: ya existe otro cliente activo con el mismo
        // documento. Mostramos el mensaje del backend si esta disponible.
        const mensaje = err?.error?.error
          || 'Error al restaurar el cliente';
        this.notify.error(mensaje);
      },
    });
  }

  /**
   * Avanza/retrocede a la pagina indicada. Si el numero esta fuera de
   * [1, totalPages], no hace nada (la UI deshabilita los botones igual).
   */
  protected irAPagina(nuevaPagina: number): void {
    if (nuevaPagina < 1 || nuevaPagina === this.page()) return;
    this.page.set(nuevaPagina);
  }

  /** Computed para saber si hay pagina anterior / siguiente. */
  protected readonly hayPaginaAnterior = computed<boolean>(() => this.page() > 1);
  protected readonly hayPaginaSiguiente = computed<boolean>(() => this.page() < this.totalPages());

  protected abrirModalNuevo(): void {
    this.clienteEnEdicion.set(null);
    this.documentoDuplicado.set(null);
    this.formCliente.reset({
      nombre: '',
      documento: '',
      telefono: '',
      email: '',
      tipoDocumentoId: this.tiposDocumento()[0]?.id ?? 3,
      direccion: '',
    });
    this.modalAbierto.set(true);
  }

  protected abrirModalEditar(cliente: Cliente): void {
    this.clienteEnEdicion.set(cliente);
    this.documentoDuplicado.set(null);
    this.formCliente.reset({
      nombre: cliente.nombre,
      documento: cliente.documento ?? '',
      telefono: cliente.telefono ?? '',
      email: cliente.email ?? '',
      tipoDocumentoId: cliente.tipoDocumentoId,
      direccion: cliente.direccion ?? '',
    });
    this.modalAbierto.set(true);
  }

  protected cerrarModal(): void {
    this.modalAbierto.set(false);
    this.clienteEnEdicion.set(null);
    this.documentoDuplicado.set(null);
  }

  protected guardarCliente(): void {
    if (this.formCliente.invalid) {
      this.formCliente.markAllAsTouched();
      return;
    }

    if (this.documentoDuplicado()) {
      this.notify.warning('Este documento ya está registrado. Revisá antes de guardar.');
      return;
    }

    const val = this.formCliente.getRawValue();
    const payload: CrearClientePayload = {
      nombre: val.nombre!.trim(),
      documento: val.documento?.trim() || undefined,
      telefono: val.telefono?.trim() || undefined,
      email: val.email?.trim() || undefined,
      tipoDocumentoId: val.tipoDocumentoId ?? undefined,
      direccion: val.direccion?.trim() || undefined,
    };

    const editando = this.clienteEnEdicion();
    this.procesando.set(true);

    if (editando) {
      this.apiClientes.actualizar(editando.id, payload).subscribe({
        next: (clienteActualizado) => {
          this.clientes.update((cls) =>
            cls.map((c) => (c.id === clienteActualizado.id ? clienteActualizado : c)),
          );
          this.notify.success('Cliente actualizado exitosamente');
          this.cerrarModal();
          this.procesando.set(false);
          this.cargarKpis();
          // Si el drawer muestra este cliente, refrescarlo
          if (this.clienteSeleccionado() === clienteActualizado.id) {
            this.cargarEstadoCuenta(clienteActualizado.id);
          }
        },
        error: () => {
          this.notify.error('Error al actualizar el cliente');
          this.procesando.set(false);
        },
      });
    } else {
      this.apiClientes.crear(payload).subscribe({
        next: (nuevoCliente) => {
          this.clientes.update((cls) => [...cls, nuevoCliente]);
          this.notify.success('Cliente creado exitosamente');
          this.cerrarModal();
          this.procesando.set(false);
          this.cargarKpis();
        },
        error: () => {
          this.notify.error('Error al crear el cliente');
          this.procesando.set(false);
        },
      });
    }
  }

  protected confirmarEliminar(cliente: Cliente): void {
    if (confirm(`¿Estás seguro que deseas eliminar a ${cliente.nombre}?`)) {
      this.apiClientes.eliminar(cliente.id).subscribe({
        next: () => {
          this.clientes.update((cls) => cls.filter((c) => c.id !== cliente.id));
          this.notify.success('Cliente eliminado');
          this.cargarKpis();
          // Si el drawer estaba mostrando este cliente, cerrarlo
          if (this.clienteSeleccionado() === cliente.id) {
            this.cerrarDrawer();
          }
        },
        // A-5 audit (fix #11): tipar el error handler y leer el mensaje
        // real del backend (err.error.error o err.error.title) en lugar
        // del string generico anterior. Asi cuando el backend devuelve
        // 400 con "No se puede eliminar un cliente con ventas registradas."
        // el operador ve ese mensaje, no "Error al eliminar el cliente...".
        error: (err: any) => {
          const mensaje = err?.error?.error
            || err?.error?.title
            || 'Error al eliminar el cliente';
          const texto = typeof mensaje === 'string'
            ? mensaje
            : 'Error al eliminar el cliente';
          this.notify.error(texto);
        },
      });
    }
  }

  protected exportarExcel(): void {
    const f = this.filtros();
    // L-1 audit (fix #13): pasamos los filtros vigentes al endpoint para
    // que el XLSX exporte exactamente la vista que el operador esta viendo
    // (incluyendo el toggle de papelera).
    this.apiClientes.exportarExcel({
      desde: f.desde,
      hasta: f.hasta,
      tipoDocumentoId: f.tipoDocumentoId,
      estadoDeuda: f.estadoDeuda,
      q: f.q,
      incluirEliminados: this.mostrarPapelera(),
    }).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.notify.success('Exportación iniciada');
      },
      error: (err: any) => {
        // L-1 audit (fix #13): si el backend devuelve 413 con
        // code=EXPORT_LIMIT_EXCEEDED lo mostramos literal; el resto cae
        // al mensaje generico.
        const code = err?.error?.code;
        const detail = err?.error?.detail
          || err?.error?.error
          || err?.error?.title
          || 'No se pudo exportar el archivo.';
        this.notify.error(
          code === 'EXPORT_LIMIT_EXCEEDED'
            ? `La exportación supera el límite operativo (${detail}).`
            : detail,
        );
      },
    });
  }

  /**
   * Detecta si el documento tipeado ya existe en otro cliente.
   * Si coincide con el del cliente que se está editando, no es duplicado.
   */
  private validarDocumentoDuplicado(documento: string): void {
    const trimmed = documento.trim().toLowerCase();
    if (!trimmed) {
      this.documentoDuplicado.set(null);
      return;
    }

    const editando = this.clienteEnEdicion();
    if (editando && (editando.documento ?? '').trim().toLowerCase() === trimmed) {
      this.documentoDuplicado.set(null);
      return;
    }

    const existente = this.clientes().find(
      (c) => (c.documento ?? '').trim().toLowerCase() === trimmed,
    );
    if (existente) {
      this.documentoDuplicado.set(existente.nombre);
    } else {
      this.documentoDuplicado.set(null);
    }
  }

  protected clienteTieneDeuda(cliente: Cliente): boolean {
    return cliente.tieneDeuda;
  }

  // --- KPIs ---

  protected cargarKpis(): void {
    this.apiClientes.kpis().subscribe({
      next: (data) => this.kpis.set(data),
      error: () => {
        // Silencioso: si falla, los KPIs quedan en null y el template no rompe.
      },
    });
  }

  // --- Drawer estado de cuenta ---

  protected verCuenta(clienteId: number): void {
    this.clienteSeleccionado.set(clienteId);
    this.drawerAbierto.set(true);
    // E-2 audit (fix #7): reset a pagina 1 cada vez que se abre el drawer.
    this.estadoCuentaPage.set(1);
    this.cargarEstadoCuenta(clienteId);
  }

  protected cerrarDrawer(): void {
    this.drawerAbierto.set(false);
    this.clienteSeleccionado.set(null);
    this.estadoCuenta.set(null);
    this.cargandoEstadoCuenta.set(false);
    this.estadoCuentaPage.set(1);
  }

  private cargarEstadoCuenta(clienteId: number): void {
    this.cargandoEstadoCuenta.set(true);
    // E-2 audit (fix #7): pagina 1 con default sizeVentas=20 (lo define
    // el service). Para "Ver mas" se llama con pageVentas incrementada.
    this.apiClientes.obtenerEstadoCuenta(clienteId, this.estadoCuentaPage()).subscribe({
      next: (data) => {
        this.estadoCuenta.set(data);
        this.cargandoEstadoCuenta.set(false);
      },
      error: () => {
        this.notify.error('Error al cargar el estado de cuenta');
        this.cargandoEstadoCuenta.set(false);
        this.cerrarDrawer();
      },
    });
  }

  // --- Drawer pagination (E-2 / fix #7) ---
  protected readonly estadoCuentaPage = signal<number>(1);
  protected readonly estadoCuentaSizeVentas = signal<number>(20);
  protected readonly hayMasVentas = computed<boolean>(() => {
    const ec = this.estadoCuenta();
    if (!ec) return false;
    return ec.cantidadVentasMostradas < ec.cantidadVentasTotal;
  });

  protected cargarMasVentas(): void {
    const clienteId = this.clienteSeleccionado();
    if (!clienteId) return;
    this.estadoCuentaPage.update((p) => p + 1);
    this.cargarEstadoCuenta(clienteId);
  }
}
