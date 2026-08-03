import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as ExcelJS from 'exceljs';
import { InventarioState } from '../state/inventario.state';
import { ModalOverlayComponent } from './modal-overlay.component';
import { TABLA_COMPONENTS } from './tabla.component';

@Component({
  selector: 'app-kardex-modal',
  standalone: true,
  imports: [CommonModule, ModalOverlayComponent, ...TABLA_COMPONENTS],
  template: `
    <app-modal-overlay
      [open]="state.kardexProductoId() !== null"
      containerClass="w-full max-w-5xl max-h-[90vh] overflow-hidden"
      (close)="cerrar()">
      <div class="flex flex-col h-full max-h-[90vh]">
        <!-- Header sin flex-wrap para impedir que el boton cerrar baje -->
        <header class="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-nowrap flex-shrink-0">
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-bold text-slate-900 inline-flex items-center gap-2 max-w-full truncate" [title]="nombreProducto()">
              <svg class="w-4 h-4 text-blue-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span class="truncate">Kardex: {{ nombreProducto() }}</span>
            </h3>
            <p class="text-[11px] text-slate-500 mt-0.5 tabular-nums truncate">
              {{ state.kardexMovimientos().length }} movimientos en total
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
              (click)="exportarExcel()"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Exportar Excel
            </button>
            <button
              type="button"
              class="grid place-items-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              (click)="cerrar()"
              aria-label="Cerrar modal de Kardex"
              title="Cerrar"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </header>

        <div class="p-6 overflow-y-auto scrollbar-thin flex-1 min-h-0">
          <app-tabla
            modo="scroll"
            [limiteScroll]="10"
            [itemsCount]="state.kardexMovimientos().length"
            [cargando]="state.kardexCargando()"
            [isEmpty]="state.kardexMovimientos().length === 0"
            mensajeVacio="Este producto aún no tiene movimientos registrados."
          >
            <tr table-header class="text-left">
              <th app-th>Fecha y Hora</th>
              <th app-th>Tipo</th>
              <th app-th align="right">Cant.</th>
              <th app-th align="right">Precio Unit.</th>
              <th app-th align="right">Total</th>
              <th app-th>Cliente</th>
            </tr>

            <ng-container table-body>
              @for (m of state.kardexMovimientos(); track m.id) {
                <tr app-tr>
                  <td app-td extraClass="text-xs text-slate-600 tabular-nums whitespace-nowrap">{{ formatearFecha(m.fecha) }}</td>
                  <td app-td>
                    <span [class]="esIngreso(m) ? 'chip chip-success' : 'chip chip-danger'">
                      {{ esIngreso(m) ? 'INGRESO' : 'SALIDA' }}
                    </span>
                  </td>
                  <td app-td align="right" extraClass="text-sm font-bold tabular-nums" [class.text-emerald-600]="esIngreso(m)" [class.text-rose-600]="!esIngreso(m)">
                    {{ esIngreso(m) ? '+' : '-' }}{{ m.cantidad }}
                  </td>
                  <td app-td align="right" extraClass="text-sm text-slate-700 tabular-nums whitespace-nowrap">
                    S/. {{ m.precioUnitario | number:'1.2-2' }}
                  </td>
                  <td app-td align="right" extraClass="text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    S/. {{ (m.cantidad * m.precioUnitario) | number:'1.2-2' }}
                  </td>
                  <td app-td extraClass="text-xs text-slate-500 max-w-[150px] truncate" [title]="m.cliente || ''">
                    {{ m.cliente || '—' }}
                  </td>
                </tr>
              }
            </ng-container>
          </app-tabla>
        </div>

        <!-- Footer con botón de cerrar pegado a la derecha -->
        <footer class="px-6 py-3.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            class="btn-secondary h-9 px-4 text-xs font-semibold"
            (click)="cerrar()"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </app-modal-overlay>
  `,
})
export class KardexModalComponent {
  protected readonly state = inject(InventarioState);

  protected readonly nombreProducto = computed(() => {
    const id = this.state.kardexProductoId();
    if (id === null) return '';
    const p = this.state.productos().find(x => x.id === id);
    if (p) return p.nombre ?? p.codigoBarra ?? `Producto #${id}`;
    const sel = this.state.productosSelector().find(x => x.id === id);
    if (sel) return sel.nombre ?? sel.codigoBarra ?? `Producto #${id}`;
    return `Producto #${id}`;
  });

  protected cerrar(): void {
    this.state.cerrarKardexModal();
  }

