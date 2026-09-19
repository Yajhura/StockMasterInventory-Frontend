import { Component, OnInit, inject, signal, computed, effect, untracked, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog.component';
import { DropdownComponent, DropdownOption } from '../../core/components/dropdown.component';
import { NotificationService } from '../../core/services/notification.service';
import { InventarioState } from '../../core/state/inventario.state';
import {
  Producto,
  ProductoListItem,
  Movimiento,
} from '../../core/models/inventario.models';

import { PaginadorComponent } from '../../core/components/paginador.component';
import { TABLA_COMPONENTS } from '../../core/components/tabla.component';

interface FilaHistorial {
  id: number;
  fechaHora: string;
  tipo: 'INGRESO' | 'SALIDA';
  producto: string;
  cantidad: number;
  monto: number;
  /** Id del usuario que registro el movimiento (FK a Usuarios). */
  usuarioId: number | null;
  /** Nombre del usuario (join). Null si el FK es null o el usuario fue borrado. */
  usuarioNombre: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ConfirmDialogComponent, DropdownComponent, RouterLink, PaginadorComponent, ...TABLA_COMPONENTS],
})
export class DashboardComponent implements OnInit {
  protected readonly state = inject(InventarioState);
  protected readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly Math = Math;

  // --- Lista paginada (server-side) ---
  /** Lista paginada que se muestra en la tabla del dashboard. */
  protected readonly productos  = this.state.productosPaginados;
  /**
   * Lista FULL de productos (no paginada), para el selector de
   * "Registrar Movimiento". Incluye eliminados logicamente? No:
   * usamos `productosActivos()` que filtra los eliminados.
   */
  protected readonly todosLosProductos = this.state.productos;
  protected readonly productosActivos = computed<Producto[]>(() =>
    this.todosLosProductos().filter((p) => !p.eliminado)
  );
  protected readonly totalItems = this.state.totalItems;
  protected readonly totalPages = this.state.totalPages;
  protected readonly page       = this.state.page;
  protected readonly pageSize   = this.state.pageSize;
  protected readonly buscando   = this.state.buscando;
  protected readonly mostrarPapelera = this.state.mostrarPapelera;

  protected readonly marcas = this.state.marcas;
  protected readonly categorias = this.state.categorias;
  protected readonly atributos = this.state.atributos;

  protected readonly opcionesMarcaFiltro = computed<DropdownOption[]>(() => [
    { value: 'all', label: 'Todas las marcas' },
    { value: 'null', label: '— Sin marca —' },
    ...this.marcas().map((m) => ({ value: m.id, label: m.nombre })),
  ]);

  protected readonly opcionesCategoriaFiltro = computed<DropdownOption[]>(() => [
    { value: 'all', label: 'Todas las categorías' },
    { value: 'null', label: '— Sin categoría —' },
    ...this.categorias().map((c) => ({ value: c.id, label: c.nombre })),
  ]);

  // ---------- Filtros (marca, categoria, atributos) ----------
  protected readonly filtroMarcaId     = signal<number | 'null' | undefined>(undefined);
  protected readonly filtroCategoriaId = signal<number | 'null' | undefined>(undefined);
  /**
   * Filtros EAV activos. Cada uno exige que el producto tenga ese
   * atributo con ese valor. Se combinan con AND.
   */
  protected readonly filtroAtributos = signal<{ atributoId: number; valor: string }[]>([]);
  /**
   * Filtro "stock bajo": si esta definido, muestra solo productos
   * con StockActual <= stockMax. Tipico: 10 para "que reponer".
   */
  protected readonly filtroStockMax = signal<number | null>(null);
  /** Popover de filtros abierto/cerrado. */
  protected readonly filtrosAbiertos = signal<boolean>(false);

  // ---------- Orden ----------
  /** 'nombre' | 'stock' | 'precio' | null (null = id, default backend) */
  protected readonly ordenarPor = signal<'nombre' | 'stock' | 'precio' | null>(null);
  protected readonly ordenarDir = signal<'asc' | 'desc'>('asc');

