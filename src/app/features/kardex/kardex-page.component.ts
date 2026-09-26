import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as ExcelJS from 'exceljs';
import { firstValueFrom } from 'rxjs';
import { CatalogosState } from '../../core/state/catalogos.state';
import { KardexState } from '../../core/state/kardex.state';
import { ProductosState } from '../../core/state/productos.state';
import { ListarMovimientosParams } from '../../core/api/api-movimientos.service';
import {
  Movimiento,
  PaginatedResponse,
  Usuario,
  ActualizarMovimientoPayload
} from '../../core/models/inventario.models';
import { ApiAuthService } from '../../core/api/api-auth.service';
import { ModalOverlayComponent } from '../../core/components/modal-overlay.component';
import { NotificationService } from '../../core/services/notification.service';
import { PaginadorComponent } from '../../core/components/paginador.component';
import { DropdownComponent, DropdownOption } from '../../core/components/dropdown.component';
import { DatePickerComponent } from '../../core/components/date-picker.component';
import { DateRangePickerComponent } from '../../core/components/date-range-picker.component';
import { TABLA_COMPONENTS } from '../../core/components/tabla.component';

import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-kardex-page',
  standalone: true,
  templateUrl: './kardex-page.component.html',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ModalOverlayComponent,
    PaginadorComponent,
    DropdownComponent,
    DatePickerComponent,
    DateRangePickerComponent,
    ...TABLA_COMPONENTS,
  ],
  host: {
    '(window:resize)': 'onResize()'
  }
})
export class KardexPageComponent implements OnInit {
  private readonly kardexState = inject(KardexState);
  private readonly productosState = inject(ProductosState);
  private readonly catalogos = inject(CatalogosState);
  private readonly apiAuth = inject(ApiAuthService);
  private readonly notify = inject(NotificationService);
  protected readonly auth = inject(AuthService);

  protected readonly productos = this.productosState.productos;
  protected readonly marcas = this.catalogos.marcas;
  protected readonly categorias = this.catalogos.categorias;
  protected readonly usuarios = signal<Usuario[]>([]);

  protected readonly kardex = signal<Movimiento[]>([]);
  protected readonly totalMovimientos = signal<number>(0);
  protected readonly cargando = signal<boolean>(false);
  protected readonly vistaModo = signal<'cards' | 'tabla'>('cards');

  Math = Math;
  Number = Number;

  // Computeds para los selectores personalizados
  protected readonly opcionesProductos = computed<DropdownOption[]>(() => {
    const selector = this.productosState.productosSelector();
    const full = this.productosState.productos();
    const lista = selector.length > 0 ? selector : full;

    return [
      { value: null, label: 'Todos los productos' },
      ...lista.map((p) => ({
        value: p.id,
        label: p.nombre,
        sublabel: p.codigoBarra ?? undefined,
      })),
    ];
  });

  protected readonly opcionesMarcas = computed<DropdownOption[]>(() => [
    { value: 'all', label: 'Todas las marcas' },
    { value: 'null', label: '— Sin marca —' },
    ...this.marcas().map((m) => ({
      value: m.id,
      label: m.nombre,
    })),
  ]);

  protected readonly opcionesCategorias = computed<DropdownOption[]>(() => [
    { value: 'all', label: 'Todas las categorías' },
    { value: 'null', label: '— Sin categoría —' },
    ...this.categorias().map((c) => ({
      value: c.id,
      label: c.nombre,
    })),
  ]);

  protected readonly opcionesTipo = computed<DropdownOption[]>(() => [
    { value: 0, label: 'Todos' },
    { value: 1, label: 'Solo Ingresos', badge: 'Ingreso', badgeClass: 'bg-emerald-50 text-emerald-700' },
    { value: 2, label: 'Solo Salidas', badge: 'Salida', badgeClass: 'bg-rose-50 text-rose-700' },
  ]);

  protected readonly opcionesUsuarios = computed<DropdownOption<number | null>[]>(() => [
    { value: null, label: 'Todos los usuarios' },
    ...this.usuarios().map((u) => ({ value: u.id, label: u.nombreCompleto })),
  ]);

