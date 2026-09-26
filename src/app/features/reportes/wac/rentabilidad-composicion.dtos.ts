/**
 * TypeScript mirror of `GET /api/reportes/rentabilidad/{productoId}/composicion`
 * (RENT-BREAKDOWN-01 backend slice, branch `feat/rentabilidad-cost-breakdown`).
 * Field names follow the ASP.NET default JsonOptions contract (camelCase).
 *
 * `esLegacy === true` means the underlying MovimientosInventario row has
 * `FechaUtc IS NULL OR FechaUtcNormalizadaEn IS NULL` — the WAC replay
 * cannot reason about UTC ordering for that row, so the UI must
 * surface a chip + count in the warnings banner.
 *
 * `costoPromedioCalculado === null` means the period had zero INGRESOs;
 * the WAC for the window is undefined. Render as `"—"` in the modal.
 *
 * `costoTotal` in INGRESO rows is Cantidad * PrecioUnitario (decimal 18,2).
 * `costoTotal` in SALIDA rows comes from VentaDetalle.CostoTotal when the
 * VentaDetalle link exists (WAC-02b snapshot path); orphan SALIDAs
 * (VentaDetalleId IS NULL) fall back to Cantidad * CostoAplicado
 * (CostoAplicado is per-unit, so the endpoint multiplies).
 */

export interface ComposicionIngreso {
  movimientoId: number;
  fecha: string;
  fechaUtc: string | null;
  fechaUtcNormalizadaEn: string | null;
  cantidad: number;
  precioUnitario: number;
  costoTotal: number;
  observacion: string | null;
  esLegacy: boolean;
}

export interface ComposicionCostoAplicado {
  movimientoId: number;
  ventaId: number | null;
  ventaDetalleId: number | null;
  fecha: string;
  fechaUtc: string | null;
  fechaUtcNormalizadaEn: string | null;
  cantidad: number;
  precioUnitario: number;
  costoTotal: number;
  esLegacy: boolean;
}

export interface ComposicionResumen {
  totalCostoCompras: number;
  totalUnidadesIngresadas: number;
  totalCostoAplicadoVentas: number;
  totalUnidadesVendidas: number;
  costoPromedioCalculado: number | null;
  formulaAplicada: string;
}

export interface ComposicionWarnings {
  hasLegacyMovimientos: boolean;
  totalLegacyMovimientos: number;
  legacyIngresos: number;
  legacyCostosAplicados: number;
  mensaje: string | null;
}

export interface RentabilidadComposicionResponse {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  desde: string;   // ISO date (yyyy-MM-dd)
  hasta: string;   // ISO date (yyyy-MM-dd)
  ingresos: ComposicionIngreso[];
  costosAplicados: ComposicionCostoAplicado[];
  resumen: ComposicionResumen;
  warnings: ComposicionWarnings;
  generadoEn: string;  // ISO datetime
}

export interface RentabilidadComposicionFiltros {
  desde: string;
  hasta: string;
}