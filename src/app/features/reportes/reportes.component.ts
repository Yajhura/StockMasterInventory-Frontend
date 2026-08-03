import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import * as ExcelJS from 'exceljs';
import { firstValueFrom } from 'rxjs';
import { InventarioState } from '../../core/state/inventario.state';
import {
  Usuario,
  Movimiento,
} from '../../core/models/inventario.models';
import {
  ApiReportesService,
  TopVendidoItem,
  TopClienteItem,
  RentabilidadItem,
  StockCriticoEstancadosResult,
} from '../../core/api/api-reportes.service';
import { ApiAuthService } from '../../core/api/api-auth.service';
import { ModalOverlayComponent } from '../../core/components/modal-overlay.component';

@Component({
  selector: 'app-reportes',
  standalone: true,
  templateUrl: './reportes.component.html',
  imports: [CommonModule, FormsModule, RouterLink, ModalOverlayComponent],
})
export class ReportesComponent implements OnInit {
  private readonly state = inject(InventarioState);
  private readonly apiReportes = inject(ApiReportesService);
  private readonly apiAuth = inject(ApiAuthService);

  protected readonly productos = this.state.productos;
  protected readonly marcas = this.state.marcas;
  protected readonly categorias = this.state.categorias;
  protected readonly usuarios = signal<Usuario[]>([]);

  // Top Vendidos
  protected readonly topVendidos = signal<TopVendidoItem[]>([]);
  protected readonly cargandoTop = signal<boolean>(false);
  protected readonly topLimit = signal<number>(10);
  protected readonly topRango = signal<'7d' | 'mes' | 'anio'>('7d');

  // Top Clientes e Historial
  protected readonly topClientesList = signal<TopClienteItem[]>([]);
  protected readonly cargandoTopClientes = signal<boolean>(false);
  protected readonly topClientesLimit = signal<number>(10);

  // Modal Historial por Cliente
  protected readonly clienteModal = signal<string | null>(null);
  protected readonly historialCliente = signal<Movimiento[]>([]);
  protected readonly cargandoHistorialCliente = signal<boolean>(false);
  protected readonly isClienteModalOpen = computed(() => this.clienteModal() !== null);

  // Stock Crítico y Productos Sin Movimiento (Estancados)
  protected readonly stockCriticoData = signal<StockCriticoEstancadosResult | null>(null);
  protected readonly cargandoStockCritico = signal<boolean>(false);
  protected readonly tabStock = signal<'critico' | 'estancado'>('critico');
  protected readonly diasEstancado = signal<number>(30);

  // Rentabilidad y Margen
  protected readonly rentabilidadItems = signal<RentabilidadItem[]>([]);
  protected readonly cargandoRentabilidad = signal<boolean>(false);
  protected readonly tabRentabilidad = signal<'producto' | 'categoria'>('producto');

  // Catálogo Oficial
  protected cargandoCatalogoPdf = signal<boolean>(false);
  protected cargandoCatalogoExcel = signal<boolean>(false);

  // Filtros globales para reportes
  protected marcaFiltro: number | 'null' | 'all' = 'all';
  protected categoriaFiltro: number | 'null' | 'all' = 'all';
  protected desde = '';
  protected hasta = '';

  protected readonly rentabilidadPorCategoria = computed(() => {
    const items = this.rentabilidadItems();
    const map = new Map<string, {
      categoriaNombre: string;
      productosCount: number;
      unidadesVendidas: number;
      totalGasto: number;
      totalVentas: number;
      gananciaNeta: number;
      margenPorcentaje: number;
    }>();

    for (const item of items) {
      const cat = item.categoriaNombre || 'Sin Categoría';
      const prev = map.get(cat) ?? {
        categoriaNombre: cat,
        productosCount: 0,
        unidadesVendidas: 0,
        totalGasto: 0,
        totalVentas: 0,
        gananciaNeta: 0,
        margenPorcentaje: 0,
      };
      prev.productosCount += 1;
      prev.unidadesVendidas += item.unidadesVendidas;
      prev.totalGasto += item.totalGastoCompras;
      prev.totalVentas += item.totalIngresoVentas;
      prev.gananciaNeta += item.gananciaNeta;
      map.set(cat, prev);
    }

    const result = Array.from(map.values()).map((c) => {
      const margen = c.totalVentas > 0 ? Math.round((c.gananciaNeta / c.totalVentas) * 10000) / 100 : 0;
      return { ...c, margenPorcentaje: margen };
    });

    return result.sort((a, b) => b.gananciaNeta - a.gananciaNeta);
  });

