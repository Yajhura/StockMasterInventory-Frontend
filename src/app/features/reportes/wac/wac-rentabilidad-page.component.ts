import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, of, EMPTY, catchError, debounceTime, switchMap, tap } from 'rxjs';

import { CatalogosState } from '../../../core/state/catalogos.state';
import { RentabilidadService } from './rentabilidad.service';
import {
  CompletitudRentabilidad,
  RentabilidadResponse,
} from './rentabilidad.dtos';

type Preset = 'ultimoMes' | 'ytd' | 'anioPasado' | 'personalizado';

/**
 * WAC-03 frontend — WAC-aware rentabilidad grid mounted at
 * `/reportes/rentabilidad-wac`. Renders the envelope from
 * `GET /api/reportes/rentabilidad` without recomputing COGS or margins.
 * Filter changes are debounced 250 ms; `switchMap` cancels in-flight calls.
 */
@Component({
  selector: 'app-wac-rentabilidad-page',
  standalone: true,
  templateUrl: './wac-rentabilidad-page.component.html',
  styleUrls: ['./wac-rentabilidad-page.component.css'],
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
})
export class WacRentabilidadPageComponent implements OnInit {
  private readonly service = inject(RentabilidadService);
  private readonly catalogos = inject(CatalogosState);

  protected readonly preset = signal<Preset>('ultimoMes');
  protected readonly filtrosForm = new FormGroup({
    desde: new FormControl<string>('', { nonNullable: true }),
    hasta: new FormControl<string>('', { nonNullable: true }),
    categoriaId: new FormControl<number | null>(null),
    marcaId: new FormControl<number | null>(null),
  });
  protected readonly respuesta = signal<RentabilidadResponse | null>(null);
  protected readonly cargando = signal<boolean>(false);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly categorias = this.catalogos.categorias;
  protected readonly marcas = this.catalogos.marcas;

  protected readonly mostrarWarnings = computed(() => {
    const r = this.respuesta();
    return !!r && (r.totales.productosCuarentenados > 0 || r.totales.productosConCostoFaltante > 0);
  });

  private readonly filtrosSubject = new Subject<void>();

  ngOnInit(): void {
    // Subscribe BEFORE the first preset emission — otherwise the
    // initial load is lost (Subject drops pre-subscriber events).
    this.filtrosSubject
      .pipe(
        debounceTime(250),
        tap(() => this.cargando.set(true)),
        switchMap(() => {
          const raw = this.filtrosForm.getRawValue();
          if (!raw.desde || !raw.hasta) {
            this.cargando.set(false);
            return of(null);
          }
          return this.service.getRentabilidad({
            desde: raw.desde,
            hasta: raw.hasta,
            categoriaId: raw.categoriaId ?? undefined,
            marcaId: raw.marcaId ?? undefined,
          }).pipe(catchError((err) => {
            this.errorMsg.set(this.mensajeError(err));
            this.cargando.set(false);
            return EMPTY;
          }));
        })
      )
      .subscribe((res) => {
        if (res === null) return;
        this.respuesta.set(res);
        this.errorMsg.set(null);
        this.cargando.set(false);
      });

    void this.cargarCatalogosSiHaceFalta();
    this.aplicarPreset('ultimoMes');
  }

  protected aplicarFiltros(): void {
    this.filtrosSubject.next();
  }

  protected aplicarPreset(p: Preset): void {
    this.preset.set(p);
    if (p === 'personalizado') return; // no override, keep user input
    const hoy = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fin = iso(hoy);
    let desde = fin;
    if (p === 'ultimoMes')      desde = iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
    else if (p === 'ytd')       desde = `${hoy.getFullYear()}-01-01`;
    else if (p === 'anioPasado') desde = `${hoy.getFullYear() - 1}-01-01`;
    this.filtrosForm.patchValue({ desde, hasta: p === 'anioPasado' ? `${hoy.getFullYear() - 1}-12-31` : fin });
    this.aplicarFiltros();
  }

  protected claseCompletitud(c: CompletitudRentabilidad): string {
    if (c === 'Completa') return 'chip chip-success';
    if (c === 'ConQuarentena') return 'chip chip-warning';
    return 'chip chip-danger';
  }

  protected etiquetaCompletitud(c: CompletitudRentabilidad): string {
    return c === 'Completa' ? 'Completa' : c === 'ConQuarentena' ? 'Cuarentena' : 'Costo faltante';
  }

  protected tooltipCompletitud(c: CompletitudRentabilidad): string {
    if (c === 'Completa') return 'Historia completa: COGS y margen calculados desde snapshots WAC persistidos.';
    if (c === 'ConQuarentena') return 'Producto en cuarentena: el replay WAC no pudo reconciliar la historia.';
    return 'Al menos una venta del periodo no tiene snapshot de COGS.';
  }

  private async cargarCatalogosSiHaceFalta(): Promise<void> {
    if (this.categorias().length === 0 || this.marcas().length === 0) {
      try { await this.catalogos.cargarCatalogos(); } catch { /* toast manejado por interceptor */ }
    }
  }

  private mensajeError(err: unknown): string {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status: number }).status;
      if (status === 0) return 'No se pudo conectar con el servidor.';
      if (status >= 500) return 'El servidor reportó un error. Reintentá en unos minutos.';
    }
    return 'No se pudo cargar la rentabilidad WAC.';
  }
}