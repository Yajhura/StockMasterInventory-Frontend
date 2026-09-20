import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiReportesService, KpiInventarioResult } from '../api/api-reportes.service';
import { ErrorTranslator } from '../errors/error-translator';
import { KpiInventario } from '../models/inventario.models';
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
 * In PR #2, the KpisState constructor will register an `effect` on
 * `ProductosState.productosRev` (with `allowSignalWrites: true`) so the
 * 5 hard-coded `cargarKpisInventario(true)` call sites collapse to one
 * reactive refetch. For PR #1, the effect is NOT present — PR #1 only
 * extracts the state and method.
 */
@Injectable({ providedIn: 'root' })
export class KpisState {
  private readonly apiReportes = inject(ApiReportesService);
  private readonly shell = inject(ShellState);

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