  protected readonly rentabilidadKpis = computed(() => {
    const items = this.rentabilidadItems();
    let totalVentas = 0;
    let totalGasto = 0;
    let gananciaTotal = 0;
    let unidadesVendidas = 0;

    for (const item of items) {
      totalVentas += item.totalIngresoVentas;
      totalGasto += item.totalGastoCompras;
      gananciaTotal += item.gananciaNeta;
      unidadesVendidas += item.unidadesVendidas;
    }

    const margenGlobal = totalVentas > 0 ? Math.round((gananciaTotal / totalVentas) * 10000) / 100 : 0;
    return {
      totalVentas,
      totalGasto,
      gananciaTotal,
      unidadesVendidas,
      margenGlobal,
      totalProductosCount: items.length,
    };
  });

  Math = Math;

  // KPIs resumen del rango de fechas
  protected readonly kpiData = signal<{
    unidadesIngresadas: number;
    unidadesSalidas: number;
    saldoNeto: number;
    montoIngresos: number;
    montoSalidas: number;
    cantidadIngresos: number;
    cantidadSalidas: number;
  }>({
    unidadesIngresadas: 0,
    unidadesSalidas: 0,
    saldoNeto: 0,
    montoIngresos: 0,
    montoSalidas: 0,
    cantidadIngresos: 0,
    cantidadSalidas: 0,
  });

  async ngOnInit(): Promise<void> {
    await this.state.cargarCatalogos();
    try {
      const u = await firstValueFrom(this.apiAuth.usuarios());
      this.usuarios.set(u);
    } catch {
      this.usuarios.set([]);
    }
    await this.cargarKpiResumen();
    await this.cargarTopVendidos();
    await this.cargarTopClientes();
    await this.cargarStockCriticoEstancados();
    await this.cargarRentabilidad();
  }

  protected async cargarKpiResumen(): Promise<void> {
    try {
      const data = await firstValueFrom(this.apiReportes.kpiResumen());
      this.kpiData.set(data);
    } catch {
      // conservar ceros si falla
    }
  }

  protected async cargarStockCriticoEstancados(): Promise<void> {
    this.cargandoStockCritico.set(true);
    try {
      const res = await firstValueFrom(this.apiReportes.stockCriticoEstancados(this.diasEstancado()));
      this.stockCriticoData.set(res);
    } catch {
      this.stockCriticoData.set(null);
    } finally {
      this.cargandoStockCritico.set(false);
    }
  }

  protected onDiasEstancadoChange(dias: number): void {
    this.diasEstancado.set(dias);
    this.cargarStockCriticoEstancados();
  }

  protected async cargarTopClientes(): Promise<void> {
    this.cargandoTopClientes.set(true);
    try {
      let desdeISO: string | undefined;
      let hastaISO: string | undefined;
      if (this.desde) desdeISO = new Date(this.desde + 'T00:00:00.000Z').toISOString();
      if (this.hasta) hastaISO = new Date(this.hasta + 'T23:59:59.999Z').toISOString();

      const items = await firstValueFrom(this.apiReportes.topClientes({
        desde: desdeISO,
        hasta: hastaISO,
        limit: this.topClientesLimit(),
      }));
      this.topClientesList.set(items);
    } catch {
      this.topClientesList.set([]);
    } finally {
      this.cargandoTopClientes.set(false);
    }
  }

  protected async verHistorialCliente(clienteNombre: string): Promise<void> {
    this.clienteModal.set(clienteNombre);
    this.cargandoHistorialCliente.set(true);
    try {
      const res = await this.state.listarMovimientos({
        page: 1,
        size: 200,
        cliente: clienteNombre,
        tipo: 2, // SALIDAS / VENTAS
        sortBy: 'fecha',
        order: 'desc',
      });
      this.historialCliente.set(res.items);
    } catch {
      this.historialCliente.set([]);
    } finally {
      this.cargandoHistorialCliente.set(false);
    }
  }

  protected cerrarClienteModal(): void {
    this.clienteModal.set(null);
    this.historialCliente.set([]);
  }

