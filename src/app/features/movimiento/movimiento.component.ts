import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CatalogosState } from '../../core/state/catalogos.state';
import { KardexState } from '../../core/state/kardex.state';
import { ProductosState } from '../../core/state/productos.state';
import { ShellState } from '../../core/state/shell.state';
import { NotificationService } from '../../core/services/notification.service';
import { DropdownComponent } from '../../core/components/dropdown.component';
import { TABLA_COMPONENTS } from '../../core/components/tabla.component';
import { Movimiento } from '../../core/models/inventario.models';

interface FilaHistorial {
  id: number;
  fechaHora: string;
  tipo: 'INGRESO' | 'SALIDA';
  producto: string;
  cantidad: number;
  precioUnitario: number;
  monto: number;
  cliente: string | null;
  usuarioId: number | null;
  usuarioNombre: string | null;
  esStockInicial: boolean;
}

@Component({
  selector: 'app-movimiento',
  standalone: true,
  templateUrl: './movimiento.component.html',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DropdownComponent, RouterLink, ...TABLA_COMPONENTS],
  host: {
    '(window:resize)': 'onResize()'
  }
})
export class MovimientoComponent implements OnInit {
  protected readonly productosState = inject(ProductosState);
  protected readonly kardex = inject(KardexState);
  protected readonly shell = inject(ShellState);
  private readonly catalogos = inject(CatalogosState);
  protected readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // Parámetros de tabla
  protected sortCol = signal<string>('fecha');
  protected sortDir = signal<'asc' | 'desc'>('desc');

  protected onResize(): void {
    if (window.innerWidth < 768) {
      this.vistaModo.set('cards');
    } else {
      this.vistaModo.set('tabla');
    }
  }

  protected readonly procesando = signal<boolean>(false);
  protected readonly historialReciente = signal<FilaHistorial[]>([]);
  protected readonly sinProductoSeleccionado = signal<boolean>(true);
  protected readonly productoSinMovimientos = signal<boolean>(false);
  protected readonly vistaModo = signal<'cards' | 'tabla'>('cards');

  protected readonly formMovimiento: FormGroup = this.fb.group({
    productoId: [null, [Validators.required]],
    tipoMovimientoId: [1, [Validators.required]],
    cantidad: [1, [Validators.required, Validators.min(1)]],
    precioUnitario: [null, [Validators.required, Validators.min(0.01)]],
    observacion: [''],
  });

  private readonly cantidadValue = signal<number>(1);
  private readonly tipoValue = signal<1 | 2>(1);

  protected readonly opcionesProducto = computed(() =>
    this.productosState.productosSelector().map((p) => ({
      value: p.id,
      label: p.nombre,
      sublabel: p.codigoBarra ?? undefined,
      badge: `Stock ${p.stockActual}`,
      badgeClass: p.stockActual < (p.stockMinimo ?? 10)
        ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
        : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    }))
  );

  protected readonly productoDelForm = computed<{ id: number; nombre: string; codigoBarra: string | null; stockActual: number; stockMinimo: number; precioVentaSugerido: number } | null>(() => {
    const id = this.formMovimiento.get('productoId')?.value;
    if (id == null) return null;
    const cached = this.productosState.productos().find((p) => p.id === Number(id));
    if (cached) {
      return {
        id: cached.id,
        nombre: cached.nombre,
        codigoBarra: cached.codigoBarra,
        stockActual: cached.stockActual,
        stockMinimo: cached.stockMinimo,
        precioVentaSugerido: cached.precioVentaSugerido,
      };
    }
    const selector = this.productosState.productosSelector().find((p) => p.id === Number(id));
    if (selector) {
      return {
        id: selector.id,
        nombre: selector.nombre,
        codigoBarra: selector.codigoBarra,
        stockActual: selector.stockActual,
        stockMinimo: selector.stockMinimo,
        precioVentaSugerido: selector.precioVentaSugerido,
      };
    }
    return null;
  });

  protected readonly stockDisponible = computed<number | null>(() => this.productoDelForm()?.stockActual ?? null);
  protected readonly stockMinimoDelForm = computed<number | null>(() => this.productoDelForm()?.stockMinimo ?? null);
  protected readonly esSalida = computed<boolean>(() => this.tipoValue() === 2);

  protected readonly advertenciaStock = computed<{ tipo: 'error' | 'warning' | null; mensaje: string | null }>(() => {
    if (!this.esSalida()) return { tipo: null, mensaje: null };
    const stock = this.stockDisponible();
    if (stock === null) return { tipo: null, mensaje: null };
    const cant = this.cantidadValue();
    if (cant <= 0) return { tipo: 'warning', mensaje: 'La cantidad debe ser mayor a 0.' };
    if (cant > stock) return { tipo: 'error', mensaje: `Stock insuficiente. Disponible: ${stock}, solicitado: ${cant}.` };
    if (cant === stock) return { tipo: 'warning', mensaje: 'Esta salida dejara el stock en 0. Revisa que sea correcto.' };
    if (stock - cant < 5) return { tipo: 'warning', mensaje: `Quedara solo ${stock - cant} unidades despues de esta salida.` };
    return { tipo: null, mensaje: null };
  });

  protected onFormChange(): void {
    const v = this.formMovimiento.value;
    this.cantidadValue.set(Number(v.cantidad ?? 0));
    const tipo = Number(v.tipoMovimientoId);
    this.tipoValue.set(tipo === 2 ? 2 : 1);
  }

