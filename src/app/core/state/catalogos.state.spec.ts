/**
 * CatalogosState per-store spec.
 *
 * Covers the contract for the extracted `CatalogosState`:
 *   - `cargarCatalogos()` fans out to `/api/categorias`, `/api/marcas`,
 *     `/api/atributos` and stores the responses.
 *   - `obtenerValoresDeAtributo(id)` lazily hydrates the
 *     `atributoValoresPorAtributo` cache for a given atributoId.
 *   - `crearAtributoValor` mutates the cache in place and keeps the
 *     values list sorted alphabetically by nombre.
 *   - `valoresDeAtributo(id)` returns the synchronous cache view.
 *
 * Implementation note: tests mock the underlying ApiCategoriasService,
 * ApiMarcasService, ApiAtributosService, and ApiAtributoValoresService
 * to avoid chained-HTTP-testing complications.
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CatalogosState } from './catalogos.state';
import { ShellState } from './shell.state';
import { ApiCategoriasService } from '../api/api-categorias.service';
import { ApiMarcasService } from '../api/api-marcas.service';
import { ApiAtributosService } from '../api/api-atributos.service';
import { ApiAtributoValoresService } from '../api/api-atributo-valores.service';
import { AtributoValor } from '../models/inventario.models';

function makeValor(id: number, nombre: string): AtributoValor {
  return { id, atributoId: 7, nombre };
}

describe('CatalogosState', () => {
  let catalogos: CatalogosState;
  let shell: ShellState;
  let apiCategorias: jasmine.SpyObj<ApiCategoriasService>;
  let apiMarcas: jasmine.SpyObj<ApiMarcasService>;
  let apiAtributos: jasmine.SpyObj<ApiAtributosService>;
  let apiAtributoValores: jasmine.SpyObj<ApiAtributoValoresService>;

  beforeEach(() => {
    apiCategorias = jasmine.createSpyObj<ApiCategoriasService>('ApiCategoriasService', [
      'listar', 'obtener', 'crear', 'actualizar', 'eliminar',
    ]);
    apiMarcas = jasmine.createSpyObj<ApiMarcasService>('ApiMarcasService', [
      'listar', 'crear', 'actualizar', 'eliminar',
    ]);
    apiAtributos = jasmine.createSpyObj<ApiAtributosService>('ApiAtributosService', [
      'listar', 'crear', 'actualizar', 'eliminar',
    ]);
    apiAtributoValores = jasmine.createSpyObj<ApiAtributoValoresService>('ApiAtributoValoresService', [
      'listar', 'crear', 'actualizar', 'eliminar',
    ]);

    apiCategorias.listar.and.returnValue(of([]));
    apiMarcas.listar.and.returnValue(of([]));
    apiAtributos.listar.and.returnValue(of([]));
    apiAtributoValores.listar.and.returnValue(of([]));

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiCategoriasService, useValue: apiCategorias },
        { provide: ApiMarcasService, useValue: apiMarcas },
        { provide: ApiAtributosService, useValue: apiAtributos },
        { provide: ApiAtributoValoresService, useValue: apiAtributoValores },
      ],
    });

    catalogos = TestBed.inject(CatalogosState);
    shell = TestBed.inject(ShellState);
  });

  describe('initial state', () => {
    it('catalog arrays start empty', () => {
      expect(catalogos.categorias()).toEqual([]);
      expect(catalogos.marcas()).toEqual([]);
      expect(catalogos.atributos()).toEqual([]);
    });

    it('atributoValoresPorAtributo cache starts empty', () => {
      expect(catalogos.atributoValoresPorAtributo().size).toBe(0);
      expect(catalogos.valoresDeAtributo(99)).toEqual([]);
    });
  });

  describe('cargarCatalogos', () => {
    it('fans out to the three catalog APIs and stores the responses', async () => {
      apiCategorias.listar.and.returnValue(of([{ id: 1, nombre: 'Cargador' }]));
      apiMarcas.listar.and.returnValue(of([{ id: 1, nombre: 'Baseus' }]));
      apiAtributos.listar.and.returnValue(of([{ id: 1, nombre: 'Potencia' }]));

      await catalogos.cargarCatalogos();

      expect(apiCategorias.listar).toHaveBeenCalled();
      expect(apiMarcas.listar).toHaveBeenCalled();
      expect(apiAtributos.listar).toHaveBeenCalled();
      expect(catalogos.categorias().length).toBe(1);
      expect(catalogos.marcas().length).toBe(1);
      expect(catalogos.atributos().length).toBe(1);
    });
  });

  describe('atributoValores cache', () => {
    it('obtenerValoresDeAtributo hydrates the cache on first call', async () => {
      apiAtributoValores.listar.and.returnValue(of([makeValor(1, 'Azul'), makeValor(2, 'Rojo')]));

      await catalogos.obtenerValoresDeAtributo(7);

      expect(catalogos.atributoValoresPorAtributo().size).toBe(1);
      expect(catalogos.valoresDeAtributo(7).length).toBe(2);
      expect(catalogos.valoresDeAtributo(7).map((v) => v.nombre)).toEqual(['Azul', 'Rojo']);
    });

    it('obtenerValoresDeAtributo returns from cache on second call (no API call)', async () => {
      apiAtributoValores.listar.and.returnValue(of([makeValor(1, 'Azul')]));

      await catalogos.obtenerValoresDeAtributo(7);
      apiAtributoValores.listar.calls.reset();
      const second = await catalogos.obtenerValoresDeAtributo(7);

      expect(second.length).toBe(1);
      expect(apiAtributoValores.listar).not.toHaveBeenCalled();
    });

    it('obtenerValoresDeAtributo with force=true re-fetches even when cached', async () => {
      apiAtributoValores.listar.and.returnValues(
        of([makeValor(1, 'Azul')]),
        of([makeValor(1, 'Azul'), makeValor(2, 'Rojo'), makeValor(3, 'Verde')]),
      );

      await catalogos.obtenerValoresDeAtributo(7);
      await catalogos.obtenerValoresDeAtributo(7, true);

      expect(apiAtributoValores.listar).toHaveBeenCalledTimes(2);
      expect(catalogos.valoresDeAtributo(7).length).toBe(3);
    });

    it('crearAtributoValor mutates the cache and keeps it sorted', async () => {
      apiAtributoValores.listar.and.returnValue(of([makeValor(1, 'Azul'), makeValor(2, 'Verde')]));
      apiAtributoValores.crear.and.returnValue(of(makeValor(99, 'Rojo')));

      await catalogos.obtenerValoresDeAtributo(7);
      await catalogos.crearAtributoValor(7, 'Rojo');

      expect(catalogos.valoresDeAtributo(7).map((v) => v.nombre))
        .toEqual(['Azul', 'Rojo', 'Verde']);
    });

    it('eliminarAtributoValor removes from cache', async () => {
      apiAtributoValores.listar.and.returnValue(of([makeValor(1, 'Azul'), makeValor(2, 'Rojo')]));
      apiAtributoValores.eliminar.and.returnValue(of(undefined));

      await catalogos.obtenerValoresDeAtributo(7);
      await catalogos.eliminarAtributoValor(1, 7);

      expect(catalogos.valoresDeAtributo(7).map((v) => v.nombre)).toEqual(['Rojo']);
    });
  });

  describe('error fallback to ShellState', () => {
    it('writes API errors to ShellState.error', async () => {
      const { throwError } = await import('rxjs');
      apiCategorias.listar.and.returnValue(throwError(() => new Error('boom')));

      await catalogos.cargarCatalogos();

      expect(shell.error()).toBeTruthy();
    });
  });
});
