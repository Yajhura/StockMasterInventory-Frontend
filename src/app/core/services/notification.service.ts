import { Injectable, signal } from '@angular/core';

export type TipoToast = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

/**
 * Servicio global de notificaciones (toasts) basado en Signals.
 * Los componentes inyectan este servicio y llaman a .success() / .error() / etc.
 * El componente <app-toast-host> lee el signal y los renderiza.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 1;
  private readonly duracionMs = 4500;

  success(mensaje: string): void { this.push('success', mensaje); }
  info(mensaje: string): void    { this.push('info', mensaje); }
  warning(mensaje: string): void { this.push('warning', mensaje); }
  error(mensaje: string): void   { this.push('error', mensaje); }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(tipo: TipoToast, mensaje: string): void {
    const id = this.nextId++;
    this._toasts.update((list) => [...list, { id, tipo, mensaje }]);
    setTimeout(() => this.dismiss(id), this.duracionMs);
  }
}
