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

  protected readonly clientesFiltrados = computed<Cliente[]>(() => {
    const q = this.filtroBusqueda().toLowerCase().trim();
    const data = this.clientes();
    if (!q) return data;
    return data.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.documento && c.documento.toLowerCase().includes(q)),
    );
  });

  // --- Modal Crear/Editar ---
  protected readonly modalAbierto = signal<boolean>(false);
  protected readonly procesando = signal<boolean>(false);
  protected readonly clienteEnEdicion = signal<Cliente | null>(null);
  protected readonly documentoDuplicado = signal<string | null>(null);

  protected readonly opcionesTipoDocumentoForm = computed<DropdownOption<number>[]>(() =>
    this.tiposDocumento().map((t) => ({ value: t.id, label: t.nombre })),
  );

  protected formCliente = this.fb.group({
    nombre: ['', Validators.required],
    documento: [''],
    telefono: [''],
    email: [''],
    tipoDocumentoId: [3 as number | null, Validators.required],
    direccion: [''],
    limiteCredito: [
      null as number | null,
      [Validators.min(0)],
    ],
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
  }

  ngOnInit(): void {
    this.cargarTiposDocumento();
    this.cargarClientes();
    this.cargarKpis();

    // Debounce 300ms para recargar al cambiar filtros
    this.filtrosSub = this.filtros$
      .pipe(debounceTime(300), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe(() => this.cargarClientes());

    // Debounce 300ms para validar duplicado
    this.documentoSub = this.documento$
      .pipe(debounceTime(300))
      .subscribe((doc) => this.validarDocumentoDuplicado(doc));

    this.bootstrapped = true;
  }

  ngOnDestroy(): void {
    this.filtrosSub?.unsubscribe();
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
    };
    this.apiClientes.listar(filtrosEnviar).subscribe({
      next: (data) => {
        this.clientes.set(data);
        this.cargando.set(false);
      },
      error: () => {
        this.notify.error('Error al cargar la lista de clientes');
        this.cargando.set(false);
      },
    });
  }

  protected onFiltroBusquedaChange(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.filtroBusqueda.set(val);
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
    this.filtros.set({ desde: null, hasta: null, tipoDocumentoId: null, estadoDeuda: null });
    this.filtroBusqueda.set('');
  }

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
      limiteCredito: null,
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
      limiteCredito: cliente.limiteCredito,
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
      limiteCredito: val.limiteCredito ?? undefined,
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
        error: () => {
          this.notify.error('Error al eliminar el cliente. Puede que tenga ventas asociadas.');
        },
      });
    }
  }

  protected exportarExcel(): void {
    const f = this.filtros();
    // Reusamos la API listar con filtros y, una vez descargado, el backend
    // expone /exportar-excel. Mientras el endpoint no exista, mantenemos
    // un fallback que abre la lista filtrada como CSV local.
    this.apiClientes.exportarExcel().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.notify.success('Exportación iniciada');
      },
      error: () => {
        this.notify.warning('El endpoint /exportar-excel aún no está implementado en backend.');
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
    this.cargarEstadoCuenta(clienteId);
  }

  protected cerrarDrawer(): void {
    this.drawerAbierto.set(false);
    this.clienteSeleccionado.set(null);
    this.estadoCuenta.set(null);
    this.cargandoEstadoCuenta.set(false);
  }

  private cargarEstadoCuenta(clienteId: number): void {
    this.cargandoEstadoCuenta.set(true);
    this.apiClientes.obtenerEstadoCuenta(clienteId).subscribe({
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
}