  protected async exportarExcel(): Promise<void> {
    const movs = this.state.kardexMovimientos();
    const pId = this.state.kardexProductoId();
    if (!pId || movs.length === 0) return;
    const prodNombre = this.nombreProducto();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Kardex del Producto');

    // Configurar anchos de columna (10 columnas: A a J)
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

    const hoyTexto = fmtDDMMYYYY(new Date().toISOString());

    // -------------------------------------------------------------
    // FILA 1: Encabezado Principal Azul (#0070C0)
    // -------------------------------------------------------------
    sheet.mergeCells('A1:J1');
    const r1 = sheet.getCell('A1');
    r1.value = `KARDEX DE INVENTARIO – ${prodNombre.toUpperCase()}`;
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
    r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 28;

    // -------------------------------------------------------------
    // FILA 2: Subencabezado Gris Oscuro (#333333)
    // -------------------------------------------------------------
    sheet.mergeCells('A2:J2');
    const r2 = sheet.getCell('A2');
    r2.value = `Almacén: Principal | Producto: ${prodNombre} | Generado el: ${hoyTexto}`;
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
    r2.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFFFFFFF' } };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // -------------------------------------------------------------
    // FILA 3: Nota aclaratoria (#F2F2F2)
    // -------------------------------------------------------------
    sheet.mergeCells('A3:J3');
    const r3 = sheet.getCell('A3');
    r3.value = 'Nota: INGRESO = compra de mercadería (GASTO) | SALIDA = venta de mercadería (GANANCIA)';
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    r3.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF595959' } };
    r3.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 18;

    // -------------------------------------------------------------
    // FILA 4: Encabezados de Tabla (#1F4E78) con AutoFilter
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // CÁLCULO DE SALDOS (Cronológico: de más antiguo a más reciente)
    // -------------------------------------------------------------
    const movsAsc = [...movs].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    );

    const saldoPostMovimientoMap = new Map<number, number>();
    let runningSaldo = 0;
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

      runningSaldo += cantDelta;
      saldoPostMovimientoMap.set(Number(m.id), runningSaldo);
    }

    // -------------------------------------------------------------
    // SALIDA DE FILAS DE DATOS (Orden Descendente: de más reciente a más antiguo)
    // -------------------------------------------------------------
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

      // Val 1: FECHA
      const c1 = r.getCell(1);
      c1.value = fmtDDMMYYYY(m.fecha);
      c1.alignment = { horizontal: 'center', vertical: 'middle' };

      // Val 2: TIPO
      const c2 = r.getCell(2);
      c2.value = esIngreso ? 'INGRESO' : 'SALIDA';
      c2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: esIngreso ? 'FF276A3C' : 'FFC00000' } };
      c2.alignment = { horizontal: 'center', vertical: 'middle' };

      // Val 3: NOMBRE DEL PRODUCTO
      const c3 = r.getCell(3);
      c3.value = prodNombre;
      c3.alignment = { horizontal: 'left', vertical: 'middle' };

      // Val 4: CANTIDAD
      const c4 = r.getCell(4);
      c4.value = cantDelta;
      c4.numFmt = '#,##0;-#,##0;0';
      c4.alignment = { horizontal: 'right', vertical: 'middle' };
      if (!esIngreso) c4.font = { color: { argb: 'FFC00000' } };

      // Val 5: PRECIO UNIT.
      const c5 = r.getCell(5);
      c5.value = m.precioUnitario;
      c5.numFmt = '"S/" #,##0.00';
      c5.alignment = { horizontal: 'right', vertical: 'middle' };

      // Val 6: GASTO (S/)
      const c6 = r.getCell(6);
      c6.value = gasto;
      c6.numFmt = '"S/" #,##0.00';
      c6.alignment = { horizontal: 'right', vertical: 'middle' };

      // Val 7: GANANCIA (S/)
      const c7 = r.getCell(7);
      c7.value = ganancia;
      c7.numFmt = '"S/" #,##0.00';
      c7.alignment = { horizontal: 'right', vertical: 'middle' };

      // Val 8: TOTAL DE UNIDADES
      const c8 = r.getCell(8);
      c8.value = saldoAcumulado;
      c8.numFmt = '#,##0;-#,##0;0';
      c8.alignment = { horizontal: 'right', vertical: 'middle' };
      c8.font = { name: 'Calibri', size: 10, bold: true, color: { argb: saldoAcumulado < 0 ? 'FFC00000' : 'FF000000' } };

      // Val 9: CLIENTE
      const c9 = r.getCell(9);
      c9.value = m.cliente || '—';
      c9.alignment = { horizontal: 'left', vertical: 'middle' };

      // Val 10: USUARIO
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

    // -------------------------------------------------------------
    // FILA DE TOTALES (#FFF2CC)
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // RESUMEN GENERAL DEL PERIODO (#2F5597)
    // -------------------------------------------------------------
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

    const nombreLimpio = prodNombre.replace(/[^\w]+/g, '_');
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${nombreLimpio}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  protected esIngreso(m: { tipoMovimientoId: number }): boolean {
    return m.tipoMovimientoId === 1;
  }
}
