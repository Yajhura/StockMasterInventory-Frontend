import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PaginadorComponent } from './paginador.component';

/**
 * Componente para celdas de encabezado <th>
 */
@Component({
  selector: 'th[app-th], app-th',
  standalone: true,
  template: '<ng-content></ng-content>',
  host: {
    '[class]': 'hostClasses',
  },
})
export class TablaThComponent {
  @Input() align: 'left' | 'center' | 'right' = 'left';
  @Input() extraClass = '';

  get hostClasses(): string {
    const base = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 bg-blue-50';
    const alignClass = this.align === 'right' ? 'text-right' : this.align === 'center' ? 'text-center' : 'text-left';
    return `${base} ${alignClass} ${this.extraClass}`.trim();
  }
}

/**
 * Componente para filas de tabla <tr>
 */
@Component({
  selector: 'tr[app-tr], app-tr',
  standalone: true,
  template: '<ng-content></ng-content>',
  host: {
    '[class]': 'hostClasses',
  },
})
export class TablaTrComponent {
  @Input() hoverable = true;
  @Input() clickable = false;
  @Input() extraClass = '';

  get hostClasses(): string {
    const base = 'border-t border-slate-100 transition-colors duration-150';
    const hover = this.hoverable ? 'hover:bg-slate-50/70' : '';
    const cursor = this.clickable ? 'cursor-pointer' : '';
    return `${base} ${hover} ${cursor} ${this.extraClass}`.trim();
  }
}

/**
 * Componente para celdas de datos <td>
 */
@Component({
  selector: 'td[app-td], app-td',
  standalone: true,
  template: '<ng-content></ng-content>',
  host: {
    '[class]': 'hostClasses',
  },
})
export class TablaTdComponent {
  @Input() align: 'left' | 'center' | 'right' = 'left';
  @Input() extraClass = '';

  get hostClasses(): string {
    const base = 'px-3 py-3.5';
    const alignClass = this.align === 'right' ? 'text-right' : this.align === 'center' ? 'text-center' : 'text-left';
    return `${base} ${alignClass} ${this.extraClass}`.trim();
  }
}

/**
 * Componente Contenedor Principal de la Tabla
 */
@Component({
  selector: 'app-tabla',
  standalone: true,
  imports: [CommonModule, PaginadorComponent],
  host: {
    class: 'block',
  },
  template: `
    <div class="surface-card flex flex-col justify-between overflow-hidden">
      <!-- Header opcional del contenedor de tabla -->
      @if (titulo || subtitulo) {
        <header class="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
          <div>
            @if (titulo) {
              <h3 class="text-[15px] font-semibold text-slate-900">{{ titulo }}</h3>
            }
            @if (subtitulo) {
              <p class="text-[11px] text-slate-500 mt-0.5 tabular-nums">{{ subtitulo }}</p>
            }
          </div>
          <ng-content select="[header-actions]"></ng-content>
        </header>
      }

      <!-- Contenedor con Scroll Horizontal y Vertical Condicional -->
      <div
        class="overflow-x-auto scrollbar-thin flex-1 transition-opacity duration-200"
        [class.opacity-60]="cargando"
        [class.overflow-y-auto]="esScrollActivo"
        [style.maxHeight]="esScrollActivo ? maxScrollHeight : null"
      >
        <table class="w-full text-left border-collapse min-w-full">
          <thead class="sticky top-0 z-10 bg-blue-50 shadow-sm">
            <ng-content select="[table-header], thead"></ng-content>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <ng-content select="[table-body], tbody"></ng-content>
          </tbody>
        </table>

        <!-- Estado Vacío -->
        @if (isEmpty && !cargando) {
          <div class="flex flex-col items-center gap-2 px-4 py-12 text-slate-500">
            <svg class="w-10 h-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 7 12 3 4 7m16 0v10l-8 4-8-4V7m16 0-8 4m0 0L4 7m8 4v10"/>
            </svg>
            <p class="text-sm">{{ mensajeVacio }}</p>
          </div>
        }
      </div>

      <!-- Footer Paginador Reutilizable -->
      @if (modo === 'paginado' && totalPages > 1) {
        <app-paginador
          [page]="page"
          [totalPages]="totalPages"
          [totalItems]="totalItems"
          [pageSize]="pageSize"
          [cargando]="cargando"
          (pageChange)="pageChange.emit($event)"
        />
      }
    </div>
  `,
})
export class TablaComponent {
  /** 'paginado' | 'scroll' */
  @Input() modo: 'paginado' | 'scroll' = 'paginado';

  /** Cantidad de filas a partir de la cual se activa el scroll vertical en modo 'scroll'. Por defecto: 10 */
  @Input() limiteScroll = 10;

  /** Altura máxima para el scroll vertical (ej. '480px', '500px', '60vh') */
  @Input() maxScrollHeight = '480px';

  /** Total de ítems o filas actuales en la lista */
  @Input() itemsCount = 0;

  /** Estado de carga */
  @Input() cargando = false;

  /** Indica si la tabla no tiene filas */
  @Input() isEmpty = false;

  /** Mensaje si la tabla está vacía */
  @Input() mensajeVacio = 'No se encontraron registros.';

  /** Título opcional de la cabecera */
  @Input() titulo?: string;

  /** Subtítulo opcional de la cabecera */
  @Input() subtitulo?: string;

  /** Inputs de Paginación */
  @Input() page = 1;
  @Input() totalPages = 1;
  @Input() totalItems = 0;
  @Input() pageSize = 10;

  /** Output al cambiar de página */
  @Output() pageChange = new EventEmitter<number>();

  /** Evalúa si debe activarse el scroll vertical según la propiedad modo y el límite de filas */
  get esScrollActivo(): boolean {
    if (this.modo !== 'scroll') return false;
    return this.itemsCount > this.limiteScroll;
  }
}

export const TABLA_COMPONENTS = [
  TablaComponent,
  TablaThComponent,
  TablaTrComponent,
  TablaTdComponent,
] as const;
