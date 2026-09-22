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
  desde: string | null;
  hasta: string | null;
  tipoDocumentoId: number | null;
  estadoDeuda: 'con-deuda' | 'sin-deuda' | null;
}

export interface EstadoCuentaCliente {
  cliente: Cliente;
  totalFacturado: number;
  totalPagado: number;
  deudaActual: number;
  cantidadVentas: number;
  cantidadAbonos: number;
  ventas: Venta[];
}

export interface KpiClientes {
  totalClientes: number;
  clientesConDeuda: number;
  clientesSinDeuda: number;
  nuevosEsteMes: number;
}
