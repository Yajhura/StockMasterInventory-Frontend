/**
 * ProductosState per-store spec.
 *
 * Covers the contract for the extracted `ProductosState`:
 *   - `crearProducto` / `actualizarProducto` / `eliminarProducto` /
 *     `restaurarProducto` / `registrarMovimiento` MUST bump
 *     `productosRev` on success (REQ-DECOMP-002).
 *   - `actualizarMovimiento` / `eliminarMovimiento` MUST NOT bump
 *     `productosRev`.
 *   - The `productosRev` bump is the signal that drives `KpisState`'s
 *     ctor effect to refetch the server aggregate KPIs.
 *
 * Implementation note: tests mock the underlying ApiProductosService
 * and ApiMovimientosService to avoid chained-HTTP-testing complications
 * (where await + flush leaves the next request on a microtask that the
 * test must explicitly drain). Mocking isolates ProductosState's
 * signal-update behavior from the I/O layer.
 */
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ProductosState } from './productos.state';
import { ShellState } from './shell.state';
import { ApiProductosService } from '../api/api-productos.service';
import { ApiMovimientosService } from '../api/api-movimientos.service';
import {
  Producto,
  CrearProductoPayload,
  ActualizarProductoPayload,
  RegistrarMovimientoPayload,
  ProductoSelectorItem,
} from '../models/inventario.models';

const SAMPLE_PRODUCTO: Producto = {
  id: 99,
  nombre: 'Sample',
  codigoBarra: 'cb-99',
  categoriaId: 1,
  marcaId: 1,
  stockActual: 10,
  stockMinimo: 5,
  precioVentaSugerido: 100,
  atributos: [],
  imagenMime: null,
  imagenDataUrl: null,
  eliminado: false,
  creadoEn: '2026-01-01T00:00:00Z',
  creadoPorId: null,
  creadoPorNombre: null,
  modificadoEn: null,
  modificadoPorId: null,
  modificadoPorNombre: null,
};

const SAMPLE_MOVIMIENTO = {
  id: 1,
  productoId: 1,
  productoCodigo: 'cb-1',
  productoNombre: 'prod-1',
  tipoMovimientoId: 1,
  tipoMovimientoDescripcion: 'INGRESO',
  cantidad: 5,
  precioUnitario: 10,
  fecha: '2026-01-01T00:00:00Z',
  cliente: null,
  observacion: null,
  creadoEn: '2026-01-01T00:00:00Z',
  creadoPorId: null,
  creadoPorNombre: null,
  esStockInicial: false,
};

const EMPTY_SELECTOR: ProductoSelectorItem[] = [];
const EMPTY_PAGINATED = {
  items: [],
  page: 1,
  size: 20,
  totalItems: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
};

