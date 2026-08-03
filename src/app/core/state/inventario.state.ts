import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiCategoriasService } from '../api/api-categorias.service';
import { ApiMarcasService } from '../api/api-marcas.service';
import { ApiAtributosService } from '../api/api-atributos.service';
import { ApiAtributoValoresService } from '../api/api-atributo-valores.service';
import { ApiProductosService } from '../api/api-productos.service';
import { ApiMovimientosService } from '../api/api-movimientos.service';
import { ErrorTranslator } from '../errors/error-translator';
import {
  Categoria,
  Marca,
  Atributo,
  AtributoValor,
  Producto,
  Movimiento,
  KpiInventario,
  CrearProductoPayload,
  ActualizarProductoPayload,
  RegistrarMovimientoPayload,
  ProductoListItem,
  ProductoSearchParams,
} from '../models/inventario.models';

/**
 * InventarioState: estado global reactivo (Signals) que reemplaza
 * al antiguo InventarioService basado en mocks.
 *
 * Expone:
 *   - Catalogos: categorias, marcas, atributos.
 *   - Productos.
 *   - Producto seleccionado, modal de "Nuevo Producto".
 *   - KPIs de inventario calculados en el cliente.
 *   - Ultimo error HTTP capturado.
 *
 * Cada catalogo se carga una sola vez (cached) y se invalida manualmente
 * con `recargar()` o despues de crear/registrar.
 */
@Injectable({ providedIn: 'root' })
export class InventarioState {
  // --- Servicios API ---
  private readonly apiCategorias       = inject(ApiCategoriasService);
  private readonly apiMarcas           = inject(ApiMarcasService);
  private readonly apiAtributos        = inject(ApiAtributosService);
  private readonly apiAtributoValores  = inject(ApiAtributoValoresService);
  private readonly apiProductos        = inject(ApiProductosService);
  private readonly apiMovimientos      = inject(ApiMovimientosService);

  // --- Signals de catalogos ---
  private readonly _categorias = signal<Categoria[]>([]);
  private readonly _marcas     = signal<Marca[]>([]);
  private readonly _atributos  = signal<Atributo[]>([]);
  /**
   * Cache de AtributoValores agrupados por atributoId.
   * Clave = atributoId, valor = lista de valores.
   * Se hidrata lazily: la primera vez que se piden valores de un
   * atributo, se hace GET /api/atributo-valores?atributoId=X.
   */
  private readonly _atributoValoresPorAtributo = signal<Map<number, AtributoValor[]>>(new Map());
  private readonly _productos  = signal<Producto[]>([]);
  /**
   * Lista liviana para alimentar dropdowns. La carga es perezosa:
   * la primera vez que el dashboard necesita las opciones de
   * "Registrar Movimiento", llama a cargarSelectorProductos().
   */
  private readonly _productosSelector = signal<import('../models/inventario.models').ProductoSelectorItem[]>([]);
  private cargandoSelector = false;

  /** Lista paginada ligera para el dashboard (ProductoListItem). */
  private readonly _productosPaginados = signal<ProductoListItem[]>([]);
  private readonly _totalItems = signal<number>(0);
  private readonly _totalPages = signal<number>(0);
  private readonly _page       = signal<number>(1);
  private readonly _pageSize   = signal<number>(20);
  private readonly _buscando   = signal<boolean>(false);
  /** Si true, /buscar envia incluirEliminados=true (solo Admin). */
  private readonly _mostrarPapelera = signal<boolean>(false);

  private cargandoCatalogos = false;
  private cargandoProductos = false;

  readonly categorias = this._categorias.asReadonly();
  readonly marcas     = this._marcas.asReadonly();
  readonly atributos  = this._atributos.asReadonly();
  readonly productos  = this._productos.asReadonly();
  readonly productosSelector = this._productosSelector.asReadonly();
  readonly atributoValoresPorAtributo = this._atributoValoresPorAtributo.asReadonly();