  // Filtros (solo se ejecutan al hacer clic en 'Buscar' o dar Enter)
  protected busqueda = '';
  protected clienteFiltro = '';
  protected productoFiltro: number | null = null;
  protected marcaFiltro: number | 'null' | 'all' = 'all';
  protected categoriaFiltro: number | 'null' | 'all' = 'all';
  protected usuarioFiltro: number | null = null;
  protected tipoFiltro: 0 | 1 | 2 = 0;
  protected desde = '';
  protected hasta = '';

  // Paginación del Kardex
  protected readonly kardexPage = signal<number>(1);
  protected readonly kardexPageSize = signal<number>(10);
  protected readonly kardexTotalPages = signal<number>(0);
  private requestSequence = 0;

  // Modal de Observaciones
  protected readonly observacionModal = signal<string | null>(null);
  protected readonly isObservacionModalOpen = computed(() => this.observacionModal() !== null);

  // Modal de Edición
  protected readonly movimientoAEditar = signal<Movimiento | null>(null);
  protected readonly isEditModalOpen = computed(() => this.movimientoAEditar() !== null);
  protected editGuardando = false;
  
  // Formulario de edición
  protected editCantidad = 1;
  protected editPrecio = 0;
  protected editObservacion = '';

  // Modal de Confirmación de Eliminación
  protected readonly movimientoAEliminar = signal<Movimiento | null>(null);
  protected readonly isDeleteModalOpen = computed(() => this.movimientoAEliminar() !== null);

  protected onResize(): void {
    if (window.innerWidth < 768) {
      this.vistaModo.set('cards');
    } else {
      this.vistaModo.set('tabla');
    }
  }

  async ngOnInit(): Promise<void> {
    this.onResize();
    await Promise.all([
      this.catalogos.cargarCatalogos(),
      this.productosState.cargarSelectorProductos(),
    ]);
    try {
      const u = await firstValueFrom(this.apiAuth.usuarios());
      this.usuarios.set(u);
    } catch {
      this.usuarios.set([]);
    }
    await this.recargarKardex();
  }

  protected async recargarKardex(): Promise<void> {
    const requestId = ++this.requestSequence;
    this.cargando.set(true);
    try {
      const params: ListarMovimientosParams = {
        page: this.kardexPage(),
        size: this.kardexPageSize(),
        sortBy: 'fecha',
        order: 'desc',
      };
      // Parsear como hora LOCAL del usuario (sin sufijo Z = interpretado local,
      // no UTC). Si el user en Lima pickea "2026-09-20" → 00:00 Lima
      // (UTC-5) → 05:00 UTC Sep 20, no 19:00 UTC Sep 19.
      if (this.desde) {
        params.desde = new Date(this.desde + 'T00:00:00').toISOString();
      }
      if (this.hasta) {
        params.hasta = new Date(this.hasta + 'T23:59:59.999').toISOString();
      }
      if (this.tipoFiltro !== 0) params.tipo = this.tipoFiltro as 1 | 2;
      if (this.productoFiltro !== null) params.productoId = this.productoFiltro;
      if (this.marcaFiltro !== 'all' && this.marcaFiltro !== 'null') {
        params.marcaId = this.marcaFiltro;
      } else if (this.marcaFiltro === 'null') {
        params.marcaId = null;
      }
      if (this.categoriaFiltro !== 'all' && this.categoriaFiltro !== 'null') {
        params.categoriaId = this.categoriaFiltro;
      } else if (this.categoriaFiltro === 'null') {
        params.categoriaId = null;
      }
      if (this.usuarioFiltro !== null) params.creadoPorId = this.usuarioFiltro;
      if (this.clienteFiltro.trim()) params.cliente = this.clienteFiltro.trim();
      if (this.busqueda.trim()) params.q = this.busqueda.trim();

      const r: PaginatedResponse<Movimiento> = await this.kardexState.listarMovimientos(params);
      if (requestId === this.requestSequence) {
        this.kardex.set(r.items);
        this.totalMovimientos.set(r.totalItems);
        this.kardexTotalPages.set(r.totalPages);
      }
    } finally {
      if (requestId === this.requestSequence) {
        this.cargando.set(false);
      }
    }
  }

  protected ejecutarBusqueda(): void {
    this.kardexPage.set(1);
    this.recargarKardex();
  }

  protected onFiltroChange(): void {
    this.ejecutarBusqueda();
  }

