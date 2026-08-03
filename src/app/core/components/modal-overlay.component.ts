import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Componente genérico de modal que maneja el backdrop y el contenedor.
 * Uso:
 *   <app-modal-overlay [open]="isOpen()" (close)="onClose()">
 *     <p>Contenido del modal</p>
 *   </app-modal-overlay>
 */
@Component({
  selector: 'app-modal-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open()) {
      <!-- Backdrop: cubre toda la ventana del navegador -->
      <div
        class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60]"
        (click)="onBackdropClick()"
        aria-hidden="true">
      </div>
      <!-- Modal: centrado sobre el backdrop -->
      <div
        class="fixed inset-0 flex items-center justify-center p-4 z-[70]"
        role="dialog"
        [attr.aria-modal]="open()"
        [attr.aria-labelledby]="ariaLabelledby() ? null : null">
        <div
          class="relative surface-card rounded-xl shadow-2xl anim-fade-in-up flex flex-col"
          [class]="containerClass()"
          (click)="$event.stopPropagation()">
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class ModalOverlayComponent {
  /** Signal que controla si el modal está abierto */
  readonly open = input.required<boolean>();

  /** Clase CSS adicional para el contenedor del modal */
  readonly containerClass = input<string>('w-full max-w-3xl max-h-[90vh] overflow-hidden');

  /** ID del elemento con la etiqueta del modal (accesibilidad) */
  readonly ariaLabelledby = input<string | null>(null);

  /** Evento emitido cuando se cierra el modal */
  readonly close = output<void>();

  protected readonly ariaLabel = computed(() => 'Modal');

  protected onBackdropClick(): void {
    this.close.emit();
  }
}
