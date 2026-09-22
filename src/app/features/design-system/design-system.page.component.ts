import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';

/**
 * Design System showcase page — DEV ONLY.
 *
 * Renders 3 variants per UI component type so the user can pick
 * the canonical version. Each variant is a literal class string
 * (no abstract primitives yet) so the user can SEE the design
 * before we commit to a primitive class name.
 *
 * After the user picks A / B / C per type, this page is updated
 * to mark the chosen variants, and the corresponding primitives
 * are extracted into `src/styles.css` (`@layer components`).
 *
 * NOT exposed in dev nav. Direct URL access only:
 *   http://localhost:4200/design-system
 *
 * Wired in `app.routes.ts` only when `environment.production === false`.
 */
@Component({
  selector: 'app-design-system-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-system.page.component.html',
  styleUrls: ['./design-system.page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignSystemPageComponent {
  protected readonly isDev = !environment.production;

  // ===== 1. PRIMARY BUTTON =====
  protected readonly btnPrimary = {
    A: 'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md bg-blue-600 text-white text-xs font-semibold transition-all duration-150 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
    B: 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold transition-all duration-200 shadow-sm hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
    C: 'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-blue-600 text-white text-sm font-semibold transition-all duration-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
  } as const;

  // ===== 2. SECONDARY BUTTON =====
  protected readonly btnSecondary = {
    A: 'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-semibold transition-all duration-150 hover:bg-slate-50 hover:border-slate-400 active:scale-[0.98] disabled:opacity-50',
    B: 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-semibold transition-all duration-200 hover:bg-slate-50 hover:border-blue-600 hover:text-blue-600 active:scale-[0.98] disabled:opacity-50',
    C: 'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-transparent text-slate-600 text-sm font-semibold transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
  } as const;

  // ===== 3. INPUT =====
  protected readonly input = {
    A: 'w-full h-11 px-3.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/20',
    B: 'w-full h-10 px-2 bg-transparent border-0 border-b border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 outline-none focus:border-blue-600 focus:ring-0',
    C: 'w-full h-10 px-3 bg-slate-50 border border-transparent rounded-lg text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 outline-none focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/20',
  } as const;

  // ===== 4. TABLE ROW =====
  protected readonly tableRow = {
    A: 'border-b border-slate-200 text-xs text-slate-700 hover:bg-slate-50/50 transition-colors',
    B: 'border-b border-slate-100 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors divide-y divide-slate-100',
    C: 'border-b border-slate-100 text-sm text-slate-700 hover:bg-blue-50/30 transition-colors cursor-pointer',
  } as const;

  protected readonly tableHeader = {
    A: 'bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-left',
    B: 'bg-slate-50/60 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 text-left',
    C: 'px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 text-left bg-gradient-to-b from-slate-50 to-transparent',
  } as const;

  // ===== 5. KPI CARD =====
  protected readonly kpiCard = {
    A: 'bg-white border border-slate-200/70 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-all duration-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5',
    B: 'bg-white border border-slate-200/70 rounded-xl p-5 shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-all duration-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 relative overflow-hidden',
    C: 'bg-white border border-slate-200/70 rounded-xl p-5 shadow-[0_4px_12px_rgba(15,23,42,0.05)] transition-all duration-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5',
  } as const;

  // ===== 6. MODAL =====
  protected readonly modal = {
    A: 'bg-white rounded-xl shadow-2xl p-5 max-w-md w-full mx-4',
    B: 'bg-white rounded-l-2xl shadow-2xl p-6 max-w-sm w-full h-full ml-auto',
    C: 'bg-white rounded-2xl shadow-2xl p-7 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto',
  } as const;

  // ===== 7. BADGE/CHIP =====
  protected readonly badge = {
    A: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700',
    B: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset',
    C: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-700',
  } as const;

  protected readonly badgeSuccess = 'bg-emerald-50 text-emerald-700 ring-emerald-200/60';
  protected readonly badgeDanger = 'bg-rose-50 text-rose-700 ring-rose-200/60';
  protected readonly badgeInfo = 'bg-violet-50 text-violet-700 ring-violet-200/60';
  protected readonly badgeWarning = 'bg-amber-50 text-amber-700 ring-amber-200/60';

  // ===== 8. ICON-ONLY BUTTON =====
  protected readonly iconButton = {
    A: 'grid place-items-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors',
    B: 'grid place-items-center w-8 h-8 rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors',
    C: 'grid place-items-center w-7 h-7 text-slate-400 hover:text-slate-700 transition-colors',
  } as const;

  // Choices (user fills in once they decide)
  protected choices: Record<string, 'A' | 'B' | 'C'> = {};

  protected pick(component: string, choice: 'A' | 'B' | 'C') {
    this.choices[component] = choice;
    console.log(`[design-system] ${component} → ${choice}`);
  }
}
