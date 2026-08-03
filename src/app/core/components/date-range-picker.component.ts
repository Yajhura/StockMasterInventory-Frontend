import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DateRange {
  desde: string;
  hasta: string;
}

/**
 * DateRangePickerComponent: Componente intuitivo y unificado de Rango de Fechas.
 * - Permite seleccionar fecha inicial (Desde) y final (Hasta) en una sola interfaz.
 * - Presets de 1-click (Hoy, Ayer, Últimos 7 días, Últimos 30 días, Este mes, Mes anterior).
 * - Muestra la etiqueta limpia "DD/MM/YYYY - DD/MM/YYYY" con botón rápido de limpiar.
 * - Sincroniza bidireccionalmente con [(desde)] y [(hasta)].
 */
@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative w-full" #host>
      <!-- Botón Disparador del Popover -->
      <button
        type="button"
        class="input-base w-full h-10 pr-9 text-left flex items-center gap-2.5 transition-all text-sm font-medium cursor-pointer"
        [class.opacity-60]="disabled()"
        [class.cursor-not-allowed]="disabled()"
        [class.ring-2]="abierto()"
        [class.ring-blue-600]="abierto()"
        [class.border-blue-600]="abierto()"
        (click)="toggle()"
        [disabled]="disabled()"
        [attr.aria-expanded]="abierto()"
        aria-haspopup="dialog"
      >
        <svg class="w-4 h-4 text-blue-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
          <line x1="16" x2="16" y1="2" y2="6"/>
          <line x1="8" x2="8" y1="2" y2="6"/>
          <line x1="3" x2="21" y1="10" y2="10"/>
        </svg>

        @if (rangoTexto(); as txt) {
          <span class="flex-1 min-w-0 truncate text-slate-900 font-medium tabular-nums">{{ txt }}</span>
        } @else {
          <span class="flex-1 min-w-0 truncate text-slate-400">{{ placeholder() }}</span>
        }
      </button>

      @if (tieneRango()) {
        <button
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          (click)="limpiarRango($event)"
          title="Limpiar rango de fechas"
          aria-label="Limpiar rango de fechas"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      }

      <!-- Popover desplegable de Rango de Fechas -->
      @if (abierto()) {
        <div
          class="absolute z-50 mt-2 w-80 sm:w-96 surface-card p-4 shadow-xl overflow-hidden flex flex-col gap-3 left-0 sm:left-auto"
          role="dialog"
          aria-label="Selector de rango de fechas"
        >
          <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/></svg>
              Seleccionar Rango de Fechas
            </span>
            @if (tieneRango()) {
              <button
                type="button"
                class="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                (click)="limpiarRango()"
              >
                Limpiar
              </button>
            }
          </div>

          <!-- Botones de Presets Rápidos -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center cursor-pointer"
              (click)="seleccionarPreset('hoy')"
            >
              Hoy
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center cursor-pointer"
              (click)="seleccionarPreset('ayer')"
            >
              Ayer
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center cursor-pointer"
              (click)="seleccionarPreset('7dias')"
            >
              Últimos 7 días
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center cursor-pointer"
              (click)="seleccionarPreset('30dias')"
            >
              Últimos 30 días
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center cursor-pointer"
              (click)="seleccionarPreset('esteMes')"
            >
              Este Mes
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center cursor-pointer"
              (click)="seleccionarPreset('mesAnterior')"
            >
              Mes Anterior
            </button>
          </div>

          <!-- Campos Personalizados Desde / Hasta -->
          <div class="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Desde</label>
              <input
                type="date"
                class="input-base h-9 text-xs w-full"
                [ngModel]="desde()"
                (ngModelChange)="onDesdeChange($event)"
              />
            </div>
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Hasta</label>
              <input
                type="date"
                class="input-base h-9 text-xs w-full"
                [ngModel]="hasta()"
                (ngModelChange)="onHastaChange($event)"
              />
            </div>
          </div>

          <!-- Botón de aplicar -->
          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              class="h-8 px-4 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-sm"
              (click)="aplicar()"
            >
              Aplicar Rango
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DateRangePickerComponent {
  /** Valor fecha desde (YYYY-MM-DD). */
  readonly desde = input<string>('');
  /** Valor fecha hasta (YYYY-MM-DD). */
  readonly hasta = input<string>('');
  /** Placeholder cuando no hay rango. */
  readonly placeholder = input<string>('Filtrar por rango de fechas...');
  /** Estado deshabilitado. */
  readonly disabled = input<boolean>(false);

  /** Emite cuando cambia la fecha desde. */
  readonly desdeChange = output<string>();
  /** Emite cuando cambia la fecha hasta. */
  readonly hastaChange = output<string>();
  /** Emite el objeto con el rango completo. */
  readonly rangeChange = output<DateRange>();

  protected readonly abierto = signal<boolean>(false);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly tieneRango = computed<boolean>(() => {
    return !!(this.desde() || this.hasta());
  });

  protected readonly rangoTexto = computed<string | null>(() => {
    const d = this.fmt(this.desde());
    const h = this.fmt(this.hasta());
    if (d && h) return `${d} – ${h}`;
    if (d) return `Desde ${d}`;
    if (h) return `Hasta ${h}`;
    return null;
  });

  private fmt(val: string): string | null {
    if (!val) return null;
    const parts = val.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return val;
  }

  protected toggle(): void {
    if (this.disabled()) return;
    this.abierto.update((v) => !v);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected onDesdeChange(val: string): void {
    this.desdeChange.emit(val);
  }

  protected onHastaChange(val: string): void {
    this.hastaChange.emit(val);
  }

  protected aplicar(): void {
    this.rangeChange.emit({ desde: this.desde(), hasta: this.hasta() });
    this.cerrar();
  }

  protected limpiarRango(event?: Event): void {
    if (event) event.stopPropagation();
    this.desdeChange.emit('');
    this.hastaChange.emit('');
    this.rangeChange.emit({ desde: '', hasta: '' });
    this.cerrar();
  }

  protected seleccionarPreset(tipo: 'hoy' | 'ayer' | '7dias' | '30dias' | 'esteMes' | 'mesAnterior'): void {
    const hoy = new Date();
    let dStr = '';
    let hStr = '';

    const fmtISO = (dt: Date) => {
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (tipo === 'hoy') {
      dStr = fmtISO(hoy);
      hStr = fmtISO(hoy);
    } else if (tipo === 'ayer') {
      const ayer = new Date();
      ayer.setDate(hoy.getDate() - 1);
      dStr = fmtISO(ayer);
      hStr = fmtISO(ayer);
    } else if (tipo === '7dias') {
      const hace7 = new Date();
      hace7.setDate(hoy.getDate() - 7);
      dStr = fmtISO(hace7);
      hStr = fmtISO(hoy);
    } else if (tipo === '30dias') {
      const hace30 = new Date();
      hace30.setDate(hoy.getDate() - 30);
      dStr = fmtISO(hace30);
      hStr = fmtISO(hoy);
    } else if (tipo === 'esteMes') {
      const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      dStr = fmtISO(ini);
      hStr = fmtISO(hoy);
    } else if (tipo === 'mesAnterior') {
      const iniPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const finPrev = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      dStr = fmtISO(iniPrev);
      hStr = fmtISO(finPrev);
    }

    this.desdeChange.emit(dStr);
    this.hastaChange.emit(hStr);
    this.rangeChange.emit({ desde: dStr, hasta: hStr });
    this.cerrar();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.abierto()) return;
    const target = event.target as Node;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.cerrar();
    }
  }
}