  protected irAPagina(p: number): void {
    if (p < 1 || p > this.kardexTotalPages()) return;
    this.kardexPage.set(p);
    this.recargarKardex();
  }

  protected cambiarPaginaKardex(p: number): void {
    this.irAPagina(p);
  }

  protected formatearFecha(fecha: string | Date): string {
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
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

  protected limpiarFiltros(): void {
    this.busqueda = '';
    this.clienteFiltro = '';
    this.productoFiltro = null;
    this.marcaFiltro = 'all';
    this.categoriaFiltro = 'all';
    this.usuarioFiltro = null;
    this.tipoFiltro = 0;
    this.desde = '';
    this.hasta = '';
    this.ejecutarBusqueda();
  }

  protected abrirObservacionModal(obs: string): void {
    this.observacionModal.set(obs);
  }

  protected cerrarObservacionModal(): void {
    this.observacionModal.set(null);
  }

  // --- Lógica de Edición y Eliminación ---

  protected abrirModalEdicion(m: Movimiento): void {
    this.movimientoAEditar.set(m);
    this.editCantidad = m.cantidad;
    this.editPrecio = m.precioUnitario;
    this.editObservacion = m.observacion || '';
  }

  protected cerrarModalEdicion(): void {
    this.movimientoAEditar.set(null);
  }

  protected async guardarEdicion(): Promise<void> {
    const mov = this.movimientoAEditar();
    if (
      !mov ||
      !Number.isInteger(this.editCantidad) ||
      this.editCantidad <= 0 ||
      !Number.isFinite(this.editPrecio) ||
      this.editPrecio < 0
    ) return;

    this.editGuardando = true;
    try {
      const payload: ActualizarMovimientoPayload = {
        tipoMovimientoId: mov.tipoMovimientoId as 1 | 2,
        cantidad: this.editCantidad,
        precioUnitario: this.editPrecio,
        observacion: this.editObservacion.trim() || undefined,
      };
      
      await this.productosState.actualizarMovimiento(mov.id, payload);
      this.cerrarModalEdicion();
      this.recargarKardex();
      this.notify.success('Movimiento actualizado y Kardex recalculado correctamente.');
    } catch (e: any) {
      this.notify.error(e.message || 'Error al actualizar el movimiento');
    } finally {
      this.editGuardando = false;
    }
  }

  protected confirmarEliminar(m: Movimiento): void {
    this.movimientoAEliminar.set(m);
  }

  protected cerrarModalEliminar(): void {
    this.movimientoAEliminar.set(null);
  }

  protected async ejecutarEliminacion(): Promise<void> {
    const mov = this.movimientoAEliminar();
    if (!mov) return;
    
    this.cargando.set(true);
    try {
      await this.productosState.eliminarMovimiento(mov.id);
      this.cerrarModalEliminar();
      this.recargarKardex();
      this.notify.success('Movimiento eliminado y Kardex recalculado correctamente.');
    } catch (e: any) {
      this.notify.error(e.message || 'Error al eliminar el movimiento');
      this.cargando.set(false);
    }
  }

  protected resolverNombreProducto(m: { productoNombre?: string | null; productoId: number }): string {
    if (m.productoNombre) return m.productoNombre;
    const p = this.productos().find((x) => x.id === m.productoId);
    if (p?.nombre) return p.nombre;
    const sel = this.productosState.productosSelector().find((x) => x.id === m.productoId);
    if (sel?.nombre) return sel.nombre;
    return `Producto #${m.productoId}`;
  }

  protected nombreProducto(id: number): string {
    const p = this.productos().find((x) => x.id === id);
    if (p?.nombre) return p.nombre;
    const sel = this.productosState.productosSelector().find((x) => x.id === id);
    if (sel?.nombre) return sel.nombre;
    return `Producto #${id}`;
  }

  protected nombreMarca(id: number): string {
    const m = this.marcas().find((x) => x.id === id);
    return m?.nombre ?? `Marca #${id}`;
  }

  protected nombreCategoria(id: number): string {
    const c = this.categorias().find((x) => x.id === id);
    return c?.nombre ?? `Categoría #${id}`;
  }

  protected nombreUsuario(id: number): string {
    const u = this.usuarios().find((x) => x.id === id);
    return u?.nombreCompleto ?? `Usuario #${id}`;
  }

  protected buscarProductosRemotamente(query: string): void {
    void this.productosState.buscarSelectorProductos(query);
  }

  protected async exportarExcel(): Promise<void> {
    this.cargando.set(true);
    try {
      const params: ListarMovimientosParams = { order: 'desc' };
      if (this.desde) params.desde = new Date(this.desde + 'T00:00:00').toISOString();
      if (this.hasta) params.hasta = new Date(this.hasta + 'T23:59:59.999').toISOString();
      if (this.tipoFiltro !== 0) params.tipo = this.tipoFiltro;
      if (this.productoFiltro !== null) params.productoId = this.productoFiltro;
      if (this.marcaFiltro !== 'all') params.marcaId = this.marcaFiltro === 'null' ? null : this.marcaFiltro;
      if (this.categoriaFiltro !== 'all') params.categoriaId = this.categoriaFiltro === 'null' ? null : this.categoriaFiltro;
      if (this.usuarioFiltro !== null) params.creadoPorId = this.usuarioFiltro;
      if (this.clienteFiltro.trim()) params.cliente = this.clienteFiltro.trim();
      if (this.busqueda.trim()) params.q = this.busqueda.trim();
      const blob = await firstValueFrom(this.kardexState.exportarMovimientos(params));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      this.notify.error('No se pudo generar la exportación completa. No se descargó ningún archivo.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async generarExcelProfesional(movs: Movimiento[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Kardex de Inventario');

    sheet.columns = [
      { width: 14 }, // A: FECHA
      { width: 13 }, // B: TIPO
      { width: 36 }, // C: NOMBRE DEL PRODUCTO
      { width: 15 }, // D: CANTIDAD
      { width: 16 }, // E: PRECIO UNIT.
      { width: 18 }, // F: GASTO (S/)
      { width: 18 }, // G: GANANCIA (S/)
      { width: 22 }, // H: TOTAL DE UNIDADES
      { width: 22 }, // I: CLIENTE
      { width: 18 }, // J: USUARIO
    ];

    const fmtDDMMYYYY = (isoStr?: string | null): string => {
      if (!isoStr) return '';
      const parts = isoStr.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    let rangoTexto = 'Todos los tiempos';
    if (this.desde && this.hasta) {
      rangoTexto = `${fmtDDMMYYYY(this.desde)} - ${fmtDDMMYYYY(this.hasta)}`;
    } else if (this.desde) {
      rangoTexto = `Desde ${fmtDDMMYYYY(this.desde)}`;
    } else if (this.hasta) {
      rangoTexto = `Hasta ${fmtDDMMYYYY(this.hasta)}`;
    }
    const hoyTexto = fmtDDMMYYYY(new Date().toISOString());

    sheet.mergeCells('A1:J1');
    const r1 = sheet.getCell('A1');
    r1.value = 'KARDEX DE INVENTARIO – STOCKMASTER';
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
    r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:J2');
    const r2 = sheet.getCell('A2');
    r2.value = `Almacén: Principal | Rango de fechas: ${rangoTexto} | Generado el: ${hoyTexto}`;
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
    r2.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFFFFFFF' } };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    sheet.mergeCells('A3:J3');
    const r3 = sheet.getCell('A3');
    r3.value = 'Nota: INGRESO = compra de mercadería (GASTO) | SALIDA = venta de mercadería (GANANCIA)';
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    r3.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF595959' } };
    r3.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 18;

    const headers = [
      'FECHA',
      'TIPO',
      'NOMBRE DEL PRODUCTO',
      'CANTIDAD',
      'PRECIO UNIT.',
      'GASTO (S/)',
      'GANANCIA (S/)',
      'TOTAL DE UNIDADES',
      'CLIENTE',
      'USUARIO',
    ];
    const headerRow = sheet.getRow(4);
    headerRow.height = 24;
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = {
        horizontal: idx === 0 || idx === 1 || idx === 9 ? 'center' : idx >= 3 && idx <= 7 ? 'right' : 'left',
        vertical: 'middle',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF1B365D' } },
        left: { style: 'thin', color: { argb: 'FF1B365D' } },
        bottom: { style: 'medium', color: { argb: 'FF1B365D' } },
        right: { style: 'thin', color: { argb: 'FF1B365D' } },
      };
    });

    sheet.autoFilter = 'A4:J4';

    const movsAsc = [...movs].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );

    const saldosPorProducto = new Map<number, number>();
    const saldoPostMovimientoMap = new Map<number, number>();

    let totalNetCantidad = 0;
    let totalGasto = 0;
    let totalGanancia = 0;
    let utilidadAcum = 0;

    for (const m of movsAsc) {
      const esIngreso = m.tipoMovimientoId === 1;
      const cantDelta = esIngreso ? m.cantidad : -m.cantidad;
      const gasto = esIngreso ? m.cantidad * m.precioUnitario : 0;
      const ganancia = !esIngreso ? m.cantidad * m.precioUnitario : 0;

      totalNetCantidad += cantDelta;
      totalGasto += gasto;
      totalGanancia += ganancia;
      utilidadAcum += (ganancia - gasto);

      const prodId = m.productoId;
      const nuevoSaldo = (saldosPorProducto.get(prodId) ?? 0) + cantDelta;
      saldosPorProducto.set(prodId, nuevoSaldo);
      saldoPostMovimientoMap.set(Number(m.id), nuevoSaldo);
    }

    const movsDesc = [...movs].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );

