import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiProductosService } from '../api/api-productos.service';
import { ApiMovimientosService } from '../api/api-movimientos.service';
import { ErrorTranslator } from '../errors/error-translator';
import {
  Producto,
  ProductoListItem,
  ProductoSearchParams,
  CrearProductoPayload,
  ActualizarProductoPayload,
  RegistrarMovimientoPayload,
  Movimiento,
  ProductoSelectorItem,
} from '../models/inventario.models';
import { ShellState } from './shell.state';

/**
 * ProductosState: producto CRUD + pagination + selector + movimientos.
 *
 * Owns the producto lifecycle signals plus the `productosRev` counter
 * that the dashboard observes to refresh its paginated list, and that
 * `KpisState` observes to refetch the server-side aggregate KPIs.
 *
 * `providedIn: 'root'` — MUST stay root scope so producto state
 * survives navigation between feature pages. Do NOT change to
 * `providers: [...]` (component-scoped).
 *
 * Cross-store contract (REQ-DECOMP-002 / REQ-DECOMP-003):
 *
 *   - `crearProducto` / `actualizarProducto` / `eliminarProducto` /
 *     `restaurarProducto` / `registrarMovimiento` MUST bump
 *     `productosRev` on success. The `KpisState` ctor effect listens
 *     to `productosRev` and refetches the aggregate KPIs when it
 *     changes (after the first load).
 *
 *   - `actualizarMovimiento` / `eliminarMovimiento` MUST NOT bump
 *     `productosRev`. Those mutations only refresh selector and
 *     paginated lists; the KPI aggregate over the full Productos
 *     table does not change.
 *
 * Error writes go to `ShellState.error` (REQ-DECOMP-006).
 */
@Injectable({ providedIn: 'root' })
export class ProductosState {
  private readonly apiProductos = inject(ApiProductosService);
  private readonly apiMovimientos = inject(ApiMovimientosService);
  private readonly shell = inject(ShellState);

  // --- Producto list (FULL) ---
  private readonly _productos = signal<Producto[]>([]);

  /**
   * Selector liviano para alimentar dropdowns. La carga es perezosa:
   * la primera vez que el dashboard necesita las opciones de
   * "Registrar Movimiento", llama a `cargarSelectorProductos()`.
   */
  private readonly _productosSelector = signal<ProductoSelectorItem[]>([]);
  private cargandoSelector = false;

  /** Lista paginada ligera para el dashboard (ProductoListItem). */
  private readonly _productosPaginados = signal<ProductoListItem[]>([]);

  // --- Pagination ---
  private readonly _totalItems = signal<number>(0);
  private readonly _totalPages = signal<number>(0);
  private readonly _page = signal<number>(1);
  private readonly _pageSize = signal<number>(20);
  private readonly _buscando = signal<boolean>(false);
  /** Si true, /buscar envia incluirEliminados=true (solo Admin). */
  private readonly _mostrarPapelera = signal<boolean>(false);
  /** Last applied server query, reused after a successful mutation. */
  private lastSearchParams: ProductoSearchParams = {};

  private cargandoProductos = false;

  // --- Public readonly signals ---
  readonly productos = this._productos.asReadonly();
  readonly productosSelector = this._productosSelector.asReadonly();
  readonly productosPaginados = this._productosPaginados.asReadonly();
  readonly totalItems = this._totalItems.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly page = this._page.asReadonly();
  readonly pageSize = this._pageSize.asReadonly();
  readonly buscando = this._buscando.asReadonly();
  readonly mostrarPapelera = this._mostrarPapelera.asReadonly();

  /**
   * Counter incremented every time the producto list changes on the
   * server (alta, edicion, soft delete, restore, registrarMovimiento).
   *
   * - `DashboardComponent` observes this signal with an effect and
   *   reloads the paginated list when it changes.
   * - `KpisState` observes this signal with a ctor effect and
   *   refetches the server aggregate KPIs when it changes.
   *
   * Bumps happen on SUCCESS only — failed mutations do NOT bump.
   * `actualizarMovimiento` / `eliminarMovimiento` do NOT bump.
   */
  readonly productosRev = signal<number>(0);

  // =====================================================
  //   Producto list loaders
  // =====================================================

  async cargarProductos(): Promise<void> {
    if (this.cargandoProductos) return;
    this.cargandoProductos = true;
    try {
      const data = await firstValueFrom(this.apiProductos.listar());
      this._productos.set(data);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
    } finally {
      this.cargandoProductos = false;
    }
  }

  /**
   * Carga la lista liviana de productos para alimentar el dropdown
   * de "Registrar Movimiento". Idempotente: si ya esta cargada, no
   * hace nada a menos que `force=true`.
   */
  async cargarSelectorProductos(force = false): Promise<void> {
    if (this.cargandoSelector) return;
    if (!force && this._productosSelector().length > 0) return;
    this.cargandoSelector = true;
    try {
      const data = await firstValueFrom(this.apiProductos.selector(undefined, 500));
      this._productosSelector.set(data);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
    } finally {
      this.cargandoSelector = false;
    }
  }