  protected async cargarRentabilidad(): Promise<void> {
    this.cargandoRentabilidad.set(true);
    try {
      let desdeISO: string | undefined;
      let hastaISO: string | undefined;
      if (this.desde) desdeISO = new Date(this.desde + 'T00:00:00.000Z').toISOString();
      if (this.hasta) hastaISO = new Date(this.hasta + 'T23:59:59.999Z').toISOString();

      const marcaId = this.marcaFiltro !== 'all' && this.marcaFiltro !== 'null' ? Number(this.marcaFiltro) : undefined;
      const categoriaId = this.categoriaFiltro !== 'all' && this.categoriaFiltro !== 'null' ? Number(this.categoriaFiltro) : undefined;

      const items = await firstValueFrom(this.apiReportes.rentabilidad({
        desde: desdeISO,
        hasta: hastaISO,
        marcaId,
        categoriaId,
      }));
      this.rentabilidadItems.set(items);
    } catch {
      this.rentabilidadItems.set([]);
    } finally {
      this.cargandoRentabilidad.set(false);
    }
  }

  protected async cargarTopVendidos(): Promise<void> {
    this.cargandoTop.set(true);
    try {
      let desdeISO: string | undefined;
      let hastaISO: string | undefined;
      const r = this.topRango();
      const hoy = new Date();
      if (r === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        desdeISO = d.toISOString();
      } else if (r === 'mes') {
        const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        desdeISO = d.toISOString();
      } else if (r === 'anio') {
        const d = new Date(hoy.getFullYear(), 0, 1);
        desdeISO = d.toISOString();
      }
      const res = await firstValueFrom(this.apiReportes.topVendidos({ limit: this.topLimit(), desde: desdeISO, hasta: hastaISO }));
      this.topVendidos.set(res.items);
    } catch {
      this.topVendidos.set([]);
    } finally {
      this.cargandoTop.set(false);
    }
  }

  protected onTopRangoChange(rango: '7d' | 'mes' | 'anio'): void {
    this.topRango.set(rango);
    this.cargarTopVendidos();
  }

  protected onFiltroChange(): void {
    this.cargarRentabilidad();
    this.cargarTopClientes();
  }

  protected limpiarFiltros(): void {
    this.marcaFiltro = 'all';
    this.categoriaFiltro = 'all';
    this.desde = '';
    this.hasta = '';
    this.cargarRentabilidad();
    this.cargarTopClientes();
  }

  protected resolverNombreProducto(m: { productoNombre?: string | null; productoId: number }): string {
    if (m.productoNombre) return m.productoNombre;
    const p = this.productos().find((x) => x.id === m.productoId);
    if (p?.nombre) return p.nombre;
    const sel = this.state.productosSelector().find((x) => x.id === m.productoId);
    if (sel?.nombre) return sel.nombre;
    return `Producto #${m.productoId}`;
  }

  protected nombreMarca(id?: number | null): string {
    if (!id) return '— Sin Marca —';
    const m = this.marcas().find((x) => x.id === id);
    return m?.nombre ?? `Marca #${id}`;
  }

  protected nombreCategoria(id?: number | null): string {
    if (!id) return '— Sin Categoría —';
    const c = this.categorias().find((x) => x.id === id);
    return c?.nombre ?? `Categoría #${id}`;
  }

