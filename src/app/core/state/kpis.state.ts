import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiReportesService, KpiInventarioResult } from '../api/api-reportes.service';
import { ErrorTranslator } from '../errors/error-translator';
import { KpiInventario } from '../models/inventario.models';
import { ProductosState } from './productos.state';
import { ShellState } from './shell.state';

/**
 * KpisState: server-side aggregate KPIs for inventory.
 *
 * Owns `kpiInventario` and `kpisCargando` signals plus the in-flight
 * cache that coalesces concurrent reload requests. `cargarKpisInventario(force)`
 * hits `GET /api/reportes/kpis-inventario` and stores the server aggregate
 * (totals over the entire Productos table, not a page slice).
 *
 * `providedIn: 'root'` — MUST stay root scope so KPIs survive route
 * changes. Do NOT change to `providers: [...]` (component-scoped).
 *
 * Error writes go to `ShellState.error` (REQ-DECOMP-006: ShellState owns
 * the cross-cutting error fallback). KpisState does NOT own an error
 * signal — it borrows ShellState's.
 *
 * Cross-store effect (REQ-DECOMP-003): the constructor registers an
 * `effect(() => { ... }, { allowSignalWrites: true })` that listens to
 * `ProductosState.productosRev` and refetches the aggregate KPIs when
 * the counter changes — but ONLY after `kpisLoadedOnce` is true.
 *
 * The `allowSignalWrites: true` opt-in is required because
 * `cargarKpisInventario(true)` writes to `_kpisCargando` and
 * `_kpiInventario` inside an async pipeline; the same opt-in is used
 * by `DashboardComponent.effect(...)` at line 318 (pre-PR #1).
 *
 * The `kpisLoadedOnce` guard avoids an extra fetch at construction
 * time (the dashboard calls `cargarKpisInventario()` explicitly from
 * `ngOnInit`, which sets `kpisLoadedOnce = true`). Without the guard,
 * the first `productosRev` bump from `cargarProductos()` or similar
 * would race with the dashboard's first load.
 *
 * `actualizarMovimiento` / `eliminarMovimiento` MUST NOT bump
 * `productosRev`; they therefore MUST NOT trigger a refetch. This
 * preserves the pre-PR #2 behavior where those two methods never
 * touched KPI state at all.
 */
@Injectable({ providedIn: 'root' })
export class KpisState {
  private readonly apiReportes = inject(ApiReportesService);
  private readonly shell = inject(ShellState);
  private readonly productosState = inject(ProductosState);

  constructor() {
    // REQ-DECOMP-003 cross-store effect: any successful producto
    // mutation bumps `productosRev`, and that bump triggers a forced
    // KPI refetch here. Pre-PR #2 this was done with 5 hard-coded
    // `await this.cargarKpisInventario(true)` call sites inside
    // `crearProducto` / `actualizarProducto` / `eliminarProducto` /
    // `restaurarProducto` / `registrarMovimiento`. PR #2 collapses
    // all 5 sites into this single reactive effect.
    effect(() => {
      const rev = this.productosState.productosRev();
      // Skip the initial state (rev === 0) and pre-first-load.
      // The dashboard's ngOnInit calls cargarKpisInventario() and
      // sets kpisLoadedOnce = true; only then do bumps trigger a
      // refetch.
      if (rev === 0) return;
      if (!this.kpisLoadedOnce) return;
      void this.cargarKpisInventario(true);
    }, { allowSignalWrites: true });
  }

  // --- KPIs del servidor ---
  // Devuelve null mientras se hace el primer fetch — los consumidores
  // deben chequear `kpiInventario() === null` antes de leer.
  private readonly _kpiInventario = signal<KpiInventario | null>(null);
  private readonly _kpisCargando = signal<boolean>(false);
  /** In-flight promise cache to coalesce concurrent reload requests. */
  private kpisInflight: Promise<void> | null = null;
  /** Set true after the first successful load so we can avoid an extra fetch on every state init. */
  private kpisLoadedOnce = false;

  readonly kpiInventario = this._kpiInventario.asReadonly();
  readonly kpisCargando = this._kpisCargando.asReadonly();

  /**
   * Fetch server-side aggregate KPIs.
   *
   * @param force when true, bypasses the in-flight cache and the
   *              already-loaded guard so a reload always re-hits the
   *              network. Use after mutations (crear/actualizar/
   *              eliminar/restaurar producto + registrarMovimiento).
   *              When false, returns the existing in-flight promise if
   *              one is active, and skips the fetch if we already have
   *              data and no force.
   */
  async cargarKpisInventario(force = false): Promise<void> {
    if (!force && this.kpisLoadedOnce && this._kpiInventario() !== null) {
      return;
    }
    if (!force && this.kpisInflight) {
      return this.kpisInflight;
    }
    this._kpisCargando.set(true);
    const p = (async () => {
      try {
        const result = await firstValueFrom(this.apiReportes.kpisInventario());
        // ApiReportesService returns `KpiInventarioResult` which has the
        // same shape as the local `KpiInventario` interface; map through
        // explicitly so future drift is caught at compile time.
        const mapped: KpiInventario = {
          totalItems: result.totalItems,
          totalUnidades: result.totalUnidades,
          productosBajos: result.productosBajos,
        };
        this._kpiInventario.set(mapped);
        this.kpisLoadedOnce = true;
        this.shell.error.set(null);
      } catch (e: unknown) {
        this.shell.error.set(this.toMessage(e));
        // Don't reset kpisLoadedOnce on transient errors — keep the last
        // known-good KPI values so the dashboard doesn't flicker to null.
        throw e;
      } finally {
        this._kpisCargando.set(false);
        this.kpisInflight = null;
      }
    })();
    this.kpisInflight = p;
    return p;
  }

  private toMessage(e: unknown): string {
    return ErrorTranslator.translate(e);
  }
}