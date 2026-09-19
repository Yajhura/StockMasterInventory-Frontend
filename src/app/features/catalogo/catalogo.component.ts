import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as ExcelJS from 'exceljs';
import { DropdownComponent, DropdownOption } from '../../core/components/dropdown.component';
import { InventarioState } from '../../core/state/inventario.state';
import { ApiReportesService } from '../../core/api/api-reportes.service';

interface ProductoCatalogo {
  id: number;
  nombre: string;
  precioVentaSugerido: number;
  codigoBarra: string | null;
  stockActual: number;
  marca: string | null;
  categoria: string | null;
  imagenDataUrl: string | null;
}

@Component({
  selector: 'app-catalogo',
  standalone: true,
  templateUrl: './catalogo.component.html',
  imports: [CommonModule, FormsModule, DropdownComponent],
})
export class CatalogoComponent implements OnInit {
  private readonly state = inject(InventarioState);
  protected readonly marcas = this.state.marcas;
  protected readonly categorias = this.state.categorias;
  private readonly apiReportes = inject(ApiReportesService);

  protected readonly productos = signal<ProductoCatalogo[]>([]);
  protected readonly cargando = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  // Computeds de opciones para el selector app-dropdown
  protected readonly opcionesMarcas = computed<DropdownOption[]>(() => [
    { value: null, label: 'Todas las marcas' },
    ...this.marcas().map((m) => ({ value: m.id, label: m.nombre })),
  ]);

  protected readonly opcionesCategorias = computed<DropdownOption[]>(() => [
    { value: null, label: 'Todas las categorías' },
    ...this.categorias().map((c) => ({ value: c.id, label: c.nombre })),
  ]);

  // Filtros opcionales que se envian al backend al generar el PDF / Excel
  protected marcaFiltro: number | null = null;
  protected categoriaFiltro: number | null = null;

  protected readonly agrupadoPorCategoria = computed<{ categoria: string; items: ProductoCatalogo[] }[]>(() => {
    const grupos = new Map<string, ProductoCatalogo[]>();
    for (const p of this.productos()) {
      const key = p.categoria ?? 'Sin categoría';
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(p);
    }
    return Array.from(grupos.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([categoria, items]) => ({ categoria, items }));
  });

