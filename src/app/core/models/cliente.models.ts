import { Venta } from './venta.models';

export interface TipoDocumento {
  id: number;
  nombre: string;
}

export interface Cliente {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  tipoDocumentoId: number;
  tipoDocumentoNombre: string;
  creadoEn: string;
  tieneDeuda: boolean;
  // --- Auditoria (M-1 / A-2 audit): opcionales para no romper el
  //     contrato con clientes viejos o responses pre-auditoria.
  creadoPorId?: number | null;
  creadoPorNombre?: string | null;
  modificadoEn?: string | null;
  modificadoPorId?: number | null;
  modificadoPorNombre?: string | null;
  eliminadoEn?: string | null;
  eliminadoPorId?: number | null;
  eliminadoPorNombre?: string | null;
  // L-2 audit (fix #22): contadores de actividad comercial. Solo se
  // populan en el response de un cliente individual (GET /api/clientes/{id});
  // el listado paginado los omite (null) para no caer en N+1. El FE los
  // consume opcionalmente — si no estan, simplemente no renderiza el chip.
  cantidadVentas?: number | null;
  cantidadAbonos?: number | null;
}

export interface CrearClientePayload {
  nombre: string;
  documento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  tipoDocumentoId?: number;
}

export interface ClienteFiltros {
  desde?: string | null;
  hasta?: string | null;
  tipoDocumentoId?: number | null;
  estadoDeuda?: 'con-deuda' | 'sin-deuda' | null;
  // G-1 / C-1 audit (fix #8+#9): busqueda server-side libre por
  // nombre / documento / telefono / email. Antes era un filter() en
  // memoria sobre los resultados ya paginados.
  q?: string | null;
  // C-4 / K-4 audit: paginacion server-side. size acepta el clamp
  // del backend (1..200), page es 1-based. Defaults los define el
  // service para no obligar al componente a setearlos siempre.
  page?: number;
  size?: number;
  // F-1 / A-6 audit: cuando true, el backend bypasea el HasQueryFilter
  // y devuelve clientes activos + soft-deleted. La UI lo usa para
  // implementar el toggle "papelera".
  incluirEliminados?: boolean;
}

export interface EstadoCuentaCliente {
  cliente: Cliente;
  totalFacturado: number;
  totalPagado: number;
  deudaActual: number;
  // E-2 audit (fix #7): cantidadVentasTotal = count sin paginar;
  // cantidadVentasMostradas = count de la pagina actual. Asi el FE puede
  // mostrar "Mostrando N de M" y habilitar un boton "Ver mas".
  cantidadVentasTotal: number;
  cantidadVentasMostradas: number;
  cantidadAbonos: number;
  ventas: Venta[];
}

export interface KpiClientes {
  totalClientes: number;
  clientesConDeuda: number;
  clientesSinDeuda: number;
  nuevosEsteMes: number;
}

/**
 * Envelope estandar para endpoints paginados del backend (mismo shape
 * que /api/productos/buscar y /api/movimientos). Re-declarado aca para
 * evitar acoplar el modelo de Clientes al de Inventario.
 */
export interface PaginatedClientes {
  items: Cliente[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
