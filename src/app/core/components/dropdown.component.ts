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

export interface DropdownOption<T = unknown> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeClass?: string;
  disabled?: boolean;
}

/**
 * Dropdown custom con busqueda. Reemplaza al <select> nativo para
 * que tenga el mismo look que el resto de la UI (rounded-lg, sombra,
 * hover, focus ring).
 *
 * Soporta ngModel/FormControl (implementa ControlValueAccessor) y se
 * integra con reactive forms: formControlName="...".
 *
 * @example
 *   <app-dropdown
 *     formControlName="productoId"
 *     [options]="opciones()"
 *     placeholder="— Seleccionar —"
 *     [searchable]="true"
 *   />
 */
@Component({
  selector: 'app-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative" #host>
      <button
        type="button"
        class="input-base w-full h-11 pr-10 text-left flex items-center gap-2 transition-all"
        [class.opacity-60]="disabled()"
        [class.cursor-not-allowed]="disabled()"
        [class.ring-2]="abierto()"
        [class.ring-blue-600]="abierto()"
        [class.border-blue-600]="abierto()"
        (click)="toggle()"
        [disabled]="disabled()"
        [attr.aria-expanded]="abierto()"
        aria-haspopup="listbox"
      >
        @if (selectedOption(); as opt) {
          <span class="flex-1 min-w-0 truncate text-slate-900">{{ opt.label }}</span>
          @if (opt.badge) {
            <span
              class="inline-flex items-center px-1.5 h-5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
              [ngClass]="opt.badgeClass ?? 'bg-slate-100 text-slate-600'"
            >{{ opt.badge }}</span>
          }
        } @else {
          <span class="flex-1 min-w-0 truncate text-slate-400">{{ placeholder() }}</span>
        }
        <svg
          class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform"
          [class.rotate-180]="abierto()"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
        ><path d="m6 9 6 6 6-6"/></svg>
      </button>

      @if (abierto()) {
        <div
          class="absolute z-50 mt-2 w-full max-h-72 surface-card p-1 shadow-xl overflow-hidden flex flex-col"
          role="listbox"
        >
          @if (showSearchInput()) {
            <div class="p-2 border-b border-slate-100">
              <div class="relative">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                <input
                  #searchInput
                  type="search"
                  class="input-base h-9 pl-8 text-sm"
                  placeholder="Buscar..."
                  [value]="query()"
                  (input)="onQueryChange($any($event.target).value)"
                  (keydown.escape)="cerrar()"
                  (keydown.enter)="seleccionarHighlighted()"
                />
              </div>
            </div>
          }

          <div class="flex-1 overflow-y-auto scrollbar-thin max-h-60">
            @if (filteredOptions().length === 0) {
              <p class="px-3 py-6 text-center text-sm text-slate-500">Sin resultados.</p>
            } @else {
              @for (opt of filteredOptions(); track opt.value; let i = $index) {
                <button
                  type="button"
                  role="option"
                  class="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  [class.bg-blue-50]="highlightedIndex() === i"
                  [class.text-blue-700]="highlightedIndex() === i"
                  [class.font-semibold]="isSelected(opt)"
                  [disabled]="opt.disabled"
                  (click)="seleccionar(opt)"
                  (mouseenter)="highlightedIndex.set(i)"
                >
                  <span class="flex-1 min-w-0 truncate">{{ opt.label }}</span>
                  @if (opt.sublabel) {
                    <span class="text-[11px] text-slate-400 font-mono">{{ opt.sublabel }}</span>
                  }
                  @if (opt.badge) {
                    <span
                      class="inline-flex items-center px-1.5 h-5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                      [ngClass]="opt.badgeClass ?? 'bg-slate-100 text-slate-600'"
                    >{{ opt.badge }}</span>
                  }
                  @if (isSelected(opt)) {
                    <svg class="w-4 h-4 text-blue-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  }
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class DropdownComponent implements ControlValueAccessor {
  /** Opciones a mostrar. */
  readonly options = input.required<DropdownOption[]>();
  /** Texto cuando no hay seleccion. */
  readonly placeholder = input<string>('— Seleccionar —');
  /** Habilita el input de busqueda explícitamente o automáticamente si hay más de 6 elementos. */
  readonly searchable = input<boolean>(false);

  /** Emite cuando el usuario elige una opcion. */
  readonly selectionChange = output<unknown>();
  /** Emits the current search text so consumers can load remote options. */
  readonly searchChange = output<string>();

  protected readonly abierto = signal<boolean>(false);
  protected readonly query = signal<string>('');
  protected readonly highlightedIndex = signal<number>(0);
  protected readonly disabled = signal<boolean>(false);

  protected readonly showSearchInput = computed<boolean>(() => {
    return this.searchable() || this.options().length > 6;
  });

  protected readonly filteredOptions = computed<DropdownOption[]>(() => {
    const opts = this.options();
    const q = this.query().trim().toLowerCase();
    if (!q) return opts;
    return opts.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel?.toLowerCase().includes(q) ?? false)
    );
  });

  protected readonly selectedOption = computed<DropdownOption | null>(() => {
    const v = this._value();
    if (v == null) return null;
    return this.options().find((o) => o.value === v) ?? null;
  });

  /**
   * Valor actual del dropdown. Es un signal (no campo plano) para que
   * el computed `selectedOption` se reevalue y la UI se mantenga
   * sincronizada cuando el usuario selecciona una opcion o cuando
   * Angular Forms llama a writeValue() para setear el valor inicial.
   */
  private readonly _value = signal<unknown>(null);
  private onChange: (v: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected toggle(): void {
    if (this.disabled()) return;
    this.abierto.update((v) => !v);
    if (this.abierto()) {
      this.query.set('');
      this.highlightedIndex.set(0);
      // Enfocar el input de busqueda en el siguiente tick
      queueMicrotask(() => {
        const input = this.elementRef.nativeElement.querySelector('input[type="search"]');
        if (input) (input as HTMLInputElement).focus();
      });
    }
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.highlightedIndex.set(0);
    this.searchChange.emit(value);
  }

  protected seleccionar(opt: DropdownOption): void {
    if (opt.disabled) return;
    this._value.set(opt.value);
    this.onChange(opt.value);
    this.onTouched();
    this.selectionChange.emit(opt.value);
    this.cerrar();
  }

  protected seleccionarHighlighted(): void {
    const opts = this.filteredOptions();
    const i = this.highlightedIndex();
    if (opts[i]) this.seleccionar(opts[i]);
  }

  protected isSelected(opt: DropdownOption): boolean {
    return this._value() === opt.value;
  }

  // ---------- ControlValueAccessor ----------

  writeValue(value: unknown): void {
    this._value.set(value);
  }

  registerOnChange(fn: (v: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // ---------- Click afuera para cerrar ----------

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.abierto()) return;
    const target = event.target as Node;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.cerrar();
    }
  }
}