describe('ProductosState', () => {
  let productos: ProductosState;
  let shell: ShellState;
  let apiProductos: jasmine.SpyObj<ApiProductosService>;
  let apiMovimientos: jasmine.SpyObj<ApiMovimientosService>;

  beforeEach(() => {
    apiProductos = jasmine.createSpyObj<ApiProductosService>('ApiProductosService', [
      'listar',
      'selector',
      'buscar',
      'obtener',
      'crear',
      'actualizar',
      'eliminar',
      'restaurar',
      'papelera',
    ]);
    apiMovimientos = jasmine.createSpyObj<ApiMovimientosService>('ApiMovimientosService', [
      'kardex',
      'listar',
      'registrar',
      'actualizar',
      'eliminar',
    ]);

    // Default mock returns: empty lists for listar/selector/buscar.
    apiProductos.listar.and.returnValue(of([]));
    apiProductos.selector.and.returnValue(of(EMPTY_SELECTOR));
    apiProductos.buscar.and.returnValue(of(EMPTY_PAGINATED));
    apiProductos.obtener.and.returnValue(of(SAMPLE_PRODUCTO));
    apiProductos.papelera.and.returnValue(of(EMPTY_PAGINATED));

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiProductosService, useValue: apiProductos },
        { provide: ApiMovimientosService, useValue: apiMovimientos },
      ],
    });

    productos = TestBed.inject(ProductosState);
    shell = TestBed.inject(ShellState);
  });

  describe('initial state', () => {
    it('productosRev starts at 0', () => {
      expect(productos.productosRev()).toBe(0);
    });

    it('pagination signals start at sensible defaults', () => {
      expect(productos.productosPaginados()).toEqual([]);
      expect(productos.totalItems()).toBe(0);
      expect(productos.totalPages()).toBe(0);
      expect(productos.page()).toBe(1);
      expect(productos.pageSize()).toBe(20);
      expect(productos.buscando()).toBe(false);
      expect(productos.mostrarPapelera()).toBe(false);
    });
  });

  describe('buscarProductos', () => {
    it('forwards search params to the API and stores the response', async () => {
      apiProductos.buscar.and.returnValue(of({
        items: [{ id: 1, nombre: 'A', codigoBarra: 'cb-1', categoriaId: 1, marcaId: 1, stockActual: 10, stockMinimo: 5, precioVentaSugerido: 100, atributosCount: 0, eliminado: false, creadoEn: '', creadoPorId: null, creadoPorNombre: null, modificadoEn: null, modificadoPorId: null, modificadoPorNombre: null, imagenMime: null, imagenDataUrl: null }],
        page: 1, size: 10, totalItems: 1, totalPages: 1, hasNext: false, hasPrevious: false,
      }));

      await productos.buscarProductos({ page: 1, size: 10 });

      expect(apiProductos.buscar).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1, size: 10 }));
      expect(productos.productosPaginados().length).toBe(1);
      expect(productos.totalItems()).toBe(1);
    });
  });

  describe('productosRev bumping (REQ-DECOMP-002)', () => {
    it('crearProducto bumps productosRev after success', async () => {
      apiProductos.crear.and.returnValue(of(SAMPLE_PRODUCTO));
      const revBefore = productos.productosRev();

      await productos.crearProducto({} as CrearProductoPayload);

      expect(productos.productosRev()).toBe(revBefore + 1);
    });

    it('crearProducto does NOT bump productosRev on failure', async () => {
      apiProductos.crear.and.returnValue(throwError(() => new Error('boom')));
      const revBefore = productos.productosRev();

      await expectAsync(productos.crearProducto({} as CrearProductoPayload)).toBeRejected();

      expect(productos.productosRev()).toBe(revBefore);
    });

    it('actualizarProducto bumps productosRev after success', async () => {
      apiProductos.actualizar.and.returnValue(of(SAMPLE_PRODUCTO));
      const revBefore = productos.productosRev();

      await productos.actualizarProducto(1, {} as ActualizarProductoPayload);

      expect(productos.productosRev()).toBe(revBefore + 1);
    });

    it('eliminarProducto bumps productosRev after success', async () => {
      apiProductos.eliminar.and.returnValue(of(undefined));
      const revBefore = productos.productosRev();

      await productos.eliminarProducto(1);

      expect(productos.productosRev()).toBe(revBefore + 1);
    });

    it('restaurarProducto bumps productosRev after success', async () => {
      apiProductos.restaurar.and.returnValue(of(SAMPLE_PRODUCTO));
      const revBefore = productos.productosRev();

      await productos.restaurarProducto(1);

      expect(productos.productosRev()).toBe(revBefore + 1);
    });

    it('registrarMovimiento bumps productosRev after success', async () => {
      apiMovimientos.registrar.and.returnValue(of(SAMPLE_MOVIMIENTO));
      const revBefore = productos.productosRev();

      await productos.registrarMovimiento({} as RegistrarMovimientoPayload);

      expect(productos.productosRev()).toBe(revBefore + 1);
    });

    it('actualizarMovimiento does NOT bump productosRev', async () => {
      apiMovimientos.actualizar.and.returnValue(of(SAMPLE_MOVIMIENTO));
      const revBefore = productos.productosRev();

      await productos.actualizarMovimiento(7, { cantidad: 3 });

      expect(productos.productosRev()).toBe(revBefore);
    });

    it('eliminarMovimiento does NOT bump productosRev', async () => {
      apiMovimientos.eliminar.and.returnValue(of(undefined));
      const revBefore = productos.productosRev();

      await productos.eliminarMovimiento(7);

      expect(productos.productosRev()).toBe(revBefore);
    });
  });

  describe('error fallback to ShellState', () => {
    it('writes HTTP errors to ShellState.error', async () => {
      apiProductos.crear.and.returnValue(throwError(() => new Error('boom')));

      await expectAsync(productos.crearProducto({} as CrearProductoPayload)).toBeRejected();

      expect(shell.error()).toBeTruthy();
    });
  });
});