    let rowIdx = 5;
    for (const m of movsDesc) {
      const esIngreso = m.tipoMovimientoId === 1;
      const cantDelta = esIngreso ? m.cantidad : -m.cantidad;
      const gasto = esIngreso ? m.cantidad * m.precioUnitario : 0;
      const ganancia = !esIngreso ? m.cantidad * m.precioUnitario : 0;
      const saldoAcumulado = saldoPostMovimientoMap.get(Number(m.id)) ?? 0;

      const r = sheet.getRow(rowIdx);
      r.height = 20;

      const rowBgColor = esIngreso ? 'FFE2EFDA' : 'FFFCE4D6';

      const c1 = r.getCell(1);
      c1.value = fmtDDMMYYYY(m.fecha);
      c1.alignment = { horizontal: 'center', vertical: 'middle' };

      const c2 = r.getCell(2);
      c2.value = esIngreso ? 'INGRESO' : 'SALIDA';
      c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: esIngreso ? 'FF276A3C' : 'FFC00000' } };
      c2.alignment = { horizontal: 'center', vertical: 'middle' };

      const c3 = r.getCell(3);
      c3.value = this.resolverNombreProducto(m);
      c3.alignment = { horizontal: 'left', vertical: 'middle' };

      const c4 = r.getCell(4);
      c4.value = cantDelta;
      c4.numFmt = '#,##0;-#,##0;0';
      c4.alignment = { horizontal: 'right', vertical: 'middle' };
      if (!esIngreso) c4.font = { color: { argb: 'FFC00000' } };

      const c5 = r.getCell(5);
      c5.value = m.precioUnitario;
      c5.numFmt = '"S/" #,##0.00';
      c5.alignment = { horizontal: 'right', vertical: 'middle' };

      const c6 = r.getCell(6);
      c6.value = gasto;
      c6.numFmt = '"S/" #,##0.00';
      c6.alignment = { horizontal: 'right', vertical: 'middle' };

      const c7 = r.getCell(7);
      c7.value = ganancia;
      c7.numFmt = '"S/" #,##0.00';
      c7.alignment = { horizontal: 'right', vertical: 'middle' };

      const c8 = r.getCell(8);
      c8.value = saldoAcumulado;
      c8.numFmt = '#,##0;-#,##0;0';
      c8.alignment = { horizontal: 'right', vertical: 'middle' };
      c8.font = { name: 'Calibri', size: 10, bold: true, color: { argb: saldoAcumulado < 0 ? 'FFC00000' : 'FF000000' } };

      const c9 = r.getCell(9);
      c9.value = m.cliente || '—';
      c9.alignment = { horizontal: 'left', vertical: 'middle' };

      const c10 = r.getCell(10);
      c10.value = m.creadoPorNombre || 'ADMIN';
      c10.alignment = { horizontal: 'center', vertical: 'middle' };

      for (let col = 1; col <= 10; col++) {
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

    const tRow = sheet.getRow(rowIdx);
    tRow.height = 24;

    sheet.mergeCells(`A${rowIdx}:C${rowIdx}`);
    const tLabel = tRow.getCell(1);
    tLabel.value = 'TOTALES';
    tLabel.font = { name: 'Calibri', size: 11, bold: true };
    tLabel.alignment = { horizontal: 'center', vertical: 'middle' };

    const tCant = tRow.getCell(4);
    tCant.value = totalNetCantidad;
    tCant.numFmt = '+#,##0;-#,##0;0';
    tCant.font = { name: 'Calibri', size: 10, bold: true };
    tCant.alignment = { horizontal: 'right', vertical: 'middle' };

    const tGasto = tRow.getCell(6);
    tGasto.value = totalGasto;
    tGasto.numFmt = '"S/" #,##0.00';
    tGasto.font = { name: 'Calibri', size: 10, bold: true };
    tGasto.alignment = { horizontal: 'right', vertical: 'middle' };

    const tGan = tRow.getCell(7);
    tGan.value = totalGanancia;
    tGan.numFmt = '"S/" #,##0.00';
    tGan.font = { name: 'Calibri', size: 10, bold: true };
    tGan.alignment = { horizontal: 'right', vertical: 'middle' };

    const tUnits = tRow.getCell(8);
    tUnits.value = totalNetCantidad;
    tUnits.numFmt = '+#,##0;-#,##0;0';
    tUnits.font = { name: 'Calibri', size: 10, bold: true, color: { argb: totalNetCantidad < 0 ? 'FFC00000' : 'FF000000' } };
    tUnits.alignment = { horizontal: 'right', vertical: 'middle' };

    for (let col = 1; col <= 10; col++) {
      const cell = tRow.getCell(col);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'double', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      };
    }

    rowIdx += 2;

    const rHeaderIdx = rowIdx;
    sheet.mergeCells(`A${rHeaderIdx}:J${rHeaderIdx}`);
    const rHeader = sheet.getCell(`A${rHeaderIdx}`);
    rHeader.value = 'RESUMEN GENERAL DEL PERIODO';
    rHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    rHeader.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    rHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(rHeaderIdx).height = 24;

    rowIdx++;
    const rSubIdx = rowIdx;
    const rSub = sheet.getRow(rSubIdx);
    rSub.height = 26;

    sheet.mergeCells(`A${rSubIdx}:C${rSubIdx}`);
    const lblGasto = rSub.getCell(1);
    lblGasto.value = 'Total Gasto (compras) S/:';
    lblGasto.font = { name: 'Calibri', size: 10, bold: true };
    lblGasto.alignment = { horizontal: 'right', vertical: 'middle' };

    const valGasto = rSub.getCell(4);
    valGasto.value = totalGasto;
    valGasto.numFmt = '"S/" #,##0.00';
    valGasto.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFC00000' } };
    valGasto.alignment = { horizontal: 'left', vertical: 'middle' };

    sheet.mergeCells(`F${rSubIdx}:I${rSubIdx}`);
    const lblGan = rSub.getCell(6);
    lblGan.value = 'Total Ganancia (ventas) S/:';
    lblGan.font = { name: 'Calibri', size: 10, bold: true };
    lblGan.alignment = { horizontal: 'right', vertical: 'middle' };

    const valGan = rSub.getCell(10);
    valGan.value = totalGanancia;
    valGan.numFmt = '"S/" #,##0.00';
    valGan.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF276A3C' } };
    valGan.alignment = { horizontal: 'left', vertical: 'middle' };

    rowIdx += 2;

    const rUtilIdx = rowIdx;
    sheet.getRow(rUtilIdx).height = 30;

    sheet.mergeCells(`A${rUtilIdx}:F${rUtilIdx}`);
    const lblNetUtil = sheet.getCell(`A${rUtilIdx}`);
    lblNetUtil.value = 'UTILIDAD NETA DEL PERIODO (Ganancia − Gasto) S/:';
    lblNetUtil.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    lblNetUtil.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    lblNetUtil.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(`G${rUtilIdx}:J${rUtilIdx}`);
    const valNetUtil = sheet.getCell(`G${rUtilIdx}`);
    valNetUtil.value = utilidadAcum;
    valNetUtil.numFmt = '"S/" #,##0.00;"(S/" #,##0.00")"';
    valNetUtil.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    valNetUtil.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    valNetUtil.alignment = { horizontal: 'center', vertical: 'middle' };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_reporte_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
