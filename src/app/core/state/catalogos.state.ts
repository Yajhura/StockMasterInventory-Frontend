import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiCategoriasService } from '../api/api-categorias.service';
import { ApiMarcasService } from '../api/api-marcas.service';
import { ApiAtributosService } from '../api/api-atributos.service';
import { ApiAtributoValoresService } from '../api/api-atributo-valores.service';
import { ErrorTranslator } from '../errors/error-translator';
import {
  Categoria,
  Marca,
  Atributo,
  AtributoValor,
} from '../models/inventario.models';
import { ShellState } from './shell.state';

/**
 * CatalogosState: catalog CRUD + lazy atributoValores cache.
 *
 * Owns `categorias`, `marcas`, `atributos`, and the lazy
 * `atributoValoresPorAtributo` cache keyed by atributoId. Catalog state
 * survives navigation so opening `/catalogos` from any other page does
 * not refetch unless invalidated by a CRUD call.
 *
 * `providedIn: 'root'` — MUST stay root scope so catalog state
 * survives navigation between feature pages. Do NOT change to
 * `providers: [...]` (component-scoped).
 *
 * Cross-store contract (REQ-DECOMP-004):
 *
 *   - `obtenerValoresDeAtributo(id, force?)` hydrates the cache for
 *     a given atributoId on first call. Subsequent calls return from
 *     cache unless `force=true`.
 *
 *   - `crearAtributoValor` / `actualizarAtributoValor` /
 *     `eliminarAtributoValor` mutate the cache in place, keeping
 *     the values list sorted alphabetically by nombre.
 *
 *   - Cache drift on `crearProducto` is acceptable (preserves
 *     pre-refactor behavior). A new producto can introduce
 *     atributos whose values are not in cache; the lazy load
 *     re-hydrates on next read.
 *
 * Error writes go to `ShellState.error` (REQ-DECOMP-006).
 */
@Injectable({ providedIn: 'root' })
export class CatalogosState {
  private readonly apiCategorias = inject(ApiCategoriasService);
  private readonly apiMarcas = inject(ApiMarcasService);
  private readonly apiAtributos = inject(ApiAtributosService);
  private readonly apiAtributoValores = inject(ApiAtributoValoresService);
  private readonly shell = inject(ShellState);

  // --- Catalog signals ---
  private readonly _categorias = signal<Categoria[]>([]);
  private readonly _marcas = signal<Marca[]>([]);
  private readonly _atributos = signal<Atributo[]>([]);
  /**
   * Cache de AtributoValores agrupados por atributoId.
   * Clave = atributoId, valor = lista de valores.
   * Se hidrata lazily: la primera vez que se piden valores de un
   * atributo, se hace GET /api/atributo-valores?atributoId=X.
   */
  private readonly _atributoValoresPorAtributo = signal<Map<number, AtributoValor[]>>(new Map());

  private cargandoCatalogos = false;

  readonly categorias = this._categorias.asReadonly();
  readonly marcas = this._marcas.asReadonly();
  readonly atributos = this._atributos.asReadonly();
  readonly atributoValoresPorAtributo = this._atributoValoresPorAtributo.asReadonly();

  // =====================================================
  //   Bulk load
  // =====================================================

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
      this.shell.error.set(this.toMessage(e));
    } finally {
      this.cargandoCatalogos = false;
    }
  }

  // =====================================================
  //   Categorias
  // =====================================================

  async crearCategoria(nombre: string): Promise<Categoria> {
    const n = nombre.trim();
    try {
      const nueva = await firstValueFrom(this.apiCategorias.crear({ nombre: n }));
      this._categorias.update((list) => [...list, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.shell.error.set(null);
      return nueva;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarCategoria(id: number, nombre: string): Promise<Categoria> {
    const n = nombre.trim();
    try {
      const actualizada = await firstValueFrom(this.apiCategorias.actualizar(id, { nombre: n }));
      this._categorias.update((list) => list.map((c) => (c.id === id ? actualizada : c)));
      this.shell.error.set(null);
      return actualizada;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarCategoria(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiCategorias.eliminar(id));
      this._categorias.update((list) => list.filter((c) => c.id !== id));
      this.shell.error.set(null);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  // =====================================================
  //   Marcas
  // =====================================================

  async crearMarca(nombre: string): Promise<Marca> {
    const n = nombre.trim();
    try {
      const nueva = await firstValueFrom(this.apiMarcas.crear({ nombre: n }));
      this._marcas.update((list) => [...list, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.shell.error.set(null);
      return nueva;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarMarca(id: number, nombre: string): Promise<Marca> {
    const n = nombre.trim();
    try {
      const actualizada = await firstValueFrom(this.apiMarcas.actualizar(id, { nombre: n }));
      this._marcas.update((list) => list.map((m) => (m.id === id ? actualizada : m)));
      this.shell.error.set(null);
      return actualizada;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarMarca(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiMarcas.eliminar(id));
      this._marcas.update((list) => list.filter((m) => m.id !== id));
      this.shell.error.set(null);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  // =====================================================
  //   Atributos
  // =====================================================

  async crearAtributo(nombre: string): Promise<Atributo> {
    const n = nombre.trim();
    try {
      const nuevo = await firstValueFrom(this.apiAtributos.crear({ nombre: n }));
      this._atributos.update((list) => [...list, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.shell.error.set(null);
      return nuevo;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async actualizarAtributo(id: number, nombre: string): Promise<Atributo> {
    const n = nombre.trim();
    try {
      const actualizado = await firstValueFrom(this.apiAtributos.actualizar(id, { nombre: n }));
      this._atributos.update((list) => list.map((a) => (a.id === id ? actualizado : a)));
      this.shell.error.set(null);
      return actualizado;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
  }

  async eliminarAtributo(id: number): Promise<void> {
    try {
      await firstValueFrom(this.apiAtributos.eliminar(id));
      this._atributos.update((list) => list.filter((a) => a.id !== id));
      this.shell.error.set(null);
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
      throw e;
    }
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
      this.shell.error.set(null);
      return lista;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
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
      this.shell.error.set(null);
      return nuevo;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
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
      this.shell.error.set(null);
      return actualizado;
    } catch (e: unknown) {
      this.shell.error.set(this.toMessage(e));
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
