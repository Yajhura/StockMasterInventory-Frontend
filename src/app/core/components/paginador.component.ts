import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-paginador',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (totalPages > 1) {
      <footer class="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/40 rounded-b-2xl">
        <div class="text-xs text-slate-500 font-medium tabular-nums">
          Página {{ page }} de {{ totalPages }} ({{ totalItems }} registros)
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
            [disabled]="page === 1 || cargando"
            (click)="pageChange.emit(page - 1)"
          >
            Anterior
          </button>

          <div class="flex items-center gap-1">
            @for (p of paginasVisibles; track $index) {
              @if (p === -1) {
                <span class="px-2 py-1 text-xs text-slate-400 select-none">...</span>
              } @else {
                <button
                  type="button"
                  class="w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  [class.bg-blue-600]="p === page"
                  [class.text-white]="p === page"
                  [class.shadow-sm]="p === page"
                  [class.text-slate-600]="p !== page"
                  [class.hover:bg-slate-100]="p !== page"
                  [disabled]="cargando"
                  (click)="pageChange.emit(p)"
                >
                  {{ p }}
                </button>
              }
            }
          </div>

          <button
            type="button"
            class="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
            [disabled]="page === totalPages || cargando"
            (click)="pageChange.emit(page + 1)"
          >
            Siguiente
          </button>
        </div>
      </footer>
    }
  `,
})
export class PaginadorComponent {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Input() totalItems = 0;
  @Input() pageSize = 10;
  @Input() cargando = false;

  @Output() pageChange = new EventEmitter<number>();

  get paginasVisibles(): number[] {
    const total = this.totalPages;
    const actual = this.page;
    if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1);

    const set = new Set<number>([1, total, actual, actual - 2, actual - 1, actual + 1, actual + 2]);
    const arr = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out: number[] = [];
    let prev = 0;
    for (const n of arr) {
      if (n - prev > 1) out.push(-1);
      out.push(n);
      prev = n;
    }
    return out;
  }
}
