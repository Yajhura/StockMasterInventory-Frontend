import { Component, ChangeDetectionStrategy, Input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <div
        class="fixed inset-0 z-[60] grid place-items-center p-4 anim-fade-in-up"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'confirm-title-' + id"
      >
        <div
          class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          (click)="cancelar.emit()"
          aria-hidden="true"
        ></div>

        <div class="relative w-full max-w-md surface-card overflow-hidden">
          <div class="px-6 pt-6 pb-2 flex items-start gap-4">
            <span
              class="grid place-items-center w-11 h-11 rounded-full flex-shrink-0"
              [class.bg-rose-50]="variant === 'danger'"
              [class.text-rose-600]="variant === 'danger'"
              [class.bg-blue-50]="variant !== 'danger'"
              [class.text-blue-600]="variant !== 'danger'"
            >
              @if (variant === 'danger') {
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                  <path d="M12 9v4M12 17h.01"/>
                </svg>
              } @else {
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
              }
            </span>

            <div class="flex-1">
              <h3 [id]="'confirm-title-' + id" class="text-base font-bold text-slate-900">{{ titulo }}</h3>
              <p class="mt-1.5 text-sm text-slate-500 leading-relaxed">{{ mensaje }}</p>
            </div>
          </div>

          <div class="px-6 py-4 mt-2 flex items-center justify-end gap-2.5 bg-slate-50/50 border-t border-slate-100">
            <button
              type="button"
              class="btn-secondary"
              (click)="cancelar.emit()"
              [disabled]="cargando"
            >
              {{ textoCancelar }}
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              [class]="variant === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/30' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/30'"
              (click)="confirmar.emit()"
              [disabled]="cargando"
            >
              @if (cargando) {
                <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
              }
              {{ textoConfirmar }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  @Input() visible = false;
  @Input() titulo: string = 'Confirmar';
  @Input() mensaje: string = 'Estas seguro?';
  @Input() textoConfirmar: string = 'Confirmar';
  @Input() textoCancelar: string = 'Cancelar';
  @Input() variant: 'danger' | 'info' = 'danger';
  @Input() cargando: boolean = false;

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();

  protected readonly id = Math.random().toString(36).slice(2, 9);
}