  protected readonly sortActual = computed<{ by: 'nombre' | 'stock' | 'precio' | 'id'; order: 'asc' | 'desc' }>(() => ({
    by: this.ordenarPor() ?? 'id',
    order: this.ordenarDir(),
  }));

  /** True si hay algun filtro activo (marca, categ, atributo, stock bajo, o sort). */
  protected readonly hayFiltros = computed<boolean>(() =>
    this.filtroMarcaId() !== undefined ||
    this.filtroCategoriaId() !== undefined ||
    this.filtroAtributos().length > 0 ||
    this.filtroStockMax() !== null ||
    this.ordenarPor() !== null
  );

  /**
   * Numero de chips de filtro visibles en la toolbar (sin contar el sort).
   * Sirve para el badge rojo en el boton "Filtros".
   */
  protected readonly filtrosActivosCount = computed<number>(() => {
    let n = 0;
    if (this.filtroMarcaId() !== undefined) n++;
    if (this.filtroCategoriaId() !== undefined) n++;
    n += this.filtroAtributos().length;
    if (this.filtroStockMax() !== null) n++;
    return n;
  });

  // Filtro (estado del input).
  protected readonly filtro = signal<string>('');

  protected readonly procesando = signal<boolean>(false);

  // --- Estado del dialog de confirmacion ---
  protected readonly confirmandoEliminar = signal(false);
  protected readonly productoAEliminar   = signal<ProductoListItem | null>(null);
  protected readonly eliminando         = signal(false);

  protected readonly kpi = computed(() => this.state.kpiInventario());

  protected readonly mensajeEliminar = computed(() => {
    const p = this.productoAEliminar();
    if (!p) return '';
    const codigo = p.codigoBarra ?? 'sin código';
    return `Vas a eliminar el producto "${codigo}" (#${p.id}) y todos sus atributos EAV. Esta accion NO se puede deshacer.`;
  });

  protected readonly formMovimiento: FormGroup = this.fb.group({
    productoId: [null, Validators.required],
    tipoMovimientoId: [1, Validators.required],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    precioUnitario: [0, [Validators.required, Validators.min(0)]],
    cliente: [''],
    observacion: [''],
  });

  // Tracking reactivo del producto seleccionado y de la cantidad en el form,
  // para mostrar el stock disponible y advertir antes de enviar.
  private readonly cantidadValue = signal<number>(1);
  private readonly tipoValue     = signal<1 | 2>(1);

  /**
   * Opciones para el dropdown de Producto. Solo productos NO eliminados.
   * Muestra nombre + SKU + badge con el stock actual (rojo si <10).
   */
  /**
   * Opciones para el dropdown de Producto. Se construyen a partir de la
   * lista LIVIANA (`productosSelector`) que ya excluye eliminados y no
   * trae imagen ni atributos, para escalar bien a miles de productos.
   */
  protected readonly opcionesProducto = computed(() =>
    this.state.productosSelector().map((p) => ({
      value: p.id,
      label: p.nombre,
      sublabel: p.codigoBarra ?? undefined,
      badge: `Stock ${p.stockActual}`,
      badgeClass: p.stockActual < (p.stockMinimo ?? 10)
        ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
        : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    }))
  );

  /** Producto actualmente seleccionado en el form (lo resuelve del state o lo busca en la pagina actual). */
  protected readonly productoDelForm = computed<ProductoListItem | null>(() => {
    const id = this.formMovimiento.get('productoId')?.value;
    if (id == null) return null;
    // Primero cache (lista completa que el state mantiene al detalle)
    const cached = this.state.productos().find((p) => p.id === Number(id));
    if (cached) {
      // Cache devuelve Producto (con atributos), el form solo necesita ProductoListItem
      return {
        id: cached.id,
        nombre: cached.nombre,
        codigoBarra: cached.codigoBarra,
        categoriaId: cached.categoriaId,
        marcaId: cached.marcaId,
        stockActual: cached.stockActual,
        stockMinimo: cached.stockMinimo,
        precioVentaSugerido: cached.precioVentaSugerido,
        atributosCount: cached.atributos.length,
        eliminado: cached.eliminado,
        creadoEn: cached.creadoEn,
        creadoPorId: cached.creadoPorId,
        creadoPorNombre: cached.creadoPorNombre,
        modificadoEn: cached.modificadoEn,
        modificadoPorId: cached.modificadoPorId,
        modificadoPorNombre: cached.modificadoPorNombre,
        imagenMime: cached.imagenMime,
        imagenDataUrl: cached.imagenDataUrl,
      };
    }
    // Si no, lo tomamos de la lista paginada
    return this.productos().find((p) => p.id === Number(id)) ?? null;
  });

