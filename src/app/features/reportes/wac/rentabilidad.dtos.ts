/**
 * TypeScript mirror of `GET /api/reportes/rentabilidad` (WAC-03 backend
 * slice, branch `fix/reporting-financial-integrity`). Field names follow
 * the ASP.NET default JsonOptions contract (camelCase).
 *
 * `margenPorcentaje === null` means revenue was 0 in the period; render
 * as `"—"`. `completitud` is the disclosure field required by the runbook.
 *
 * The frontend never recomputes COGS or margins — see
 * `odd/tasks/weighted-average-cost-reporting.md`.
 */

export type CompletitudRentabilidad = 'Completa' | 'ConQuarentena' | 'ConCostoFaltante';

export interface RentabilidadLinea {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  categoriaId: number | null;
  categoriaNombre: string | null;
  marcaId: number | null;
  marcaNombre: string | null;
  unidadesVendidas: number;
  ventaCount: number;
  revenue: number;
  cogs: number | null;
  gananciaNeta: number | null;
  margenPorcentaje: number | null;
  completitud: CompletitudRentabilidad;
}

export interface RentabilidadTotales {
  revenue: number;
  cogs: number | null;
  gananciaNeta: number | null;
  margenPorcentaje: number | null;
  ventaCount: number;
  productosConCostoFaltante: number;
  productosCuarentenados: number;
}

export interface RentabilidadResponse {
  desde: string;       // ISO date (yyyy-MM-dd)
  hasta: string;       // ISO date (yyyy-MM-dd)
  totales: RentabilidadTotales;
  lineas: RentabilidadLinea[];
  generadoEn: string;  // ISO datetime
}

export interface RentabilidadFiltros {
  desde: string;
  hasta: string;
  categoriaId?: number | null;
  marcaId?: number | null;
}
