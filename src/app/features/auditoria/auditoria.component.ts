import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiReportesService, AuditoriaItem } from '../../core/api/api-reportes.service';

@Component({
  selector: 'app-auditoria',
  standalone: true,
  templateUrl: './auditoria.component.html',
  imports: [CommonModule, FormsModule, RouterLink],
})
export class AuditoriaComponent implements OnInit {
  private readonly api = inject(ApiReportesService);

  protected readonly eventos = signal<AuditoriaItem[]>([]);
  protected readonly totalEventos = signal<number>(0);
  protected readonly cargando = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  // Filtros
  protected desde = '';
  protected hasta = '';
  protected tipoFiltro: '' | 'producto' | 'movimiento' = '';
  protected usuarioFiltro = '';

  // Paginacion
  protected readonly page = signal<number>(1);
  protected readonly pageSize = signal<number>(50);
  protected readonly totalPages = signal<number>(0);

  async ngOnInit(): Promise<void> {
    await this.recargar();
  }

  protected async recargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const params: { desde?: string; hasta?: string; usuarioId?: number; tipo?: 'producto' | 'movimiento'; page: number; size: number } = {
        page: this.page(),
        size: this.pageSize(),
      };
      if (this.desde) params.desde = new Date(this.desde).toISOString();
      if (this.hasta) params.hasta = new Date(this.hasta).toISOString();
      if (this.tipoFiltro) params.tipo = this.tipoFiltro;
      const uid = Number(this.usuarioFiltro);
      if (this.usuarioFiltro && Number.isFinite(uid) && uid > 0) {
        params.usuarioId = uid;
      }
      const result = await new Promise<{ items: AuditoriaItem[]; totalItems: number; totalPages: number }>((resolve, reject) => {
        this.api.auditoria(params).subscribe({ next: resolve, error: reject });
      });
      this.eventos.set(result.items);
      this.totalEventos.set(result.totalItems);
      this.totalPages.set(result.totalPages);
    } catch (e: unknown) {
      this.error.set(
        typeof e === 'object' && e && 'error' in e
          ? (e as { error?: { detail?: string } }).error?.detail ?? 'No se pudo cargar la bitacora.'
          : 'No se pudo cargar la bitacora.'
      );
    } finally {
      this.cargando.set(false);
    }
  }

  protected async onFiltroChange(): Promise<void> {
    this.page.set(1);
    await this.recargar();
  }

  protected async cambiarPagina(p: number): Promise<void> {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    await this.recargar();
  }

  protected limpiarFiltros(): void {
    this.desde = '';
    this.hasta = '';
    this.tipoFiltro = '';
    this.usuarioFiltro = '';
    this.page.set(1);
    this.recargar();
  }

  protected formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleString('es-PE');
  }

  protected iconoPara(tipo: string): string {
    if (tipo === 'PRODUCTO') {
      return 'M20 7h-4V4a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM10 5h4v2h-4V5z';
    }
    return 'M3 7h18M3 12h18M3 17h18';
  }
}
