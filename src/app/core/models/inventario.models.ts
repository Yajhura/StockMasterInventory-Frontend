/**
 * Modelos del frontend espejados 1:1 con la API de StockMaster (.NET 10).
 * Convencion: nombres en camelCase porque llegan como JSON.
 *
 * IMPORTANTE:
 * - El backend no devuelve un campo `nombreCompleto` en Producto.
 *   El nombre para mostrar se compone en el frontend con
 *   `nombreCompleto(producto)` (codigoBarra + marca + atributos).
 * - Los atributos NO incluyen el nombre del atributo, solo el par
 *   { atributoId, valor }. El nombre se resuelve con el catalogo
 *   de Atributos que se carga aparte.
 */

// ---------- Catalogos ----------

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Marca {
  id: number;
  nombre: string;
}

export interface Atributo {
  id: number;
  nombre: string;
}

export interface AtributoValor {
  id: number;
  atributoId: number;
  nombre: string;
}

// ---------- Producto (modelo EAV) ----------

/** Par Atributo/Valor que viaja en el payload de Crear/Actualizar Producto. */
export interface ProductoAtributoValor {
  atributoId: number;
  valor: string;
}

export interface Producto {
  id: number;
  nombre: string;
  codigoBarra: string | null;
  categoriaId: number;
  marcaId: number;
  stockActual: number;
  stockMinimo: number;
  precioVentaSugerido: number;
  atributos: ProductoAtributoValor[];
  // --- Imagen ---
  imagenMime: string | null;
  /** data:image/...;base64,XXX ya formado. Null si no hay imagen. */
  imagenDataUrl: string | null;
  // --- Auditoría + soft delete ---
  // ModificadoEn/Por se actualiza tambien en DELETE (soft): la última
  // "modificación" del producto fue eliminarlo, así que ya tenemos
  // quien/cuando sin columnas extra.
  eliminado: boolean;
  creadoEn: string;
  /** Id del usuario (FK) que dio de alta. Null si se borro el usuario. */
  creadoPorId: number | null;
  /** Nombre del usuario (join server-side). Null si creadoPorId es null. */
  creadoPorNombre: string | null;
  modificadoEn: string | null;
  /** Id del usuario (FK) que hizo la ultima modificacion. */
  modificadoPorId: number | null;
  /** Nombre del usuario (join). */
  modificadoPorNombre: string | null;
  stockInicial?: number;
  stockInicialPrecioUnitario?: number;
  stockInicialObservacion?: string;
}

export interface CrearProductoPayload {
  nombre: string;
  codigoBarra?: string | null;
  categoriaId: number | null;
  marcaId: number | null;
  precioVentaSugerido: number;
  /** Umbral de stock bajo. Default 10. */
  stockMinimo?: number;
  atributos: ProductoAtributoValor[];
  /** base64 puro o data URL. El backend detecta/comprime. */
  imagenBase64?: string | null;
  /** MIME explicito. Opcional si imagenBase64 ya incluye data URL. */
  imagenMime?: string | null;
  /**
   * Stock inicial al dar de alta. Si es > 0, el backend crea un
   * INGRESO atomico en la misma transaccion.
   */
  stockInicial?: number;
  /** Precio unitario del ingreso inicial. */
  stockInicialPrecioUnitario?: number;
  /** Observacion del movimiento inicial (proveedor, factura, etc.). */
  stockInicialObservacion?: string | null;
}

export interface ActualizarProductoPayload extends CrearProductoPayload {
  /** true: borrar la imagen actual. false/null: conservar (si no llega base64). */
  quitarImagen?: boolean;
}

// ---------- Movimientos ----------

export interface Movimiento {
  id: number;
  productoId: number;
  productoCodigo: string | null;
  productoNombre: string | null;
  tipoMovimientoId: number;        // 1 = INGRESO, 2 = SALIDA
  tipoMovimientoDescripcion: string;
  cantidad: number;
  precioUnitario: number;
  fecha: string;                   // ISO string
  cliente: string | null;
  observacion: string | null;
  creadoEn: string;
  creadoPorId: number | null;
  /** Nombre del usuario (join server-side). */
  creadoPorNombre: string | null;
  modificadoEn?: string | null;
  modificadoPorId?: number | null;
  modificadoPorNombre?: string | null;
  esStockInicial: boolean;
}

export interface RegistrarMovimientoPayload {
  productoId: number;
  tipoMovimientoId: 1 | 2;
  cantidad: number;
  precioUnitario: number;
  /**
   * Deprecated. El endpoint /api/movimientos ya no acepta cliente string.
   * Las ventas con cliente van por /api/ventas. Se conserva la propiedad
   * para evitar enviar este campo al backend (se envia siempre como null).
   */
  cliente?: string | null;
  observacion?: string;
}

// ---------- Auth ----------

export type Rol = 'Admin' | 'Operador';

export interface Usuario {
  id: number;
  email: string;
  nombreCompleto: string;
  rol: Rol;
}

export interface LoginPayload {
  email: string;
  password: string;
}

// ---------- Paginacion (server-side) ----------

export interface ProductoListItem {
  id: number;
  nombre: string;
  codigoBarra: string | null;
  categoriaId: number;
  marcaId: number;
  stockActual: number;
  stockMinimo: number;
  precioVentaSugerido: number;
  atributosCount: number;
  // --- Auditoría + soft delete (subset liviano) ---
  eliminado: boolean;
  creadoEn: string;
  creadoPorId: number | null;
  creadoPorNombre: string | null;
  modificadoEn: string | null;
  modificadoPorId: number | null;
  modificadoPorNombre: string | null;
  // --- Imagen (thumb) ---
  imagenMime: string | null;
  imagenDataUrl: string | null;
}

/**
 * Version ultra-liviana del producto para alimentar dropdowns.
 * No incluye imagen, atributos, ni auditoria. Pensado para escalar a
 * miles de productos sin saturar el payload.
 */
export interface ProductoSelectorItem {
  id: number;
  nombre: string;
  codigoBarra: string | null;
  stockActual: number;
  stockMinimo: number;
  precioVentaSugerido: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface AtributoFiltro {
  atributoId: number;
  valor: string;
}

export interface ProductoSearchParams {
  q?: string;
  /**
   * Filtro por marca:
   *   - undefined o ausente: no filtra.
   *   - number: filtra por esa marca exacta.
   *   - 'null' (string): filtra solo productos sin marca asignada.
   */
  marcaId?: number | 'null';
  categoriaId?: number | 'null';
  /** AND entre pares; el producto debe tener TODOS los atributos con esos valores. */
  atributos?: AtributoFiltro[];
  page?: number;
  size?: number;
  sortBy?: 'id' | 'nombre' | 'codigoBarra' | 'stock' | 'precio' | 'creadoEn';
  order?: 'asc' | 'desc';
  /** true = papelera (solo Admin). false/ausente = solo activos. */
  incluirEliminados?: boolean;
  /**
   * Filtro "stock bajo": solo productos con StockActual <= stockMax.
   * Tipico uso: el dueno marca 10 para ver "que reponer".
   */
  stockMax?: number;
}

// ---------- KPIs (se calculan en el frontend) ----------

export interface KpiInventario {
  totalItems: number;
  totalUnidades: number;
  productosBajos: number;          // productos with StockActual <= StockMinimo (inclusive, server-side)
}

export interface KpiFinanciero {
  inversionCompras: number;
  totalVentas: number;
  gananciaNeta: number;
  margenPorcentaje: number;
}