  protected onProductoSeleccionado(id: unknown): void {
    if (id == null) return;
    const idNum = Number(id);
    const prod = this.productosState.productosSelector().find((x) => x.id === idNum)
              ?? this.productosState.productos().find((x) => x.id === idNum);
    if (prod && prod.precioVentaSugerido != null && prod.precioVentaSugerido > 0) {
      this.formMovimiento.patchValue({ precioUnitario: prod.precioVentaSugerido });
    }
  }

  async ngOnInit(): Promise<void> {
    await this.productosState.cargarSelectorProductos(true);
    if (this.productosState.productos().length === 0) {
      await this.catalogos.cargarCatalogos();
    }

    // Al seleccionar o cambiar de producto, asigna por defecto el precioVentaSugerido
    this.formMovimiento.get('productoId')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => {
        if (id != null) {
          const idNum = Number(id);
          const prod = this.productosState.productosSelector().find((x) => x.id === idNum)
                    ?? this.productosState.productos().find((x) => x.id === idNum);
          if (prod && prod.precioVentaSugerido != null && prod.precioVentaSugerido > 0) {
            this.formMovimiento.patchValue({ precioUnitario: prod.precioVentaSugerido }, { emitEvent: false });
          }
        }
      });

    this.formMovimiento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.onFormChange();
        this.refrescarHistorial();
      });
    this.onFormChange();
    this.refrescarHistorial();
  }

  protected async procesarMovimiento(): Promise<void> {
    if (this.formMovimiento.invalid) {
      this.formMovimiento.markAllAsTouched();
      const v = this.formMovimiento.value;
      if (!v.productoId) {
        this.notify.error('Debe seleccionar un producto.');
        return;
      }
      if (v.cantidad === null || v.cantidad === undefined || Number(v.cantidad) <= 0 || !Number.isInteger(Number(v.cantidad))) {
        this.notify.error('La cantidad debe ser un número entero mayor a 0.');
        return;
      }
      if (v.precioUnitario === null || v.precioUnitario === undefined || Number(v.precioUnitario) < 0) {
        this.notify.error('El precio unitario debe ser mayor o igual a 0.');
        return;
      }
      this.notify.error('Por favor revise los campos del formulario.');
      return;
    }
    const v = this.formMovimiento.value;
    const cantNum = Number(v.cantidad);
    if (isNaN(cantNum) || cantNum <= 0 || !Number.isInteger(cantNum)) {
      this.notify.error('La cantidad debe ser un número entero mayor a 0.');
      return;
    }
    const precioNum = Number(v.precioUnitario);
    if (isNaN(precioNum) || precioNum < 0) {
      this.notify.error('El precio unitario debe ser mayor o igual a 0.');
      return;
    }

    const adv = this.advertenciaStock();
    if (adv.tipo === 'error') {
      this.notify.error(adv.mensaje ?? 'Stock insuficiente.');
      return;
    }
    this.procesando.set(true);
    try {
      const mov = await this.productosState.registrarMovimiento({
        productoId: Number(v.productoId),
        tipoMovimientoId: Number(v.tipoMovimientoId) as 1 | 2,
        cantidad: cantNum,
        precioUnitario: precioNum,
        // cliente explicito null: este endpoint no maneja clientes.
        // Para ventas con cliente (contado o crédito), usar Punto de Venta.
        cliente: null,
        observacion: v.observacion ? v.observacion.toString().trim() : undefined,
      });
      await this.productosState.cargarSelectorProductos(true);
      this.notify.success(
        mov.tipoMovimientoId === 1
          ? `Ingreso registrado: +${mov.cantidad} unidades.`
          : `Salida registrada: -${mov.cantidad} unidades.`
      );
      this.formMovimiento.reset({
        productoId: null,
        tipoMovimientoId: 1,
        cantidad: 1,
        precioUnitario: null,
        observacion: ''
      });
      this.onFormChange();
      this.refrescarHistorial();
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo registrar el movimiento.');
    } finally {
      this.procesando.set(false);
    }
  }

  private async refrescarHistorial(): Promise<void> {
    const productoId = this.formMovimiento.get('productoId')?.value;
    if (!productoId) {
      this.sinProductoSeleccionado.set(true);
      this.productoSinMovimientos.set(false);
      this.historialReciente.set([]);
      return;
    }
    this.sinProductoSeleccionado.set(false);
    const movs = await this.kardex.obtenerKardex(Number(productoId));
    this.productoSinMovimientos.set(movs.length === 0);
    this.historialReciente.set(movs.slice(0, 5).map((m) => this.mapFila(m)));
  }

  private mapFila(m: Movimiento): FilaHistorial {
    const esIngreso = m.tipoMovimientoId === 1;
    const tipo: 'INGRESO' | 'SALIDA' = esIngreso ? 'INGRESO' : 'SALIDA';
    const producto = this.productosState.productos().find((p) => p.id === m.productoId);
    const nombre = producto?.nombre ?? `Producto #${m.productoId}`;
    return {
      id: Number(m.id),
      fechaHora: this.formatearFechaHora(m.fecha),
      tipo,
      producto: nombre,
      cantidad: esIngreso ? m.cantidad : -m.cantidad,
      precioUnitario: m.precioUnitario,
      monto: m.cantidad * m.precioUnitario,
      cliente: m.cliente ?? null,
      usuarioId: m.creadoPorId ?? null,
      usuarioNombre: m.creadoPorNombre ?? null,
      esStockInicial: m.esStockInicial,
    };
  }

  private formatearFechaHora(fecha: string | Date): string {
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${dd}/${mm}/${yyyy} - ${hours}:${minutes} ${ampm}`;
  }
}
