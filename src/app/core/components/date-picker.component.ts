import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  forwardRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * DatePickerComponent: Componente de fecha altamente accesible y moderno.
 * - Soporta ngModel y ReactiveForms (ControlValueAccessor).
 * - Formato visual accesible (DD/MM/YYYY en español).
 * - Accesos rápidos (Presets: Hoy, Últimos 7 días, Este mes, Limpiar).
 * - Control por teclado, indicador visual de foco, botón de limpieza.
 */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative w-full" #host>
      <!-- Input Principal / Disparador accesible -->
      <div class="relative flex items-center">
        <input
          #nativeInput
          type="date"
          class="sr-only"
          [value]="_value()"
          [disabled]="disabled()"
          (change)="onNativeChange($any($event.target).value)"
        />

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
          [attr.aria-label]="placeholder()"
          aria-haspopup="dialog"
        >
          <svg class="w-4 h-4 text-blue-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
            <line x1="16" x2="16" y1="2" y2="6"/>
            <line x1="8" x2="8" y1="2" y2="6"/>
            <line x1="3" x2="21" y1="10" y2="10"/>
          </svg>

          @if (fechaFormateada(); as f) {
            <span class="flex-1 min-w-0 truncate text-slate-900 font-medium tabular-nums">{{ f }}</span>
          } @else {
            <span class="flex-1 min-w-0 truncate text-slate-400">{{ placeholder() }}</span>
          }
        </button>

        @if (_value()) {
          <button
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            (click)="limpiar($event)"
            title="Limpiar fecha"
            aria-label="Limpiar fecha"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        }
      </div>

      <!-- Popover / Menú desplegable accesible -->
      @if (abierto()) {
        <div
          class="absolute z-50 mt-2 w-72 surface-card p-3 shadow-xl overflow-hidden flex flex-col gap-3 left-0 sm:left-auto"
          role="dialog"
          aria-label="Selector de fecha"
        >
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <span class="text-xs font-bold text-slate-700 uppercase tracking-wider">Seleccionar Fecha</span>
            <button
              type="button"
              class="text-xs font-semibold text-blue-600 hover:text-blue-700"
              (click)="abrirCalendarioNativo(nativeInput)"
            >
              Calendario Nativo
            </button>
          </div>

          <!-- Presets de fecha rápida -->
          <div class="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left cursor-pointer"
              (click)="seleccionarPreset('hoy')"
            >
              Hoy
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left cursor-pointer"
              (click)="seleccionarPreset('ayer')"
            >
              Ayer
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left cursor-pointer"
              (click)="seleccionarPreset('7dias')"
            >
              Hace 7 días
            </button>
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left cursor-pointer"
              (click)="seleccionarPreset('esteMes')"
            >
              Inicio de Mes
            </button>
          </div>

          <!-- Selector de fecha directa -->
          <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <input
              type="date"
              class="input-base h-9 text-xs flex-1"
              [value]="_value()"
              (change)="onNativeChange($any($event.target).value)"
            />
            <button
              type="button"
              class="h-9 px-3 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              (click)="cerrar()"
            >
              Aceptar
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DatePickerComponent implements ControlValueAccessor {
  /** Texto cuando no hay fecha seleccionada. */
  readonly placeholder = input<string>('Seleccionar fecha...');

  /** Emite cuando cambia la fecha (retorna YYYY-MM-DD o vacio). */
  readonly dateChange = output<string>();

  protected readonly abierto = signal<boolean>(false);
  protected readonly disabled = signal<boolean>(false);
  protected readonly _value = signal<string>('');

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly fechaFormateada = computed<string | null>(() => {
    const val = this._value();
    if (!val) return null;
    const parts = val.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${dd}/${mm}/${yyyy}`;
    }
    return val;
  });

  protected toggle(): void {
    if (this.disabled()) return;
    this.abierto.update((v) => !v);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected limpiar(event?: Event): void {
    if (event) event.stopPropagation();
    this.setValue('');
    this.cerrar();
  }

  protected abrirCalendarioNativo(inputEl: HTMLInputElement): void {
    if (inputEl.showPicker) {
      try {
        inputEl.showPicker();
      } catch {
        inputEl.focus();
      }
    } else {
      inputEl.focus();
    }
  }

  protected onNativeChange(val: string): void {
    this.setValue(val);
  }

  protected seleccionarPreset(tipo: 'hoy' | 'ayer' | '7dias' | 'esteMes'): void {
    const hoy = new Date();
    let fechaTarget = new Date();

    if (tipo === 'hoy') {
      fechaTarget = hoy;
    } else if (tipo === 'ayer') {
      fechaTarget.setDate(hoy.getDate() - 1);
    } else if (tipo === '7dias') {
      fechaTarget.setDate(hoy.getDate() - 7);
    } else if (tipo === 'esteMes') {
      fechaTarget = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    }

    const yyyy = fechaTarget.getFullYear();
    const mm = String(fechaTarget.getMonth() + 1).padStart(2, '0');
    const dd = String(fechaTarget.getDate()).padStart(2, '0');
    this.setValue(`${yyyy}-${mm}-${dd}`);
    this.cerrar();
  }

  private setValue(val: string): void {
    this._value.set(val);
    this.onChange(val);
    this.onTouched();
    this.dateChange.emit(val);
  }

  // ---------- ControlValueAccessor ----------

  writeValue(value: string | null): void {
    this._value.set(value ?? '');
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
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
