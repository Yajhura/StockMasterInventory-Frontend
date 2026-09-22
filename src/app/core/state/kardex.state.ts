import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiMovimientosService, ListarMovimientosParams } from '../api/api-movimientos.service';
import { ErrorTranslator } from '../errors/error-translator';
import { Movimiento, PaginatedResponse } from '../models/inventario.models';
import { ShellState } from './shell.state';

/**
 * KardexState: shell-level Kardex modal + movimiento list/kardex fetches.
 *
 * Owns `kardexProductoId`, `kardexMovimientos`, `kardexCargando` signals
 * plus `abrirKardexModal`, `cerrarKardexModal`, `obtenerKardex`,
 * `listarMovimientos`. State survives route changes so opening the modal
 * from one page and navigating away does not clear it (REQ-DECOMP-005).
 *
 * `providedIn: 'root'` — MUST stay root scope so the modal survives
 * navigation. Do NOT change to `providers: [...]` (component-scoped).
 *
 * Error writes go to `ShellState.error` (REQ-DECOMP-006).
 */
@Injectable({ providedIn: 'root' })
export class KardexState {
  private readonly apiMovimientos = inject(ApiMovimientosService);
  private readonly shell = inject(ShellState);

  // --- Kardex modal (nivel shell) ---
  private readonly _kardexProductoId = signal<number | null>(null);
  private readonly _kardexMovimientos = signal<Movimiento[]>([]);
  private readonly _kardexCargando = signal<boolean>(false);
  private kardexRequestId = 0;

  readonly kardexProductoId = this._kardexProductoId.asReadonly();
  readonly kardexMovimientos = this._kardexMovimientos.asReadonly();
  readonly kardexCargando = this._kardexCargando.asReadonly();

  async abrirKardexModal(productoId: number): Promise<void> {
    const requestId = ++this.kardexRequestId;
    this._kardexProductoId.set(productoId);
    this._kardexCargando.set(true);
    this._kardexMovimientos.set([]);
    try {
      const movs = await this.obtenerKardex(productoId);
      if (requestId === this.kardexRequestId) {
        this._kardexMovimientos.set(movs);
      }
    } catch {
      this.shell.error.set('No se pudo cargar el Kardex.');
    } finally {
      if (requestId === this.kardexRequestId) {
        this._kardexCargando.set(false);
      }
    }
  }

  cerrarKardexModal(): void {
    this.kardexRequestId++;
    this._kardexProductoId.set(null);
    this._kardexMovimientos.set([]);
  }

  async obtenerKardex(productoId: number): Promise<Movimiento[]> {
    try {
      return await firstValueFrom(this.apiMovimientos.kardex(productoId));
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      return [];
    }
  }

  async listarMovimientos(
    params: ListarMovimientosParams = {},
  ): Promise<PaginatedResponse<Movimiento>> {
    try {
      const result = await firstValueFrom(this.apiMovimientos.listar(params));
      this.shell.error.set(null);
      return result;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      return {
        items: [],
        page: 1,
        size: 0,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      };
    }
  }

  private toMessage(e: unknown): string {
    return ErrorTranslator.translate(e);
  }
}