  protected readonly stockDisponible = computed<number | null>(() => {
    return this.productoDelForm()?.stockActual ?? null;
  });

  protected readonly stockMinimoDelForm = computed<number | null>(() => {
    return this.productoDelForm()?.stockMinimo ?? null;
  });

  protected readonly esSalida = computed<boolean>(() => this.tipoValue() === 2);

  protected readonly advertenciaStock = computed<{ tipo: 'error' | 'warning' | null; mensaje: string | null }>(() => {
    if (!this.esSalida()) return { tipo: null, mensaje: null };

    const stock = this.stockDisponible();
    if (stock === null) return { tipo: null, mensaje: null };

    const cant = this.cantidadValue();

    if (cant <= 0) {
      return { tipo: 'warning', mensaje: 'La cantidad debe ser mayor a 0.' };
    }
    if (cant > stock) {
      return {
        tipo: 'error',
        mensaje: `Stock insuficiente. Disponible: ${stock}, solicitado: ${cant}.`
      };
    }
    if (cant === stock) {
      return { tipo: 'warning', mensaje: 'Esta salida dejara el stock en 0. Revisa que sea correcto.' };
    }
    if (stock - cant < 5) {
      return {
        tipo: 'warning',
        mensaje: `Quedara solo ${stock - cant} unidades despues de esta salida.`
      };
    }
    return { tipo: null, mensaje: null };
  });

  /**
   * Reactive Forms no emite signals por si solo. Estos helpers sincronizan
   * el form hacia signals para usarlos en computed.
   */
  protected onFormChange(): void {
    const v = this.formMovimiento.value;
    this.cantidadValue.set(Number(v.cantidad ?? 0));
    const tipo = Number(v.tipoMovimientoId);
    this.tipoValue.set(tipo === 2 ? 2 : 1);
  }

  protected readonly mensajeVacio = computed(() => {
    if (this.buscando()) return 'Buscando...';
    if (this.mostrarPapelera()) {
      if (this.totalItems() === 0) {
        return 'La papelera está vacía. Los productos que elimines aparecerán aquí.';
      }
      if (this.productos().length === 0 && this.filtro().trim()) {
        return `Ningún producto eliminado coincide con "${this.filtro()}".`;
      }
      return '';
    }
    if (this.productos().length === 0 && this.filtro().trim()) {
      return `No hay productos que coincidan con "${this.filtro()}"`;
    }
    if (this.totalItems() === 0) {
      return 'No hay productos registrados aún. Crea el primero con "Nuevo Producto".';
    }
    return '';
  });

  protected readonly historialReciente = signal<FilaHistorial[]>([]);

