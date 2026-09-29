import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Input numérico especializado para montos en moneda (S/, $, €/etc.).
 *
 * DIFERENCIAS vs `<input type="number">` de HTML5 que importan para UX:
 *
 *  1. PAD VISUAL: el navegador strippea ceros a la derecha (el valor
 *     25 se renderiza como "25", no "25.00"). Este componente formatea
 *     a exactamente 2 decimales en `blur` — el operador ve "25.00"
 *     consistente con el resto de la UI (`| number:'1.2-2'`).
 *
 *  2. NO-INTERRUPCIÓN: bindear `[value]` al string formateado causaría
 *     que el binding se re-evalúe en cada `valueChanges` (que dispara
 *     `totalVenta` o equivalente) y pise lo que el operador está
 *     tipeando, reseteando el cursor. Este componente trackea el raw
 *     string en un signal interno mientras tipea y sólo alinea al
 *     formateado cuando el operador pierde foco.
 *
 *  3. CLAMP ≥ 0: clamp defensivo a 0 mínimo en el parser (no se
 *     permite precio negativo). La validación de "precio > 0"
 *     (estricto) queda en el componente padre al confirmar la
 *     operación — este input acepta 0 transitorio para permitir
 *     borrar y retipear.
 *
 * Implementa `ControlValueAccessor` para integrarse directo con
 * Reactive Forms (`formControlName` / `[(ngModel)]`). El valor
 * numérico que se publica al form es `number` redondeado a 2
 * decimales (`Math.round(n * 100) / 100`).
 */
@Component({
  selector: 'app-input-moneda',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative" [class]="containerClass()">
      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" [class]="prefixClass()">
        {{ prefix() }}
      </span>
      <input
        type="text"
        inputmode="decimal"
        pattern="[0-9]+(\.[0-9]{0,2})?"
        [maxLength]="maxlength()"
        [value]="displayValue()"
        [disabled]="disabled()"
        [placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel()"
        (input)="handleInput($any($event.target).value)"
        (blur)="handleBlur()"
        [class]="inputClasses()" />
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputMonedaComponent),
      multi: true
    }
  ]
})
export class InputMonedaComponent implements ControlValueAccessor {
  /** Prefijo visual (default "S/"). Se renderiza como span absoluto a la izquierda. */
  readonly prefix = input<string>('S/');

  /** Clases CSS del span del prefijo. */
  readonly prefixClass = input<string>('text-slate-400 text-[11px] font-bold');

  /** Placeholder cuando el input está vacío. */
  readonly placeholder = input<string>('0.00');

  /** Clases adicionales del contenedor `<div class="relative">`. */
  readonly containerClass = input<string>('');

  /** Clases adicionales del `<input>` (tamaño, padding, alineación de texto). */
  readonly inputClass = input<string>('');

  /** Aria label para accesibilidad (default "Monto"). */
  readonly ariaLabel = input<string>('Monto');

  /** Máximo de caracteres permitidos (default 15 — cubre cualquier precio realista). */
  readonly maxlength = input<number>(15);

  protected readonly disabled = signal<boolean>(false);

  /** Raw string tipeado por el operador. Vacío = usar el formateado
   *  canónico (al init y después de blur). */
  private readonly _rawValue = signal<string>('');

  /** Valor numérico canónico (redondeado a 2 decimales, clamp ≥ 0). */
  private readonly _value = signal<number>(0);

  /** Combina clases base (border, focus, hover, disabled) con las que
   *  pasa el consumidor vía `inputClass`. */
  protected readonly inputClasses = computed(() =>
    'border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-blue-50/50 tabular-nums hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed '
    + this.inputClass()
  );

  /** Lo que el `<input>` muestra: raw mientras tipea, formateado el resto. */
  protected readonly displayValue = computed<string>(() => {
    const raw = this._rawValue();
    return raw !== '' ? raw : this.formatValue(this._value());
  });

  // --- ControlValueAccessor ---
  private _onChange: (val: number) => void = () => { /* noop */ };
  private _onTouched: () => void = () => { /* noop */ };

  writeValue(val: unknown): void {
    const num = this.parseValue(String(val ?? ''));
    this._value.set(num);
    // Reset raw para que el display caiga al formateado del nuevo valor.
    this._rawValue.set('');
  }

  registerOnChange(fn: (val: number) => void): void {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // --- Handlers del DOM ---
  protected handleInput(raw: string): void {
    this._rawValue.set(raw);
    const num = this.parseValue(raw);
    this._value.set(num);
    this._onChange(num);
  }

  protected handleBlur(): void {
    // Pad visual: el raw pasa a la versión formateada a 2 decimales.
    this._rawValue.set(this.formatValue(this._value()));
    this._onTouched();
  }

  // --- Helpers ---
  private formatValue(num: number): string {
    if (!Number.isFinite(num) || num < 0) return '0.00';
    return this.round2(num).toFixed(2);
  }

  private parseValue(raw: string): number {
    const cleaned = (raw ?? '').trim();
    if (cleaned === '') return 0;
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return 0;
    return this.round2(Math.max(0, num));
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}