  async ngOnInit(): Promise<void> {
    await this.state.cargarCatalogos();
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      if (this.state.marcas().length === 0 || this.state.categorias().length === 0) {
        await this.state.cargarCatalogos();
      }
      if (this.state.productos().length === 0) {
        await this.state.cargarProductos();
      }
      let data: ProductoCatalogo[] = this.state.productos().map((p) => {
        const marcaNom = p.marcaId ? this.marcaNombre(p.marcaId) : null;
        const catNom = p.categoriaId ? this.categoriaNombre(p.categoriaId) : null;
        return {
          id: p.id,
          nombre: p.nombre,
          precioVentaSugerido: p.precioVentaSugerido,
          codigoBarra: p.codigoBarra,
          stockActual: p.stockActual,
          marca: marcaNom || null,
          categoria: catNom || null,
          imagenDataUrl: p.imagenDataUrl ?? null,
        };
      });
      if (this.marcaFiltro) {
        data = data.filter((p) => p.marca === this.marcaNombre(this.marcaFiltro!));
      }
      if (this.categoriaFiltro) {
        data = data.filter((p) => p.categoria === this.categoriaNombre(this.categoriaFiltro!));
      }
      data.sort((a, b) => {
        const ma = (a.marca ?? '').localeCompare(b.marca ?? '');
        if (ma !== 0) return ma;
        return a.nombre.localeCompare(b.nombre);
      });
      this.productos.set(data);
    } catch {
      this.error.set('No se pudieron cargar los productos para el catálogo.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected marcaNombre(id: number): string {
    return this.state.marcas().find((m) => m.id === id)?.nombre ?? '';
  }

  protected categoriaNombre(id: number): string {
    return this.state.categorias().find((c) => c.id === id)?.nombre ?? '';
  }

  protected formatearPrecio(precio: number): string {
    return `S/. ${precio.toFixed(2)}`;
  }

  protected readonly descargandoPdfCategoria = signal<boolean>(false);
  protected readonly descargandoPdfMarca = signal<boolean>(false);
  protected readonly descargandoExcel = signal<boolean>(false);

  protected descargarPdf(agrupacion: 'categoria' | 'marca' = 'categoria'): void {
    const isCat = agrupacion === 'categoria';
    const loader = isCat ? this.descargandoPdfCategoria : this.descargandoPdfMarca;

    if (this.descargandoPdfCategoria() || this.descargandoPdfMarca()) return;
    loader.set(true);
    this.error.set(null);

    this.apiReportes.descargarCatalogoPdf(this.marcaFiltro, this.categoriaFiltro, agrupacion)
      .subscribe({
        next: (blob) => {
          if (blob.type && !blob.type.includes('pdf') && blob.size < 2048) {
            const reader = new FileReader();
            reader.onload = () => {
              this.error.set('El backend no devolvió un PDF. Revisa los logs del servidor.');
              loader.set(false);
            };
            reader.readAsText(blob);
            return;
          }

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // NOTE: do NOT use a JS bracket character class with letters here —
          // Tailwind's content scanner reads regex literals and treats any
          // bracketed sequence as a candidate utility class, generating
          // invalid CSS. The alternation form below is semantically
          // identical but escapes the scanner's pattern.
          const ts = new Date().toISOString().slice(0, 16).replace(/-|:|T/g, '');
          a.download = `catalogo-${agrupacion}-stockmaster-${ts}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          loader.set(false);
        },
        error: (e: unknown) => {
          loader.set(false);
          this.error.set(
            typeof e === 'object' && e && 'message' in e
              ? `Error al generar PDF: ${(e as { message: string }).message}`
              : 'Error al generar PDF.'
          );
        },
      });
  }

  protected async descargarExcelCliente(): Promise<void> {
    if (this.descargandoExcel()) return;
    this.descargandoExcel.set(true);
    try {
      const prods = this.productos();

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Catálogo de Productos');

      sheet.columns = [
        { width: 38 }, // A: NOMBRE
        { width: 22 }, // B: MARCA
        { width: 22 }, // C: CATEGORÍA
        { width: 18 }, // D: PRECIO
        { width: 18 }, // E: ESTADO
      ];

      const hoyTexto = new Date().toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      // Banner Principal
      sheet.mergeCells('A1:E1');
      const r1 = sheet.getCell('A1');
      r1.value = 'CATÁLOGO OFICIAL DE PRODUCTOS – CHESLO';
      r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B3DF5' } };
      r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      r1.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 30;

      sheet.mergeCells('A2:E2');
      const r2 = sheet.getCell('A2');
      let marcaNombre = 'Todas';
      if (this.marcaFiltro) {
        marcaNombre = this.marcaNombre(this.marcaFiltro);
      }
      let catNombre = 'Todas';
      if (this.categoriaFiltro) {
        catNombre = this.categoriaNombre(this.categoriaFiltro);
      }
      r2.value = `Marca: ${marcaNombre} | Categoría: ${catNombre} | Fecha de emisión: ${hoyTexto}`;
      r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
      r2.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFFFFFFF' } };
      r2.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(2).height = 20;

      // Encabezados exactos: NOMBRE, MARCA, CATEGORÍA, PRECIO, ESTADO
      const headers = ['NOMBRE', 'MARCA', 'CATEGORÍA', 'PRECIO', 'ESTADO'];
      const headerRow = sheet.getRow(3);
      headerRow.height = 24;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = {
          horizontal: idx === 3 ? 'right' : idx === 4 ? 'center' : 'left',
          vertical: 'middle',
        };
      });

      sheet.autoFilter = 'A3:E3';

      let rowIdx = 4;
      let count = 1;
      for (const p of prods) {
        const r = sheet.getRow(rowIdx);
        r.height = 20;

        const hayStock = p.stockActual > 0;
        const rowBgColor = count % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';

        const c1 = r.getCell(1);
        c1.value = p.nombre;
        c1.font = { name: 'Calibri', size: 10, bold: true };
        c1.alignment = { horizontal: 'left', vertical: 'middle' };

        const c2 = r.getCell(2);
        c2.value = p.marca || '— Sin Marca —';
        c2.alignment = { horizontal: 'left', vertical: 'middle' };

        const c3 = r.getCell(3);
        c3.value = p.categoria || '— Sin Categoría —';
        c3.alignment = { horizontal: 'left', vertical: 'middle' };

        const c4 = r.getCell(4);
        c4.value = p.precioVentaSugerido;
        c4.numFmt = '"S/" #,##0.00';
        c4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0070C0' } };
        c4.alignment = { horizontal: 'right', vertical: 'middle' };

        const c5 = r.getCell(5);
        c5.value = hayStock ? 'DISPONIBLE' : 'SIN STOCK';
        c5.font = { name: 'Calibri', size: 9, bold: true, color: { argb: hayStock ? 'FF276A3C' : 'FFC00000' } };
        c5.alignment = { horizontal: 'center', vertical: 'middle' };

        for (let col = 1; col <= 5; col++) {
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
        count++;
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
      this.descargandoExcel.set(false);
    }
  }

  protected onFiltroChange(): void {
    this.cargar();
  }
}