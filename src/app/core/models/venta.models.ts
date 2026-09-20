export interface Venta {
  id: number;
  clienteId: number;
  clienteNombre: string;
  fecha: string;
  montoTotal: number;
  saldoPendiente: number;
  estadoPago: string; // "Pendiente", "Parcial", "Pagado"
  esCredito: boolean;
  cantidadCuotas: number | null;
  frecuencia: string | null;
  fechaInicioCredito: string | null;
}

export interface VentaDetalle {
  id: number;
  productoId: number;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Abono {
  id: number;
  monto: number;
  fecha: string;
  metodoPagoId: number;
  metodoPagoNombre: string | null;
  observacion: string | null;
}

export interface Cuota {
  id: number;
  numero: number;
  monto: number;
  fechaVencimiento: string;
  fechaPago: string | null;
  estado: string; // "Pendiente", "Pagada", "Vencida"
  abonoId: number | null;
}

export interface VentaDetallada extends Venta {
  detalles: VentaDetalle[];
  abonos: Abono[];
  cuotas: Cuota[];
}

export interface CrearVentaDetalle {
  productoId: number;
  cantidad: number;
  precioUnitario: number;
}

export interface PagoInicial {
  monto: number;
  metodoPagoId: number;
}

export interface CrearVentaPayload {
  clienteId: number;
  detalles: CrearVentaDetalle[];
  pagos: PagoInicial[];
  observacion: string | null;
  cantidadCuotas: number | null;
  frecuencia: string | null;
  fechaInicioCredito: string | null;
}

export interface CrearAbonoPayload {
  monto: number;
  metodoPagoId: number;
  observacion: string | null;
}

export type EstadoPago = 'Pagado' | 'Parcial' | 'Pendiente';

export interface MetodoPago {
  id: number;
  nombre: string;
}

/**
 * Preview de una cuota individual en el plan de credito.
 * Shape retornada por `GET /api/ventas/preview-plan` (calculada server-side
 * por `PlanCreditoCalculator` en el backend). El frontend usa esta shape
 * para el preview en tiempo real del POS — coincide byte-a-byte con lo
 * que persiste el endpoint de registro.
 */
export interface CuotaPreview {
  numero: number;
  monto: number;
  fechaVencimiento: string;   // 'YYYY-MM-DD'
}

export interface VentaFiltros {
  desde: string | null;        // 'YYYY-MM-DD'
  hasta: string | null;
  clienteId: number | null;
  estadoPago: EstadoPago | null;
}

export interface KpiVentas {
  totalVendido: number;
  cantidadVentas: number;
  ticketPromedio: number;
  ventasCreditoCount: number;
  ventasCreditoPorcentaje: number;
}

export interface KpiCobranza {
  deudaTotal: number;
  clientesConDeuda: number;
  deudaVencida: number;
  cuotasVencenProximas: number;
}
