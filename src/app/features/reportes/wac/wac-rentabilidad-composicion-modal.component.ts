import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { ModalOverlayComponent } from '../../../core/components/modal-overlay.component';
import {
  ComposicionCostoAplicado,
  ComposicionIngreso,
  RentabilidadComposicionResponse,
} from './rentabilidad-composicion.dtos';
import { RentabilidadComposicionService } from './rentabilidad-composicion.service';

/**
 * RENT-BREAKDOWN-02 — Modal that drills into how the WAC Rentabilidad
 * grid's headline COGS for a given product was assembled in the active
 * window. Renders:
 *
 *   - Banner: legacy-movement warning when FechaUtc is missing on any
 *     INGRESO or SALIDA in the response (sourced from `warnings`).
 *   - Two tables: Compras (INGRESOs) and Costos aplicados (SALIDAs with
 *     VentaId or orphan pre-WAC SALIDAs). Each row flags esLegacy with
 *     a chip.
 *   - Resumen: totalCostoCompras, totalCostoAplicadoVentas,
 *     costoPromedioCalculado del período y la fórmula textual que el
 *     backend aplicó.
 *
 * The component owns its own fetch state: when the parent flips `open`
 * to true AND sets `productoId`, it issues the GET and shows a loading
 * overlay until the response lands. The parent provides `desde`/`hasta`
 * so the modal reuses the same range the grid already has on screen.
 */
@Component({
  selector: 'app-wac-rentabilidad-composicion-modal',
  standalone: true,
  imports: [CommonModule, ModalOverlayComponent],
  templateUrl: './wac-rentabilidad-composicion-modal.component.html',
  styleUrls: ['./wac-rentabilidad-composicion-modal.component.css'],
})
export class WacRentabilidadComposicionModalComponent {
  private readonly service = inject(RentabilidadComposicionService);

  readonly open = input<boolean>(false);
  readonly productoId = input<number | null>(null);
  readonly desde = input<string>('');
  readonly hasta = input<string>('');

  readonly close = output<void>();

  protected readonly loading = signal<boolean>(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly composicion = signal<RentabilidadComposicionResponse | null>(null);

  protected readonly legacyCount = computed(() => this.composicion()?.warnings.totalLegacyMovimientos ?? 0);
  protected readonly hasData = computed(() => {
    const c = this.composicion();
    return !!c && (c.ingresos.length > 0 || c.costosAplicados.length > 0);
  });

  // Re-fetch whenever the modal opens AND the {productoId, desde, hasta}
  // tuple changes. We track a "key" so the same payload isn't re-pulled
  // if the parent re-emits the same input shape.
  private lastFetchKey: string | null = null;

  constructor() {
    // allowSignalWrites: this effect orchestrates modal state — it has to
    // write to loading/errorMsg/composicion signals as a direct consequence
    // of input changes. The flow is one-shot per key change, not a loop.
    effect(() => {
      const isOpen = this.open();
      if (!isOpen) {
        this.composicion.set(null);
        this.errorMsg.set(null);
        this.lastFetchKey = null;
        return;
      }

      const productoId = this.productoId();
      const desde = this.desde();
      const hasta = this.hasta();
      if (productoId == null || !desde || !hasta) {
        this.errorMsg.set('Faltan datos para consultar la composición.');
        return;
      }

      const key = `${productoId}|${desde}|${hasta}`;
      if (this.lastFetchKey === key) return;
      this.lastFetchKey = key;

      void this.fetch(productoId, desde, hasta);
    }, { allowSignalWrites: true });
  }

  private async fetch(productoId: number, desde: string, hasta: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const data = await firstValueFrom(
        this.service.getComposicion(productoId, { desde, hasta }),
      );
      this.composicion.set(data);
    } catch {
      this.errorMsg.set('No se pudo cargar la composición de costos.');
      this.composicion.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected onBackdropClose(): void {
    this.close.emit();
  }

  protected claseLegacy(esLegacy: boolean): string {
    return esLegacy ? 'chip chip-warning' : 'chip chip-neutral';
  }

  protected etiquetaLegacy(esLegacy: boolean): string {
    return esLegacy ? 'Legacy' : 'Normalizado';
  }

  protected formatearFechaCorta(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  protected formatearMoneda(n: number | null): string {
    if (n === null || n === undefined) return '—';
    return `S/. ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  protected formatearNumero(n: number): string {
    return n.toLocaleString('es-PE');
  }

  protected costoPromedioVisual(c: RentabilidadComposicionResponse): string {
    const v = c.resumen.costoPromedioCalculado;
    return v === null ? '—' : v.toLocaleString('es-PE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }

  protected trackIngreso(_: number, i: ComposicionIngreso): number {
    return i.movimientoId;
  }

  protected trackCostoAplicado(_: number, c: ComposicionCostoAplicado): number {
    return c.movimientoId;
  }
}