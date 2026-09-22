import { Component, OnInit, inject, signal, input, effect, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CatalogosState } from '../../core/state/catalogos.state';
import { ProductosState } from '../../core/state/productos.state';
import { ShellState } from '../../core/state/shell.state';
import { ApiProductosService } from '../../core/api/api-productos.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Categoria,
  Marca,
  Atributo,
  AtributoValor,
  ProductoAtributoValor,
  Producto,
  ActualizarProductoPayload,
  CrearProductoPayload,
} from '../../core/models/inventario.models';

type Modo = 'crear' | 'editar';

const MAX_IMAGE_MB = 2;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-nuevo-producto',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nuevo-producto.component.html',
})
export class NuevoProductoComponent implements OnInit {
  readonly productoId = input<number | null>(null);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly catalogos = inject(CatalogosState);
  protected readonly productos = inject(ProductosState);
  protected readonly shell = inject(ShellState);
  private readonly apiProductos = inject(ApiProductosService);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);

  protected readonly categorias = this.catalogos.categorias;
  protected readonly marcas = this.catalogos.marcas;
  protected readonly atributos = this.catalogos.atributos;
  protected readonly guardando = signal<boolean>(false);

  protected readonly modo = computed<Modo>(() => (this.productoId() ? 'editar' : 'crear'));

  protected readonly form: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(200)]],
    // Codigo de barras opcional. Si viene, debe ser 8-14 digitos (EAN-8/13/14).
    codigoBarra: ['', [Validators.pattern(/^\d{8,14}$/)]],
    categoriaId: [null],     // opcional: null = sin categoria
    marcaId: [null],         // opcional: null = sin marca
    precioVentaSugerido: [0, [Validators.required, Validators.min(0)]],
    // Umbral de stock bajo (default 10). El producto se marca como
    // "stock bajo" cuando StockActual < StockMinimo.
    stockMinimo: [10, [Validators.min(0)]],
    // Stock inicial: 0 = sin ingreso inicial. >0 registra un INGRESO atomico.
    stockInicial: [0, [Validators.min(0)]],
    stockInicialPrecioUnitario: [0, [Validators.min(0)]],
    stockInicialObservacion: [''],
  });

  // ---------- Imagen ----------
  /** Data URL actual (preview). Null si no hay imagen seleccionada / guardada. */
  protected readonly imagenPreview = signal<string | null>(null);
  /** MIME de la imagen actual del preview. */
  protected readonly imagenMime = signal<string | null>(null);
  /** Tamaño del archivo en bytes (para mostrar en la UI). */
  protected readonly imagenTamano = signal<number | null>(null);
  /** Error de validación del último intento de carga. */
  protected readonly imagenError = signal<string | null>(null);
  /**
   * Base64 puro (sin prefijo) listo para enviar al backend.
   * Si es null en el form, conservamos la imagen actual del backend.
   */
  protected readonly imagenBase64 = signal<string | null>(null);
  /** true si el usuario marco "quitar imagen" en edicion. */
  protected readonly quitarImagen = signal<boolean>(false);

  protected readonly atributosEnModoOtro = signal<Set<number>>(new Set());

  protected readonly maxBytes = MAX_IMAGE_MB * 1024 * 1024;

  protected valoresPara(atributoId: number): AtributoValor[] {
    return this.catalogos.valoresDeAtributo(atributoId);
  }

  protected tieneValores(atributoId: number): boolean {
    return this.catalogos.atributoValoresPorAtributo().has(atributoId)
      && this.catalogos.valoresDeAtributo(atributoId).length > 0;
  }

  protected enModoOtro(atributoId: number): boolean {
    return this.atributosEnModoOtro().has(atributoId);
  }

  protected salirDeOtro(atributoId: number): void {
    this.atributosEnModoOtro.update((s) => {
      const copia = new Set(s);
      copia.delete(atributoId);
      return copia;
    });
  }

  /**
   * Cuando el usuario elige un valor en el select de atributo. Si elige
   * "Otro", activamos el modo libre y limpiamos el form control.
   */
  protected onAtributoSelectChange(atributoId: number, value: unknown): void {
    if (value === '__OTRO__') {
      this.atributosEnModoOtro.update((s) => {
        const copia = new Set(s);
        copia.add(atributoId);
        return copia;
      });
      this.form.get(this.ctrlAtributo(atributoId))?.setValue('');
    }
  }

  // ---------- Dropzone / file input ----------

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.imagenError.set(null);

    // Validar tipo
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      this.imagenError.set(`Tipo no permitido. Usa JPEG, PNG o WebP. (Recibido: ${file.type || 'desconocido'})`);
      input.value = '';
      return;
    }

    // Validar tamano
    if (file.size > this.maxBytes) {
      const mb = (file.size / 1024 / 1024).toFixed(2);
      this.imagenError.set(`La imagen pesa ${mb} MB, maximo permitido: ${MAX_IMAGE_MB} MB.`);
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // dataUrl es "data:image/jpeg;base64,XXX"
      const base64 = dataUrl.split(',')[1] ?? '';
      this.imagenPreview.set(dataUrl);
      this.imagenMime.set(file.type);
      this.imagenTamano.set(file.size);
      this.imagenBase64.set(base64);
      this.quitarImagen.set(false);
    };
    reader.onerror = () => {
      this.imagenError.set('No se pudo leer el archivo.');
    };
    reader.readAsDataURL(file);
    // Resetear el input para permitir seleccionar el mismo archivo dos veces
    input.value = '';
  }

  protected eliminarImagen(): void {
    this.imagenPreview.set(null);
    this.imagenMime.set(null);
    this.imagenTamano.set(null);
    this.imagenBase64.set(null);
    if (this.modo() === 'editar') {
      this.quitarImagen.set(true);
    } else {
      this.quitarImagen.set(false);
    }
  }

  protected formatearTamano(bytes: number | null): string {
    if (bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  // ---------- Edicion ----------

  private readonly cargarProductoEffect = effect(() => {
    const id = this.productoId();
    if (!id) return;

    // Pedimos el producto directo al backend: trae imagenDataUrl
    // y atributos completos, no la version "lite" de la lista paginada.
    const sub = this.apiProductos.obtener(id).subscribe({
      next: (p) => this.prepararFormularioEdicion(p),
      error: () => {
        this.notify.error('No se pudo cargar el producto para edicion.');
      },
    });

    // Cleanup: cancelar suscripcion si el productoId cambia o el modal se cierra.
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  });

  private readonly cargarValoresEffect = effect(() => {
    for (const a of this.atributos()) {
      this.catalogos.obtenerValoresDeAtributo(a.id).catch(() => {});
    }
  });

  async ngOnInit(): Promise<void> {
    if (this.categorias().length === 0 || this.marcas().length === 0 || this.atributos().length === 0) {
      await this.catalogos.cargarCatalogos();
    }
    for (const a of this.atributos()) {
      if (!this.form.get(this.ctrlAtributo(a.id))) {
        this.form.addControl(this.ctrlAtributo(a.id), new FormControl(''));
      }
    }
  }

  private prepararFormularioEdicion(p: Producto): void {
    this.form.patchValue({
      nombre: p.nombre,
      codigoBarra: p.codigoBarra ?? '',
      categoriaId: p.categoriaId,
      marcaId: p.marcaId,
      precioVentaSugerido: p.precioVentaSugerido,
      stockMinimo: p.stockMinimo ?? 10,
      stockInicial: p.stockInicial ?? 0,
      stockInicialPrecioUnitario: p.stockInicialPrecioUnitario ?? 0,
      stockInicialObservacion: p.stockInicialObservacion ?? '',
    });
    this.prepararImagenYAtributosDe(p);
  }

  /** Helper compartido: imagen (preview) y atributos EAV del producto. */
  private prepararImagenYAtributosDe(p: Producto): void {
    if (p.imagenDataUrl) {
      this.imagenPreview.set(p.imagenDataUrl);
      this.imagenMime.set(p.imagenMime);
      this.imagenTamano.set(null);
    } else {
      this.imagenPreview.set(null);
      this.imagenMime.set(null);
      this.imagenTamano.set(null);
    }
    this.imagenBase64.set(null);
    this.quitarImagen.set(false);
    for (const a of p.atributos) {
      const ctrl = this.form.get(this.ctrlAtributo(a.atributoId));
      if (!ctrl) continue;
      const valores = this.catalogos.valoresDeAtributo(a.atributoId);
      const existe = valores.some((v) => v.nombre === a.valor);
      if (existe) {
        this.atributosEnModoOtro.update((s) => {
          const copia = new Set(s);
          copia.delete(a.atributoId);
          return copia;
        });
        ctrl.setValue(a.valor);
      } else {
        this.atributosEnModoOtro.update((s) => {
          const copia = new Set(s);
          copia.add(a.atributoId);
          return copia;
        });
        ctrl.setValue(a.valor);
      }
    }
  }

  protected ctrlAtributo(id: number): string {
    return `attr_${id}`;
  }

  protected placeholderPara(nombreAtributo: string): string {
    const n = nombreAtributo.toLowerCase();
    if (n.includes('potencia')) return '65W';
    if (n.includes('puertos')) return '2';
    if (n.includes('conector')) return 'USB-C';
    if (n.includes('longitud')) return '1.5m';
    if (n.includes('capacidad')) return '10000mAh';
    if (n.includes('color')) return 'Negro';
    return 'Valor...';
  }

  protected cerrar(): void {
    // Bloqueado durante un guardado en curso. El boton "Cancelar"
    // del footer tambien esta deshabilitado. El X y el overlay
    // pueden llamar a cerrar() durante un save: lo impedimos aca.
    if (this.guardando()) return;
    this.shell.cerrarModalNuevoProducto();
    this.shell.productoEditandoId.set(null);
  }

  protected async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.warning('Por favor completa todos los campos requeridos correctamente.');
      return;
    }
    const v = this.form.value;
    const nombreTrim = (v.nombre ?? '').toString().trim();
    if (nombreTrim.length < 1) {
      this.notify.warning('El nombre del producto no puede estar vacío.');
      return;
    }
    const codigoBarraTrim = v.codigoBarra ? v.codigoBarra.toString().trim() : '';
    if (codigoBarraTrim && !/^\d{8,14}$/.test(codigoBarraTrim)) {
      this.notify.warning('El código de barra debe contener entre 8 y 14 dígitos numéricos.');
      return;
    }
    const precioNum = Number(v.precioVentaSugerido);
    if (isNaN(precioNum) || precioNum < 0) {
      this.notify.warning('El precio de venta sugerido debe ser un número mayor o igual a 0.');
      return;
    }
    const stockMinNum = Number(v.stockMinimo ?? 0);
    if (!Number.isInteger(stockMinNum) || stockMinNum < 0) {
      this.notify.warning('El stock mínimo debe ser un número entero mayor o igual a 0.');
      return;
    }
    const stockInicialNum = Number(v.stockInicial ?? 0);
    if (!Number.isInteger(stockInicialNum) || stockInicialNum < 0) {
      this.notify.warning('El stock inicial debe ser un número entero mayor o igual a 0.');
      return;
    }

    // Crear valores "Otro" automaticamente. Si falla el alta del producto
    // mas abajo, hacemos rollback de los AtributoValor recien creados para
    // que un retry del usuario no choque con el UNIQUE.
    const atributosPayload: ProductoAtributoValor[] = [];
    // Pares (id, atributoId) de AtributoValor creados en este submit, para
    // rollback si falla la creacion del producto.
    const valoresCreados: { id: number; atributoId: number }[] = [];
    for (const a of this.atributos()) {
      const raw = v[this.ctrlAtributo(a.id)];
      const valor = (raw ?? '').toString().trim();
      if (!valor) continue;
      if (this.enModoOtro(a.id)) {
        const yaExiste = this.catalogos.valoresDeAtributo(a.id)
          .some((vv) => vv.nombre.toLowerCase() === valor.toLowerCase());
        if (!yaExiste) {
          try {
            const nuevo = await this.catalogos.crearAtributoValor(a.id, valor);
            if (nuevo?.id) valoresCreados.push({ id: nuevo.id, atributoId: a.id });
          } catch {
            // Si falla, seguimos. El backend validara.
          }
        }
      }
      atributosPayload.push({ atributoId: a.id, valor });
    }

    this.guardando.set(true);
    try {
      // Construir payload segun modo
      const basePayload: CrearProductoPayload = {
        nombre: nombreTrim,
        codigoBarra: codigoBarraTrim || undefined,
        categoriaId: v.categoriaId == null || v.categoriaId === '' ? null : Number(v.categoriaId),
        marcaId: v.marcaId == null || v.marcaId === '' ? null : Number(v.marcaId),
        precioVentaSugerido: precioNum,
        stockMinimo: stockMinNum,
        atributos: atributosPayload,
        // Imagen: solo la enviamos si el usuario selecciono una nueva
        // o si pidio quitarla. Si no, conservamos la del backend.
        imagenBase64: this.imagenBase64() ?? undefined,
        imagenMime: this.imagenMime() ?? undefined,
        // Stock inicial: se aplica al ALTA o a la EDICIÓN.
        stockInicial: stockInicialNum,
        stockInicialPrecioUnitario: Math.max(0, Number(v.stockInicialPrecioUnitario ?? 0)),
        stockInicialObservacion: (v.stockInicialObservacion ?? '').toString().trim() || undefined,
      };

      if (this.modo() === 'editar' && this.productoId() !== null) {
        const payload: ActualizarProductoPayload = {
          ...basePayload,
          quitarImagen: this.quitarImagen() || undefined,
        };
        await this.productos.actualizarProducto(this.productoId()!, payload);
        this.notify.success(`Producto "${basePayload.nombre}" actualizado.`);
      } else {
        await this.productos.crearProducto(basePayload);
        this.notify.success(`Producto "${basePayload.nombre}" creado.`);
      }

      // Cerrar ANTES de resetear guardando, asi el guard de cerrar()
      // no nos bloquea.
      this.shell.cerrarModalNuevoProducto();
      this.shell.productoEditandoId.set(null);
    } catch {
      // Rollback: borrar los AtributoValor que creamos en este submit
      // para que un retry del usuario no choque con el UNIQUE.
      // Best-effort: si falla el borrado, el usuario vera el error especifico.
      for (const { id, atributoId } of valoresCreados) {
        try {
          await this.catalogos.eliminarAtributoValor(id, atributoId);
        } catch {
          // Silenciar: el rollback es best-effort.
        }
      }
      this.notify.error(this.shell.error() ?? 'No se pudo guardar el producto.');
    } finally {
      this.guardando.set(false);
    }
  }
}