  constructor() {
    // Carga los valores de TODOS los atributos al iniciar.
    // Asi cuando abras el popover de filtros ya estan disponibles.
    effect(() => {
      const attrs = this.atributos();
      const cache = this.state.atributoValoresPorAtributo();
      for (const a of attrs) {
        if (!cache.has(a.id)) {
          this.state.obtenerValoresDeAtributo(a.id).catch(() => {});
        }
      }
    });

    // Recarga la lista paginada cuando el state indica que un producto
    // cambio en el server (alta, edicion, soft delete, restore). El
    // signal `productosRev` se incrementa en esos casos. Filtramos por
    // > 0 para no disparar en el mount inicial.
    // Nota: `refrescar(1)` escribe a signals (setPage) y por eso Angular
    // tira NG0600 si no usamos allowSignalWrites: true. Ademas, como
    // refrescar() es async y dispara un HTTP request, usamos `untracked`
    // para que el effect no se re-ejecute cuando se actualice cualquier
    // signal interno durante la query.
    effect(() => {
      const rev = this.state.productosRev();
      if (rev > 0) {
        untracked(() => {
          // Llamamos sin await para no bloquear el effect.
          void this.refrescar(1);
        });
      }
    }, { allowSignalWrites: true });

    // Ademas: si el usuario abre el popover y los valores no estan
    // cargados todavia, los pedimos en background.
    effect(() => {
      if (this.filtrosAbiertos()) {
        const attrs = this.atributos();
        const cache = this.state.atributoValoresPorAtributo();
        for (const a of attrs) {
          if (!cache.has(a.id)) {
            this.state.obtenerValoresDeAtributo(a.id).catch(() => {});
          }
        }
      }
    });
  }

  async ngOnInit(): Promise<void> {
    // Sincronizar el form reactivo con los signals usados en computed.
    this.formMovimiento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onFormChange());

    // Carga catalogos (marcas/categorias/atributos) si no estan ya.
    // Es idempotente: si otra pantalla los cargo antes, no hace nada.
    if (this.categorias().length === 0 || this.marcas().length === 0 || this.atributos().length === 0) {
      await this.state.cargarCatalogos();
    }

    // Carga la lista LIVIANA de productos para el dropdown de
    // "Registrar Movimiento" (id + nombre + SKU + stock). Es
    // idempotente y no devuelve imagen ni atributos, asi que
    // escala bien a miles de productos.
    this.state.cargarSelectorProductos();

