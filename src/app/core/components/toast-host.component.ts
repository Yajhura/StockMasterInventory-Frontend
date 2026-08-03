import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      @for (t of notify.toasts(); track t.id) {
        <div
          class="pointer-events-auto anim-fade-in-up rounded-xl border shadow-softer px-4 py-3 flex items-start gap-3"
          [class.bg-white]="t.tipo === 'info'"
          [class.border-slate-200]="t.tipo === 'info'"
          [class.bg-emerald-50]="t.tipo === 'success'"
          [class.border-emerald-200]="t.tipo === 'success'"
          [class.bg-rose-50]="t.tipo === 'error'"
          [class.border-rose-200]="t.tipo === 'error'"
          [class.bg-amber-50]="t.tipo === 'warning'"
          [class.border-amber-200]="t.tipo === 'warning'"
        >
          <span
            class="grid place-items-center w-7 h-7 rounded-lg flex-shrink-0"
            [class.text-emerald-600]="t.tipo === 'success'"
            [class.text-rose-600]="t.tipo === 'error'"
            [class.text-amber-600]="t.tipo === 'warning'"
            [class.text-slate-600]="t.tipo === 'info'"
          >
            @switch (t.tipo) {
              @case ('success') {
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              }
              @case ('error') {
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              }
              @case ('warning') {
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
              }
              @default {
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              }
            }
          </span>

          <p
            class="flex-1 text-sm leading-relaxed"
            [class.text-emerald-900]="t.tipo === 'success'"
            [class.text-rose-900]="t.tipo === 'error'"
            [class.text-amber-900]="t.tipo === 'warning'"
            [class.text-slate-700]="t.tipo === 'info'"
          >
            {{ t.mensaje }}
          </p>

          <button
            type="button"
            class="text-slate-400 hover:text-slate-700 transition-colors"
            (click)="notify.dismiss(t.id)"
            aria-label="Cerrar"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly notify = inject(NotificationService);
}