  // =====================================================
  //   Search + pagination (server-side)
  // =====================================================

  async buscarProductos(params: ProductoSearchParams): Promise<void> {
    this._buscando.set(true);
    try {
      this.lastSearchParams = { ...params };
      const resp = await firstValueFrom(
        this.apiProductos.buscar({ ...params, incluirEliminados: this._mostrarPapelera() })
      );
      this._productosPaginados.set(resp.items);
      this._totalItems.set(resp.totalItems);
      this._totalPages.set(resp.totalPages);
      this._page.set(resp.page);
      this._pageSize.set(resp.size);
      this.shell.error.set(null);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
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
   * pide `incluirEliminados=true` (solo funciona para Admin).
   */
  togglePapelera(activar: boolean): void {
    this._mostrarPapelera.set(activar);
    this._page.set(1);
  }

  // =====================================================
  //   Domain actions — Productos
  // =====================================================

  async crearProducto(payload: CrearProductoPayload): Promise<Producto> {
    try {
      const nuevo = await firstValueFrom(this.apiProductos.crear(payload));
      this._productos.update((list) => [...list, nuevo]);
      // Bump productosRev — KpisState refetches the aggregate KPIs.
      this.productosRev.update((n) => n + 1);
      this.shell.error.set(null);
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();
      return nuevo;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarProducto(id: number, payload: ActualizarProductoPayload): Promise<Producto> {
    try {
      const actualizado = await firstValueFrom(this.apiProductos.actualizar(id, payload));
      this._productos.update((list) => list.map((p) => (p.id === id ? actualizado : p)));
      // Bump productosRev — KpisState refetches the aggregate KPIs.
      this.productosRev.update((n) => n + 1);
      this.shell.error.set(null);
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();
      return actualizado;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarProducto(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiProductos.eliminar(id));
      const ahora = new Date().toISOString();
      // Soft delete: el backend marca Eliminado=true. Reflejamos eso en
      // la lista local para que la UI lo muestre atenuado.
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
      // Si el producto eliminado era el seleccionado, limpiamos la seleccion.
      if (this.shell.productoSeleccionado()?.id === id) {
        this.shell.seleccionarProducto(null);
      }
      // Bump productosRev — KpisState refetches the aggregate KPIs.
      this.productosRev.update((n) => n + 1);
      this.shell.error.set(null);
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  /** Recarga la lista paginada de productos con la paginacion actual. */
  private async recargarProductosPaginados(): Promise<void> {
    await this.buscarProductos({
      ...this.lastSearchParams,
      page: this._page(),
      size: this._pageSize(),
    });
  }

  /**
   * Restaura un producto de la papelera. Solo Admin. El backend valida
   * que no choque el codigo de barras con otro producto activo.
   */
  async restaurarProducto(id: number): Promise<Producto> {
    try {
      const producto = await firstValueFrom(this.apiProductos.restaurar(id));
      this._productos.update((list) =>
        list.map((p) => (p.id === id ? producto : p))
      );
      this._productosPaginados.update((list) =>
        list.map((p) => (p.id === id
          ? { ...p, eliminado: false, modificadoEn: producto.modificadoEn, modificadoPorId: producto.modificadoPorId, modificadoPorNombre: producto.modificadoPorNombre }
          : p))
      );
      // Bump productosRev — KpisState refetches the aggregate KPIs.
      this.productosRev.update((n) => n + 1);
      this.shell.error.set(null);
      return producto;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  // =====================================================
  //   Domain actions — Movimientos
  // =====================================================

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
      this._productosPaginados.update((list) =>
        list.map((p) => {
          if (p.id !== payload.productoId) return p;
          return { ...p, stockActual: p.stockActual + delta };
        })
      );
      // Bump productosRev — KpisState refetches the aggregate KPIs
      // (productosBajos and totalUnidades both depend on stock levels).
      this.productosRev.update((n) => n + 1);
      this.shell.error.set(null);
      return mov;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  /**
   * Updates an existing movimiento. Does NOT bump `productosRev` —
   * the per-producto stock row is already accurate (updated atomically
   * by the backend when the movimiento row changes), and the KPI
   * aggregate over the full Productos table does not change just
   * because an existing movimiento was edited.
   */
  async actualizarMovimiento(id: number, payload: Partial<RegistrarMovimientoPayload>): Promise<Movimiento> {
    try {
      const movActualizado = await firstValueFrom(this.apiMovimientos.actualizar(id, payload));
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();

      this.shell.error.set(null);
      return movActualizado;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  /**
   * Deletes an existing movimiento. Does NOT bump `productosRev` —
   * same rationale as `actualizarMovimiento`. The producto stock
   * state is unchanged from the user's perspective; only the
   * historical record is removed.
   */
  async eliminarMovimiento(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiMovimientos.eliminar(id));
      await this.cargarSelectorProductos(true);
      await this.recargarProductosPaginados();
      this.shell.error.set(null);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  // =========================================================
  //   Helpers
  // =========================================================

  private toMessage(e: unknown): string {
    return ErrorTranslator.translate(e);
  }
}