  protected formatearFecha(fecha: string | Date | null): string {
    if (!fecha) return '—';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${dd}/${mm}/${yyyy} - ${hours}:${minutes} ${ampm}`;
  }

  protected async descargarCatalogoPdf(): Promise<void> {
    this.cargandoCatalogoPdf.set(true);
    try {
      const marcaId = this.marcaFiltro !== 'all' && this.marcaFiltro !== 'null' ? Number(this.marcaFiltro) : undefined;
      const categoriaId = this.categoriaFiltro !== 'all' && this.categoriaFiltro !== 'null' ? Number(this.categoriaFiltro) : undefined;
      const blob = await firstValueFrom(this.apiReportes.descargarCatalogoPdf(marcaId, categoriaId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `catalogo_productos_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      this.cargandoCatalogoPdf.set(false);
    }
  }

  protected async descargarCatalogoExcel(): Promise<void> {
    this.cargandoCatalogoExcel.set(true);
    try {
      const prods = this.productos();
      const marcaId = this.marcaFiltro !== 'all' && this.marcaFiltro !== 'null' ? Number(this.marcaFiltro) : null;
      const categoriaId = this.categoriaFiltro !== 'all' && this.categoriaFiltro !== 'null' ? Number(this.categoriaFiltro) : null;

      const filtrados = prods.filter((p) => {
        if (marcaId !== null && p.marcaId !== marcaId) return false;
        if (categoriaId !== null && p.categoriaId !== categoriaId) return false;
        return true;
      });

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Catálogo Oficial');

      sheet.columns = [
        { width: 8 },  // A: N°
        { width: 38 }, // B: PRODUCTO
        { width: 18 }, // C: CÓDIGO
        { width: 18 }, // D: MARCA
        { width: 18 }, // E: CATEGORÍA
        { width: 22 }, // F: PRECIO (S/)
        { width: 18 }, // G: DISPONIBILIDAD
        { width: 16 }, // H: ESTADO
      ];

      const hoyTexto = this.formatearFecha(new Date());

      // Banner Principal
      sheet.mergeCells('A1:H1');
      const r1 = sheet.getCell('A1');
      r1.value = 'CATÁLOGO OFICIAL DE PRODUCTOS – STOCKMASTER';
      r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B3DF5' } };
      r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      r1.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 28;

      sheet.mergeCells('A2:H2');
      const r2 = sheet.getCell('A2');
      let marcaNombre = 'Todas';
      if (marcaId) {
        const m = this.marcas().find((x) => x.id === marcaId);
        if (m) marcaNombre = m.nombre;
      }
      let catNombre = 'Todas';
      if (categoriaId) {
        const c = this.categorias().find((x) => x.id === categoriaId);
        if (c) catNombre = c.nombre;
      }
      r2.value = `Marca: ${marcaNombre} | Categoría: ${catNombre} | Emisión: ${hoyTexto}`;
      r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
      r2.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFFFFFFF' } };
      r2.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(2).height = 20;

      // Encabezados
      const headers = [
        'N°',
        'NOMBRE DEL PRODUCTO',
        'CÓDIGO DE BARRA',
        'MARCA',
        'CATEGORÍA',
        'PRECIO SUGERIDO (S/)',
        'DISPONIBILIDAD',
        'ESTADO',
      ];
      const headerRow = sheet.getRow(3);
      headerRow.height = 24;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = {
          horizontal: idx === 0 || idx === 2 || idx === 7 ? 'center' : idx >= 5 && idx <= 6 ? 'right' : 'left',
          vertical: 'middle',
        };
      });

      sheet.autoFilter = 'A3:H3';

      let rowIdx = 4;
      let count = 1;
      for (const p of filtrados) {
        const r = sheet.getRow(rowIdx);
        r.height = 20;

        const hayStock = p.stockActual > 0;
        const rowBgColor = count % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';

        const c1 = r.getCell(1);
        c1.value = count++;
        c1.alignment = { horizontal: 'center', vertical: 'middle' };

        const c2 = r.getCell(2);
        c2.value = p.nombre;
        c2.font = { name: 'Calibri', size: 10, bold: true };
        c2.alignment = { horizontal: 'left', vertical: 'middle' };

        const c3 = r.getCell(3);
        c3.value = p.codigoBarra || '—';
        c3.alignment = { horizontal: 'center', vertical: 'middle' };

        const c4 = r.getCell(4);
        c4.value = this.nombreMarca(p.marcaId);
        c4.alignment = { horizontal: 'left', vertical: 'middle' };

        const c5 = r.getCell(5);
        c5.value = this.nombreCategoria(p.categoriaId);
        c5.alignment = { horizontal: 'left', vertical: 'middle' };

        const c6 = r.getCell(6);
        c6.value = p.precioVentaSugerido;
        c6.numFmt = '"S/" #,##0.00';
        c6.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0070C0' } };
        c6.alignment = { horizontal: 'right', vertical: 'middle' };

        const c7 = r.getCell(7);
        c7.value = p.stockActual;
        c7.numFmt = '#,##0';
        c7.alignment = { horizontal: 'right', vertical: 'middle' };

        const c8 = r.getCell(8);
        c8.value = hayStock ? 'DISPONIBLE' : 'SIN STOCK';
        c8.font = { name: 'Calibri', size: 9, bold: true, color: { argb: hayStock ? 'FF276A3C' : 'FFC00000' } };
        c8.alignment = { horizontal: 'center', vertical: 'middle' };

        for (let col = 1; col <= 8; col++) {
          const cell = r.getCell(col);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          };
        }

        rowIdx++;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `catalogo_oficial_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      this.cargandoCatalogoExcel.set(false);
    }
  }
}
