import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClientesService } from '../api/api-clientes.service';
import { Cliente, ClienteFiltros, PaginatedClientes } from '../models/cliente.models';

/**
 * G-2 audit (fix #21): shared signal-based cache for the cliente
 * list, keyed by the q (search) filter so multiple POS-style
 * components don't re-fetch the same page when the user navigates
 * between /punto-venta and /cuentas-corrientes.
 *
 * Modeled after ProductosState (productos.state.ts) but trimmed to
 * the surface that POS + cobranza actually use:
 *
 *   - cargar(filtros)   -> observable-like Promise<PaginatedClientes>
 *     Reuses cache when the q+page+size+incluirEliminados tuple
 *     matches a prior request. Otherwise calls the API and caches
 *     the result. Concurrent calls for the same key dedupe to a
 *     single in-flight request (avoids races).
 *
 *   - invalidate()      -> clears the cache. Called on any cliente
 *     mutation so the next read reflects the new state.
 *
 *   - clientes()        -> readonly signal of the latest loaded
 *     page (not the cache map). Components that want the full
 *     cache should keep their own copy.
 *
 * Scope: root (providedIn: 'root') — survives navigation between
 * feature pages, mirroring ProductosState.
 */
@Injectable({ providedIn: 'root' })
export class ClientesStore {
  private readonly api = inject(ApiClientesService);

  /**
   * Cache key. Built from the request-shape params so two distinct
   * filter combinations never collide.
   */
  private static cacheKey(f: ClienteFiltros): string {
    return [
      f.q ?? '',
      f.desde ?? '',
      f.hasta ?? '',
      f.tipoDocumentoId ?? '',
      f.estadoDeuda ?? '',
      f.page ?? 1,
      f.size ?? 50,
      f.incluirEliminados ? '1' : '0',
    ].join('|');
  }

  /**
   * key -> cached PaginatedClientes response.
   * private; exposed via signals for current-page consumers.
   */
  private readonly cache = new Map<string, PaginatedClientes>();

  /**
   * key -> in-flight Promise. Dedupes concurrent requests for the
   * same key so /punto-venta and /cuentas-corrientes asking for the
   * same default page share a single round-trip.
   */
  private readonly inFlight = new Map<string, Promise<PaginatedClientes>>();

  /**
   * Last loaded page (whatever key produced it). Components that
   * only care about the current list read this; cache map stays
   * internal.
   */
  private readonly _ultimaPagina = signal<PaginatedClientes | null>(null);
  readonly ultimaPagina = this._ultimaPagina.asReadonly();

  /**
   * Convenience signal of just the items array, so templates can do
   * @for (c of clientes(); track c.id) without unwrapping the
   * envelope.
   */
  readonly clientes = computed<Cliente[]>(
    () => this._ultimaPagina()?.items ?? [],
  );

  /**
   * Carga una pagina de clientes. Si la key (q+page+size+...)
   * matchea una entrada en el cache, retorna sin fetch. Si hay un
   * request en flight para la misma key, retorna ese Promise
   * (dedup). Si no, dispara el API y cachea el resultado.
   *
   * Nota: NO usamos `shareReplay` ni operadores RxJS porque los
   * signals viven fuera del scheduler de RxJS; mantener un Map
   * explicito es mas predecible que wrappear el observable.
   */
  async cargar(filtros: ClienteFiltros): Promise<PaginatedClientes> {
    const key = ClientesStore.cacheKey(filtros);

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this._ultimaPagina.set(cached);
      return cached;
    }

    const inFlight = this.inFlight.get(key);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const promise = (async () => {
      try {
        const data = await firstValueFrom(this.api.listar(filtros));
        this.cache.set(key, data);
        this._ultimaPagina.set(data);
        return data;
      } finally {
        // Limpia el inFlight pase lo que pase (exito o throw)
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Limpia todo el cache. Llamar despues de Crear / Actualizar /
   * Eliminar / Restaurar un cliente, ya que el listado o el KPI
   * "totalClientes" pueden haber cambiado.
   */
  invalidate(): void {
    this.cache.clear();
    // No limpiamos _ultimaPagina — el caller que dispara la mutacion
    // suele refetchear inmediatamente y queremos que la UI no
    // parpadee a vacio durante el refetch.
  }

  /**
   * Invalida solo las entradas que matchean un q especifico. Util
   * si el caller sabe que solo una "vista" (ej. papelera) cambio.
   */
  invalidatePorQuery(q: string | null | undefined): void {
    const prefix = `${q ?? ''}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }
}