  readonly productosPaginados = this._productosPaginados.asReadonly();
  readonly totalItems = this._totalItems.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly page       = this._page.asReadonly();
  readonly pageSize   = this._pageSize.asReadonly();
  readonly buscando   = this._buscando.asReadonly();
  readonly mostrarPapelera = this._mostrarPapelera.asReadonly();

  // --- Signals de UI ---
  readonly activeView              = signal<'inventario' | 'reportes'>('inventario');
  readonly modalNuevoProductoAbierto = signal<boolean>(false);
  readonly productoSeleccionado    = signal<Producto | null>(null);
  readonly productoEditandoId      = signal<number | null>(null);

  // --- Kardex modal (nivel shell) ---
  private readonly _kardexProductoId   = signal<number | null>(null);
  private readonly _kardexMovimientos    = signal<Movimiento[]>([]);
  private readonly _kardexCargando     = signal<boolean>(false);
  readonly kardexProductoId   = this._kardexProductoId.asReadonly();
  readonly kardexMovimientos = this._kardexMovimientos.asReadonly();
  readonly kardexCargando    = this._kardexCargando.asReadonly();

  readonly error                   = signal<string | null>(null);
  /**
   * Counter que se incrementa cada vez que la lista de productos
   * cambia en el server (alta, edicion, soft delete, restore). El
   * dashboard observa este signal con un effect y recarga la lista
   * paginada cuando cambia. Asi no hace falta emitir eventos ni
   * acoplar el modal con el dashboard.
   */
  readonly productosRev = signal<number>(0);

  // --- KPIs calculados en el cliente ---
  // Se calculan sobre la lista paginada + totalItems del server.
  // Asi no necesitamos una segunda query "full" para los KPIs.
  readonly kpiInventario = computed<KpiInventario>(() => {
    const ps = this._productosPaginados();
    return {
      // totalItems viene del server, no de la pagina actual
      totalItems: this._totalItems(),
      // Unidades: sumamos lo que esta en la pagina actual
      // (es exacto en el caso comun de paginas chicas; para
      // volumenes grandes el server deberia exponer un endpoint
      // /api/reportes/kpis que devuelva los totales reales).
      totalUnidades: ps.reduce((acc, p) => acc + p.stockActual, 0),
      productosBajos: ps.filter((p) => p.stockActual < (p.stockMinimo ?? 10)).length,
    };
  });

  // ========================
  //   Carga / inicializacion
  // ========================

  async cargarCatalogos(): Promise<void> {
    if (this.cargandoCatalogos) return;
    this.cargandoCatalogos = true;
    try {
      const [cats, mars, attrs] = await Promise.all([
        firstValueFrom(this.apiCategorias.listar()),
        firstValueFrom(this.apiMarcas.listar()),
        firstValueFrom(this.apiAtributos.listar()),
      ]);
      this._categorias.set(cats);
      this._marcas.set(mars);
      this._atributos.set(attrs);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
    } finally {
      this.cargandoCatalogos = false;
    }
  }

  async cargarProductos(): Promise<void> {
    if (this.cargandoProductos) return;
    this.cargandoProductos = true;
    try {
      const data = await firstValueFrom(this.apiProductos.listar());
      this._productos.set(data);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
    } finally {
      this.cargandoProductos = false;
    }
  }

  async cargarTodo(): Promise<void> {
    await Promise.all([this.cargarCatalogos(), this.cargarProductos()]);
  }

  /**
   * Carga la lista liviana de productos para alimentar el dropdown de
   * "Registrar Movimiento". Idempotente: si ya esta cargada, no hace nada.
   * Se deberia llamar desde el dashboard en ngOnInit o al abrir el form
   * de movimiento (carga perezosa).
   */
  async cargarSelectorProductos(force = false): Promise<void> {
    if (this.cargandoSelector) return;
    if (!force && this._productosSelector().length > 0) return;
    this.cargandoSelector = true;
    try {
      const data = await firstValueFrom(this.apiProductos.selector(undefined, 500));
      this._productosSelector.set(data);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
    } finally {
      this.cargandoSelector = false;
    }
  }