    // Carga inicial: pagina 1, sin filtro.
    this.state.setPageSize(10);
    await this.refrescar(1);
    this.onFormChange();
    await this.refrescarHistorial();
  }

  protected async refrescar(page: number): Promise<void> {
    this.state.setPage(page);
    const sort = this.sortActual();
    try {
      await this.state.buscarProductos({
        q: this.filtro().trim() || undefined,
        page,
        size: this.pageSize(),
        sortBy: sort.by,
        order: sort.order,
        marcaId: this.filtroMarcaId() ?? undefined,
        categoriaId: this.filtroCategoriaId() ?? undefined,
        atributos: this.filtroAtributos().length ? this.filtroAtributos() : undefined,
        stockMax: this.filtroStockMax() ?? undefined,
      });
    } catch {
      this.notify.error(this.state.error() ?? 'No se pudieron cargar los productos.');
    }
  }

  protected onFiltroChange(value: string): void {
    this.filtro.set(value);
  }

  // ---------- Filtros: popover + acciones ----------

  protected toggleFiltrosPopover(): void {
    this.filtrosAbiertos.update((v) => !v);
  }

  protected cerrarFiltrosPopover(): void {
    this.filtrosAbiertos.set(false);
  }

  /**
   * Setea el filtro de marca desde el popover.
   *  - 'all'  = sin filtro (mostrar todos)
   *  - 'null' = solo productos SIN marca asignada
   *  - '1', '2', etc. = solo productos de esa marca
   */
  protected setFiltroMarca(value: string): void {
    this.filtroMarcaId.set(this.parseFiltroValue(value));
  }

  /** Helper: traduce el value del select a number | 'null' | undefined. */
  private parseFiltroValue(value: string): number | 'null' | undefined {
    if (value === 'all') return undefined;
    if (value === 'null') return 'null';
    const n = Number(value);
    return isNaN(n) ? undefined : n;
  }

  /** Helper para el template: parsea un string del select a number | null. */
  protected parseId(value: string): number | null {
    if (value === '') return null;
    const n = Number(value);
    return isNaN(n) ? null : n;
  }

  protected setFiltroCategoria(value: string): void {
    this.filtroCategoriaId.set(this.parseFiltroValue(value));
  }

  /**
   * Value del select de marca para mantener seleccionado el filtro activo.
   * Si no hay filtro, devuelve 'all'.
   */
  protected filtroMarcaValue(): string {
    const f = this.filtroMarcaId();
    if (f === undefined) return 'all';
    if (f === 'null') return 'null';
    return String(f);
  }

  protected filtroCategoriaValue(): string {
    const f = this.filtroCategoriaId();
    if (f === undefined) return 'all';
    if (f === 'null') return 'null';
    return String(f);
  }

  /**
   * Toggle de un filtro EAV. Si ya estaba activo, lo quita; si no,
   * lo agrega (un mismo atributo puede tener varios valores a la vez
   * — todos se piden, el backend los combina con AND entre atributos
   * y el cliente los une al query).
   */
  protected toggleFiltroAtributo(atributoId: number, valor: string): void {
    const actual = this.filtroAtributos();
    const idx = actual.findIndex((f) => f.atributoId === atributoId && f.valor === valor);
    if (idx >= 0) {
      this.filtroAtributos.set(actual.filter((_, i) => i !== idx));
    } else {
      this.filtroAtributos.set([...actual, { atributoId, valor }]);
    }
  }

  protected quitarFiltroAtributo(idx: number): void {
    this.filtroAtributos.update((arr) => arr.filter((_, i) => i !== idx));
  }

  /**
   * Setea o quita el filtro "stock bajo". Acepta null para quitar el filtro.
   * Si recibe un numero, lo normaliza a >= 0.
   */
  protected setFiltroStockMax(value: number | string | null): void {
    if (value === null || value === '') {
      this.filtroStockMax.set(null);
    } else {
      const n = typeof value === 'string' ? Number(value) : value;
      this.filtroStockMax.set(isFinite(n) && n >= 0 ? n : null);
    }
  }

  protected limpiarFiltros(): void {
    this.filtroMarcaId.set(undefined);
    this.filtroCategoriaId.set(undefined);
    this.filtroAtributos.set([]);
    this.filtroStockMax.set(null);
    this.refrescar(1);
  }

  protected nombreAtributo(id: number): string {
    return this.atributos().find((a) => a.id === id)?.nombre ?? `Atributo ${id}`;
  }

  protected nombreMarcaDeFiltro(id: number | 'null' | undefined): string {
    if (id === 'null') return 'Sin asignar';
    if (id == null) return '';
    return this.marcas().find((m) => m.id === id)?.nombre ?? '';
  }

  protected nombreCategoriaDeFiltro(id: number | 'null' | undefined): string {
    if (id === 'null') return 'Sin asignar';
    if (id == null) return '';
    return this.categorias().find((c) => c.id === id)?.nombre ?? '';
  }

  /**
   * Helper para mostrar el nombre de la categoria en la celda de la tabla.
   * Acepta `number | null` (tipo de ProductoListItem.categoriaId) y devuelve
   * "Sin categoria" si es null. Si no encuentra el id, devuelve el id.
   */
  protected nombreCategoria(id: number | null | undefined): string {
    if (id == null) return 'Sin categoría';
    return this.categorias().find((c) => c.id === id)?.nombre ?? `Categoría #${id}`;
  }

  protected valoresPara(atributoId: number): { id: number; nombre: string }[] {
    return this.state.valoresDeAtributo(atributoId);
  }

  protected isFiltroAtributoActivo(atributoId: number, valor: string): boolean {
    return this.filtroAtributos().some((f) => f.atributoId === atributoId && f.valor === valor);
  }

  // ---------- Orden por header de columna ----------

  protected ordenarPorColumna(col: 'nombre' | 'stock' | 'precio'): void {
    if (this.ordenarPor() === col) {
      // Alternar direccion
      this.ordenarDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.ordenarPor.set(col);
      this.ordenarDir.set('asc');
    }
    this.refrescar(1);
  }

  protected limpiarOrden(): void {
    this.ordenarPor.set(null);
    this.ordenarDir.set('asc');
    this.refrescar(1);
  }

  protected irAPagina(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.refrescar(p);
  }

  /**
   * Alterna la vista papelera. Cuando se activa, el backend recibe
   * incluirEliminados=true y muestra tambien los productos con
   * Eliminado=1. Si se desactiva, vuelve a solo activos.
   */
  protected async togglePapelera(): Promise<void> {
    const activar = !this.mostrarPapelera();
    this.state.togglePapelera(activar);
    this.filtro.set('');
    await this.refrescar(1);
  }

  protected readonly paginasVisibles = computed<number[]>(() => {
    const total = this.totalPages();
    const actual = this.page();
    if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1);

    // 10 botones con elipsis inteligente: 1 ... (a-2) (a-1) a (a+1) (a+2) ... total
    const set = new Set<number>([1, total, actual, actual - 2, actual - 1, actual + 1, actual + 2]);
    const arr = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out: number[] = [];
    let prev = 0;
    for (const n of arr) {
      if (n - prev > 1) out.push(-1);
      out.push(n);
      prev = n;
    }
    return out;
  });

  /**
   * Nombre para mostrar: prioriza p.nombre (campo nuevo) y cae al
   * "SKU · Marca · Categoria" para productos viejos sin nombre.
   */
  protected displayName(p: Producto | ProductoListItem): string {
    if (p.nombre && p.nombre.trim()) return p.nombre;
    return this.nombreCompleto(p);
  }

  protected nombreCompleto(p: Producto | ProductoListItem): string {
    const marca = this.marcas().find((m) => m.id === p.marcaId)?.nombre ?? '';
    const cat   = this.categorias().find((c) => c.id === p.categoriaId)?.nombre ?? '';
    const parts = [p.codigoBarra ?? 'Sin código', marca, cat].filter((s) => !!s);
    return parts.join(' · ');
  }

  protected nombreMarca(id: number | null | undefined): string {
    if (id == null) return 'Sin marca';
    return this.marcas().find((m) => m.id === id)?.nombre ?? '—';
  }

  protected async editarProducto(p: ProductoListItem): Promise<void> {
    this.state.abrirEdicionProducto(p.id);
  }

  protected confirmarEliminar(p: ProductoListItem): void {
    this.productoAEliminar.set(p);
    this.confirmandoEliminar.set(true);
  }

  protected async ejecutarEliminar(): Promise<void> {
    const p = this.productoAEliminar();
    if (!p) return;
    const nombreProd = this.displayName(p);
    this.eliminando.set(true);
    try {
      await this.state.eliminarProducto(p.id);
      this.notify.success(`Producto "${nombreProd}" eliminado.`);
      this.confirmandoEliminar.set(false);
      this.productoAEliminar.set(null);
      // No aqui: el effect de productosRev ya hace refrescar() automaticamente.
      this.refrescarHistorial();
    } catch {
      this.notify.error(this.state.error() ?? 'No se pudo eliminar el producto.');
    } finally {
      this.eliminando.set(false);
    }
  }

  /**
   * Restaura un producto desde la papelera. Solo visible cuando
   * `mostrarPapelera` es true.
   */
  protected async restaurarProducto(p: ProductoListItem): Promise<void> {
    const nombreProd = this.displayName(p);
    try {
      await this.state.restaurarProducto(p.id);
      this.notify.success(`Producto "${nombreProd}" restaurado.`);
      // Refrescamos la papelera (puede haber quedado vacia) y el selector
      // para que el dropdown incluya el producto devuelto.
      await this.refrescar(this.page());
      this.state.cargarSelectorProductos(true);
    } catch {
      this.notify.error(this.state.error() ?? 'No se pudo restaurar el producto.');
    }
  }

  protected abrirModal(): void {
    this.state.abrirModalNuevoProducto();
  }

  /**
   * Al hacer click en un boton de accion del dashboard (+/-) se
   * selecciona el producto y se prefija el tipo de movimiento.
   * 1 = INGRESO (+), 2 = SALIDA (-).
   */
  protected seleccionarProducto(p: ProductoListItem, tipo: 1 | 2 = 1): void {
    this.formMovimiento.patchValue({
      productoId: p.id,
      precioUnitario: p.precioVentaSugerido,
      tipoMovimientoId: tipo,
    });
    this.onFormChange();
    this.router.navigateByUrl('/movimiento');
  }

  protected async procesarMovimiento(): Promise<void> {
    if (this.formMovimiento.invalid) {
      this.formMovimiento.markAllAsTouched();
      this.notify.error('Por favor revise los campos del formulario.');
      return;
    }
    const v = this.formMovimiento.value;
    const cantNum = Number(v.cantidad);
    if (isNaN(cantNum) || cantNum <= 0 || !Number.isInteger(cantNum)) {
      this.notify.error('La cantidad debe ser un número entero mayor a 0.');
      return;
    }
    const precioNum = Number(v.precioUnitario);
    if (isNaN(precioNum) || precioNum < 0) {
      this.notify.error('El precio unitario no puede ser negativo.');
      return;
    }
    // Bloqueo de salida sin stock: si el form ya detecto el problema,
    // no dejamos pasar al backend.
    const adv = this.advertenciaStock();
    if (adv.tipo === 'error') {
      this.notify.error(adv.mensaje ?? 'Stock insuficiente.');
      return;
    }
    this.procesando.set(true);
    try {
      const mov = await this.state.registrarMovimiento({
        productoId: Number(v.productoId),
        tipoMovimientoId: Number(v.tipoMovimientoId) as 1 | 2,
        cantidad: cantNum,
        precioUnitario: precioNum,
        cliente: v.cliente ? v.cliente.toString().trim() : undefined,
        observacion: v.observacion ? v.observacion.toString().trim() : undefined,
      });
      this.notify.success(
        mov.tipoMovimientoId === 1
          ? `Ingreso registrado: +${mov.cantidad} unidades.`
          : `Salida registrada: -${mov.cantidad} unidades.`
      );
      // Reset completo del form para evitar doble envio
      this.formMovimiento.reset({
        productoId: null,
        tipoMovimientoId: 1,
        cantidad: 1,
        precioUnitario: 0,
        cliente: '',
        observacion: ''
      });
      this.onFormChange();
      // Refrescar stock visible y lista
      await this.refrescar(this.page());
      this.refrescarHistorial();
    } catch {
      this.notify.error(this.state.error() ?? 'No se pudo registrar el movimiento.');
    } finally {
      this.procesando.set(false);
    }
  }

  private async refrescarHistorial(): Promise<void> {
    const target = this.state.productoSeleccionado() ?? (this.productos()[0] as ProductoListItem | undefined);
    if (!target) {
      this.historialReciente.set([]);
      return;
    }
    const movs = await this.state.obtenerKardex(target.id);
    this.historialReciente.set(
      movs.slice(0, 3).map((m) => this.mapFila(m))
    );
  }

  /**
   * Click en el boton de kardex: abre el modal en el shell.
   */
  protected async toggleExpandir(p: ProductoListItem): Promise<void> {
    if (this.state.kardexProductoId() === p.id) {
      this.state.cerrarKardexModal();
    } else {
      await this.state.abrirKardexModal(p.id);
    }
  }

  protected formatearFechaCorta(fecha: string | null | undefined): string {
    if (!fecha) return '';
    return new Date(fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  }

  private mapFila(m: Movimiento): FilaHistorial {
    const esIngreso = m.tipoMovimientoId === 1;
    const tipo: 'INGRESO' | 'SALIDA' = esIngreso ? 'INGRESO' : 'SALIDA';
    const producto = this.productos().find((p) => p.id === m.productoId);
    const nombre = producto ? this.displayName(producto) : `Producto #${m.productoId}`;
    return {
      id: Number(m.id),
      fechaHora: new Date(m.fecha).toLocaleString('es-PE'),
      tipo,
      producto: nombre,
      cantidad: esIngreso ? m.cantidad : -m.cantidad,
      monto: m.cantidad * m.precioUnitario,
      // La BD guarda el FK (int) y el backend hace el join con Usuarios
      // para devolver el nombre. Mostramos el nombre; el id queda
      // disponible por si lo necesitamos en otra parte.
      usuarioId: m.creadoPorId ?? null,
      usuarioNombre: m.creadoPorNombre ?? null,
    };
  }
}
