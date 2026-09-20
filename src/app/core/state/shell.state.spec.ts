/**
 * ShellState per-store spec.
 *
 * Smoke tests for the cross-cutting UI / error signals extracted from
 * `InventarioState`. No HTTP — ShellState owns no API surface, only
 * signal setters used by every other store.
 */
import { TestBed } from '@angular/core/testing';

import { ShellState } from './shell.state';

describe('ShellState', () => {
  let shell: ShellState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    shell = TestBed.inject(ShellState);
  });

  it('starts with sensible defaults', () => {
    expect(shell.error()).toBeNull();
    expect(shell.activeView()).toBe('inventario');
    expect(shell.modalNuevoProductoAbierto()).toBe(false);
    expect(shell.productoSeleccionado()).toBeNull();
    expect(shell.productoEditandoId()).toBeNull();
  });

  it('setActiveView toggles between inventario and reportes', () => {
    shell.setActiveView('reportes');
    expect(shell.activeView()).toBe('reportes');
    shell.setActiveView('inventario');
    expect(shell.activeView()).toBe('inventario');
  });

  it('abrir/cerrar ModalNuevoProducto toggles the modal flag', () => {
    shell.abrirModalNuevoProducto();
    expect(shell.modalNuevoProductoAbierto()).toBe(true);
    shell.cerrarModalNuevoProducto();
    expect(shell.modalNuevoProductoAbierto()).toBe(false);
  });

  it('abrirEdicionProducto sets productoEditandoId AND opens the modal', () => {
    shell.abrirEdicionProducto(123);
    expect(shell.productoEditandoId()).toBe(123);
    expect(shell.modalNuevoProductoAbierto()).toBe(true);

    shell.cerrarEdicionProducto();
    expect(shell.productoEditandoId()).toBeNull();
    expect(shell.modalNuevoProductoAbierto()).toBe(false);
  });

  it('seleccionarProducto accepts a value and null', () => {
    const stub = { id: 1, nombre: 'test' } as never;
    shell.seleccionarProducto(stub);
    expect(shell.productoSeleccionado()).toBe(stub);

    shell.seleccionarProducto(null);
    expect(shell.productoSeleccionado()).toBeNull();
  });

  it('error can be set and cleared by other stores', () => {
    shell.error.set('previous error');
    expect(shell.error()).toBe('previous error');
    shell.error.set(null);
    expect(shell.error()).toBeNull();
  });
});