  // =====================================================
  //   Busqueda + Paginacion (server-side)
  // =====================================================

  async buscarProductos(params: ProductoSearchParams): Promise<void> {
    this._buscando.set(true);
    try {
      const resp = await firstValueFrom(
        this.apiProductos.buscar({ ...params, incluirEliminados: this._mostrarPapelera() })
      );
      this._productosPaginados.set(resp.items);
      this._totalItems.set(resp.totalItems);
      this._totalPages.set(resp.totalPages);
      this._page.set(resp.page);
      this._pageSize.set(resp.size);
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    } finally {
      this._buscando.set(false);
    }
  }

  setPage(page: number): void {
    this._page.set(page);
  }

  setPageSize(size: number): void {
    this._pageSize.set(size);
    this._page.set(1);
  }

  /**
   * Activa/desactiva la vista papelera. Cuando se activa, /buscar
   * pide incluirEliminados=true (solo funciona para Admin).
   */
  togglePapelera(activar: boolean): void {
    this._mostrarPapelera.set(activar);
    this._page.set(1);
  }

  // ========================
  //   Acciones de dominio
  // ========================

  async crearProducto(payload: CrearProductoPayload): Promise<Producto> {
    try {
      const nuevo = await firstValueFrom(this.apiProductos.crear(payload));
      this._productos.update((list) => [...list, nuevo]);
      this.productosRev.update((n) => n + 1);
      this.error.set(null);
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();
      return nuevo;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarProducto(id: number, payload: ActualizarProductoPayload): Promise<Producto> {
    try {
      const actualizado = await firstValueFrom(this.apiProductos.actualizar(id, payload));
      this._productos.update((list) => list.map((p) => (p.id === id ? actualizado : p)));
      this.productosRev.update((n) => n + 1);
      this.error.set(null);
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();
      return actualizado;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarProducto(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiProductos.eliminar(id));
      const ahora = new Date().toISOString();
      // Soft delete: el backend marca Eliminado=true. Reflejamos eso en
      // la lista local para que la UI lo muestre atenuado. Usamos
      // modificadoEn (que el backend tambien setea en DELETE) para
      // que la UI pueda mostrar "eliminado el ...".
      this._productos.update((list) =>
        list.map((p): Producto =>
          p.id === id
            ? { ...p, eliminado: true, modificadoEn: ahora, modificadoPorId: p.modificadoPorId, modificadoPorNombre: p.modificadoPorNombre }
            : p)
      );
      this._productosPaginados.update((list) =>
        list.map((p): ProductoListItem =>
          p.id === id
            ? { ...p, eliminado: true, modificadoEn: ahora }
            : p)
      );
      // Si el producto eliminado era el seleccionado, limpiamos la seleccion
      if (this.productoSeleccionado()?.id === id) {
        this.seleccionarProducto(null);
      }
      this.productosRev.update((n) => n + 1);
      this.error.set(null);
      await this.cargarSelectorProductos(true);
      // Recargar lista paginada para reflejar el cambio de pagina si es necesario
      await this.recargarProductosPaginados();
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  /** Recarga la lista paginada de productos con la paginacion actual. */
  private async recargarProductosPaginados(): Promise<void> {
    await this.buscarProductos({ page: this._page(), size: this._pageSize() });
  }

  /**
   * Restaura un producto de la papelera. Solo Admin. El backend valida
   * que no choque el codigo de barras con otro producto activo.
   */
  async restaurarProducto(id: number): Promise<Producto> {
    try {
      const producto = await firstValueFrom(this.apiProductos.restaurar(id));
      // Reflejamos el cambio en la lista local.
      this._productos.update((list) =>
        list.map((p) => (p.id === id ? producto : p))
      );
      this._productosPaginados.update((list) =>
        list.map((p) => (p.id === id
          ? { ...p, eliminado: false, modificadoEn: producto.modificadoEn, modificadoPorId: producto.modificadoPorId, modificadoPorNombre: producto.modificadoPorNombre }
          : p))
      );
      this.productosRev.update((n) => n + 1);
      this.error.set(null);
      return producto;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async registrarMovimiento(payload: RegistrarMovimientoPayload): Promise<Movimiento> {
    try {
      const mov = await firstValueFrom(this.apiMovimientos.registrar(payload));
      const delta = mov.tipoMovimientoId === 1 ? mov.cantidad : -mov.cantidad;
      // Reflejamos el cambio de stock en la lista local.
      this._productos.update((list) =>
        list.map((p) => {
          if (p.id !== payload.productoId) return p;
          return { ...p, stockActual: p.stockActual + delta };
        })
      );
      // Actualizar la lista paginada para que la tabla del dashboard muestre el stock correcto.
      this._productosPaginados.update((list) =>
        list.map((p) => {
          if (p.id !== payload.productoId) return p;
          return { ...p, stockActual: p.stockActual + delta };
        })
      );
      this.error.set(null);
      return mov;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async obtenerKardex(productoId: number): Promise<Movimiento[]> {
    try {
      return await firstValueFrom(this.apiMovimientos.kardex(productoId));
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      return [];
    }
  }

  async listarMovimientos(params: import('../api/api-movimientos.service').ListarMovimientosParams = {}): Promise<import('../models/inventario.models').PaginatedResponse<Movimiento>> {
    try {
      const result = await firstValueFrom(this.apiMovimientos.listar(params));
      this.error.set(null);
      return result;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      return { items: [], page: 1, size: 0, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false };
    }
  }

  // =====================================================
  //   Catalogos: Categorias
  // =====================================================

  async crearCategoria(nombre: string): Promise<Categoria> {
    const n = nombre.trim();
    try {
      const nueva = await firstValueFrom(this.apiCategorias.crear({ nombre: n }));
      this._categorias.update((list) => [...list, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.error.set(null);
      return nueva;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarCategoria(id: number, nombre: string): Promise<Categoria> {
    const n = nombre.trim();
    try {
      const actualizada = await firstValueFrom(this.apiCategorias.actualizar(id, { nombre: n }));
      this._categorias.update((list) => list.map((c) => (c.id === id ? actualizada : c)));
      this.error.set(null);
      return actualizada;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarCategoria(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiCategorias.eliminar(id));
      this._categorias.update((list) => list.filter((c) => c.id !== id));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  // =====================================================
  //   Catalogos: Marcas
  // =====================================================

  async crearMarca(nombre: string): Promise<Marca> {
    const n = nombre.trim();
    try {
      const nueva = await firstValueFrom(this.apiMarcas.crear({ nombre: n }));
      this._marcas.update((list) => [...list, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.error.set(null);
      return nueva;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarMarca(id: number, nombre: string): Promise<Marca> {
    const n = nombre.trim();
    try {
      const actualizada = await firstValueFrom(this.apiMarcas.actualizar(id, { nombre: n }));
      this._marcas.update((list) => list.map((m) => (m.id === id ? actualizada : m)));
      this.error.set(null);
      return actualizada;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarMarca(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiMarcas.eliminar(id));
      this._marcas.update((list) => list.filter((m) => m.id !== id));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  // =====================================================
  //   Catalogos: Atributos
  // =====================================================

  async crearAtributo(nombre: string): Promise<Atributo> {
    const n = nombre.trim();
    try {
      const nuevo = await firstValueFrom(this.apiAtributos.crear({ nombre: n }));
      this._atributos.update((list) => [...list, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.error.set(null);
      return nuevo;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarAtributo(id: number, nombre: string): Promise<Atributo> {
    const n = nombre.trim();
    try {
      const actualizado = await firstValueFrom(this.apiAtributos.actualizar(id, { nombre: n }));
      this._atributos.update((list) => list.map((a) => (a.id === id ? actualizado : a)));
      this.error.set(null);
      return actualizado;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarAtributo(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiAtributos.eliminar(id));
      this._atributos.update((list) => list.filter((a) => a.id !== id));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  // ========================
  //   Acciones de UI
  // ========================

  setActiveView(v: 'inventario' | 'reportes'): void {
    this.activeView.set(v);
  }

  abrirModalNuevoProducto(): void  { this.modalNuevoProductoAbierto.set(true); }
  cerrarModalNuevoProducto(): void {
    this.modalNuevoProductoAbierto.set(false);
  }

  abrirEdicionProducto(id: number): void {
    this.productoEditandoId.set(id);
    this.modalNuevoProductoAbierto.set(true);
  }

  cerrarEdicionProducto(): void {
    this.productoEditandoId.set(null);
    this.modalNuevoProductoAbierto.set(false);
  }

  async abrirKardexModal(productoId: number): Promise<void> {
    this._kardexProductoId.set(productoId);
    this._kardexCargando.set(true);
    this._kardexMovimientos.set([]);
    try {
      const movs = await this.obtenerKardex(productoId);
      this._kardexMovimientos.set(movs);
    } catch {
      this.error.set('No se pudo cargar el Kardex.');
    } finally {
      this._kardexCargando.set(false);
    }
  }

  cerrarKardexModal(): void {
    this._kardexProductoId.set(null);
    this._kardexMovimientos.set([]);
  }

  seleccionarProducto(p: Producto | null): void {
    this.productoSeleccionado.set(p);
  }

  // =====================================================
  //   AtributoValores: cache + CRUD
  // =====================================================

  /**
   * Devuelve los valores en cache para un atributo. Si no estan
   * cargados, los pide al backend y los guarda. Devuelve [] si el
   * atributo no tiene valores (no es un error).
   */
  async obtenerValoresDeAtributo(atributoId: number, forceReload = false): Promise<AtributoValor[]> {
    const cache = this._atributoValoresPorAtributo();
    if (!forceReload && cache.has(atributoId)) {
      return cache.get(atributoId) ?? [];
    }
    try {
      const lista = await firstValueFrom(this.apiAtributoValores.listar(atributoId));
      this._atributoValoresPorAtributo.update((m) => {
        const copia = new Map(m);
        copia.set(atributoId, lista);
        return copia;
      });
      this.error.set(null);
      return lista;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      return [];
    }
  }

  /** Acceso sincronico al cache (sin ir al backend). */
  valoresDeAtributo(atributoId: number): AtributoValor[] {
    return this._atributoValoresPorAtributo().get(atributoId) ?? [];
  }

  async crearAtributoValor(atributoId: number, nombre: string): Promise<AtributoValor> {
    try {
      const nuevo = await firstValueFrom(this.apiAtributoValores.crear({ atributoId, nombre }));
      this._atributoValoresPorAtributo.update((m) => {
        const copia = new Map(m);
        const actual = copia.get(atributoId) ?? [];
        copia.set(atributoId, [...actual, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        return copia;
      });
      this.error.set(null);
      return nuevo;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarAtributoValor(id: number, atributoId: number, nombre: string): Promise<AtributoValor> {
    try {
      const actualizado = await firstValueFrom(this.apiAtributoValores.actualizar(id, { nombre }));
      this._atributoValoresPorAtributo.update((m) => {
        const copia = new Map(m);
        const actual = copia.get(atributoId) ?? [];
        copia.set(
          atributoId,
          actual.map((v) => (v.id === id ? actualizado : v))
                 .sort((a, b) => a.nombre.localeCompare(b.nombre))
        );
        return copia;
      });
      this.error.set(null);
      return actualizado;
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarAtributoValor(id: number, atributoId: number): Promise<void> {
    try {
      await firstValueFrom(this.apiAtributoValores.eliminar(id));
      this._atributoValoresPorAtributo.update((m) => {
        const copia = new Map(m);
        const actual = copia.get(atributoId) ?? [];
        copia.set(atributoId, actual.filter((v) => v.id !== id));
        return copia;
      });
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.toMessage(e));
      throw e;
    }
  }

  // ========================
  //   Helpers
  // ========================

  private toMessage(e: unknown): string {
    return ErrorTranslator.translate(e);
  }
}
