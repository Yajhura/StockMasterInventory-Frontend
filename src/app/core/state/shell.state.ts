import { Injectable, signal } from '@angular/core';
import { Producto } from '../models/inventario.models';

/**
 * ShellState: cross-cutting UI / error state for the inventory shell.
 *
 * Owns:
 *   - `error` — last HTTP error message; fallback notification slot
 *     used by all stores when they catch an error (REQ-DECOMP-006).
 *   - `activeView` — current top-level view (`'inventario' | 'reportes'`).
 *   - `modalNuevoProductoAbierto` — whether the "Nuevo Producto" modal
 *     is open. Survives navigation.
 *   - `productoSeleccionado` — currently selected producto in the
 *     dashboard list. Cleared on `eliminarProducto` if the deleted
 *     one was selected.
 *   - `productoEditandoId` — id of the producto being edited, or null.
 *
 * `providedIn: 'root'` — MUST stay root scope so shell UI state
 * survives navigation between feature pages. Do NOT change to
 * `providers: [...]` (component-scoped).
 *
 * This store owns no data fetching and no business logic — it is a
 * thin, thread-safe signaling layer used by every other store in
 * `core/state/`.
 */
@Injectable({ providedIn: 'root' })
export class ShellState {
  readonly error = signal<string | null>(null);
  readonly activeView = signal<'inventario' | 'reportes'>('inventario');
  readonly modalNuevoProductoAbierto = signal<boolean>(false);
  readonly productoSeleccionado = signal<Producto | null>(null);
  readonly productoEditandoId = signal<number | null>(null);

  setActiveView(v: 'inventario' | 'reportes'): void {
    this.activeView.set(v);
  }

  abrirModalNuevoProducto(): void {
    this.modalNuevoProductoAbierto.set(true);
  }

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

  seleccionarProducto(p: Producto | null): void {
    this.productoSeleccionado.set(p);
  }
}