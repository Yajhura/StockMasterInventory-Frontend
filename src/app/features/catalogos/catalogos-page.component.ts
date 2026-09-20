import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogosState } from '../../core/state/catalogos.state';
import { ShellState } from '../../core/state/shell.state';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog.component';
import { Categoria, Marca, Atributo, AtributoValor } from '../../core/models/inventario.models';

type Tab = 'categorias' | 'marcas' | 'atributos';

interface ItemCatalogo {
  id: number;
  nombre: string;
  uso: number;
}

@Component({
  selector: 'app-catalogos-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './catalogos-page.component.html',
})
export class CatalogosPageComponent implements OnInit {
  protected readonly catalogos = inject(CatalogosState);
  private readonly shell = inject(ShellState);
  private readonly notify = inject(NotificationService);

  protected readonly tab = signal<Tab>('categorias');

  protected readonly items = computed<ItemCatalogo[]>(() => {
    switch (this.tab()) {
      case 'categorias':
        return this.catalogos.categorias().map((c) => ({ id: c.id, nombre: c.nombre, uso: 0 }));
      case 'marcas':
        return this.catalogos.marcas().map((m) => ({ id: m.id, nombre: m.nombre, uso: 0 }));
      case 'atributos':
        return this.catalogos.atributos().map((a) => ({ id: a.id, nombre: a.nombre, uso: 0 }));
    }
  });

  protected readonly nuevoNombreCategoria = signal<string>('');
  protected readonly nuevoNombreMarca     = signal<string>('');
  protected readonly nuevoNombreAtributo  = signal<string>('');

  protected readonly editandoId = signal<number | null>(null);
  protected readonly editBuffer = signal<string>('');

  protected readonly confirmandoEliminar = signal<{ id: number; nombre: string; tab: Tab } | null>(null);
  protected readonly eliminando = signal<boolean>(false);

  protected readonly mensajeEliminar = computed(() => {
    const t = this.confirmandoEliminar();
    if (!t) return '';
    return `Vas a eliminar "${t.nombre}". Si tiene productos asociados, la operacion sera rechazada por el backend.`;
  });

  protected readonly guardandoCat = signal<boolean>(false);
  protected readonly guardandoMar = signal<boolean>(false);
  protected readonly guardandoAtr = signal<boolean>(false);

  // ---------- Modal de valores de atributo ----------

  protected readonly atributoConValores = signal<Atributo | null>(null);
  protected readonly valoresVisibles     = signal<AtributoValor[]>([]);
  protected readonly cargandoValores     = signal<boolean>(false);
  protected readonly nuevoValorNombre    = signal<string>('');
  protected readonly guardandoValor      = signal<boolean>(false);
  protected readonly editandoValorId     = signal<number | null>(null);
  protected readonly editValorBuffer     = signal<string>('');
  protected readonly confirmandoEliminarValor = signal<AtributoValor | null>(null);
  protected readonly eliminandoValor     = signal<boolean>(false);

  /**
   * Cantidad de valores en cache para cada atributo. Se usa en el boton
   * "Valores (N)" para mostrar el contador sin abrir el modal.
   */
  protected readonly conteoValoresPorAtributo = computed<Map<number, number>>(() => {
    const map = this.catalogos.atributoValoresPorAtributo();
    const out = new Map<number, number>();
    for (const [k, v] of map.entries()) out.set(k, v.length);
    return out;
  });

  constructor() {
    // Carga lazy de valores al cambiar al tab atributos (solo la primera vez).
    effect(() => {
      if (this.tab() === 'atributos') {
        for (const a of this.catalogos.atributos()) {
          if (!this.catalogos.atributoValoresPorAtributo().has(a.id)) {
            this.catalogos.obtenerValoresDeAtributo(a.id).catch(() => {});
          }
        }
      }
    });
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
    this.cancelarEdicion();
  }

  async ngOnInit(): Promise<void> {
    // Si entramos directo a /catalogos (deep-link, F5, etc.) los catalogos
    // no estan cargados. Cargarlos aca. Es idempotente: si ya estaban
    // cargados por otra pantalla, el state no hace nada.
    if (
      this.catalogos.categorias().length === 0 ||
      this.catalogos.marcas().length === 0 ||
      this.catalogos.atributos().length === 0
    ) {
      await this.catalogos.cargarCatalogos();
    }
  }

  protected placeholderFor(tab: Tab): string {
    return tab === 'categorias'
      ? 'Ej. Cargador, Cable, Bateria...'
      : tab === 'marcas'
        ? 'Ej. Baseus, Apple, Anker...'
        : 'Ej. Potencia, Conector, Longitud...';
  }

  protected nuevoNombreValue(tab: Tab): string {
    return tab === 'categorias' ? this.nuevoNombreCategoria() : tab === 'marcas' ? this.nuevoNombreMarca() : this.nuevoNombreAtributo();
  }

  protected setNuevoNombre(tab: Tab, value: string): void {
    if (tab === 'categorias') this.nuevoNombreCategoria.set(value);
    else if (tab === 'marcas') this.nuevoNombreMarca.set(value);
    else this.nuevoNombreAtributo.set(value);
  }

  protected guardandoPara(tab: Tab): boolean {
    return tab === 'categorias' ? this.guardandoCat() : tab === 'marcas' ? this.guardandoMar() : this.guardandoAtr();
  }

  protected setGuardando(tab: Tab, val: boolean): void {
    if (tab === 'categorias') this.guardandoCat.set(val);
    else if (tab === 'marcas') this.guardandoMar.set(val);
    else this.guardandoAtr.set(val);
  }

  protected async agregar(tab: Tab): Promise<void> {
    const nombre = this.nuevoNombreValue(tab).trim();
    if (nombre.length < 2) {
      this.notify.warning('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    this.setGuardando(tab, true);
    try {
      if (tab === 'categorias')      await this.catalogos.crearCategoria(nombre);
      else if (tab === 'marcas')    await this.catalogos.crearMarca(nombre);
      else                          await this.catalogos.crearAtributo(nombre);
      this.notify.success(`${this.tituloTab(tab)} creado.`);
      this.setNuevoNombre(tab, '');
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo crear el item.');
    } finally {
      this.setGuardando(tab, false);
    }
  }

  protected iniciarEdicion(item: ItemCatalogo): void {
    this.editandoId.set(item.id);
    this.editBuffer.set(item.nombre);
  }

  protected cancelarEdicion(): void {
    this.editandoId.set(null);
    this.editBuffer.set('');
  }

  protected async guardarEdicion(tab: Tab): Promise<void> {
    const id = this.editandoId();
    if (id === null) return;
    const nombre = this.editBuffer().trim();
    if (nombre.length < 2) {
      this.notify.warning('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    try {
      if (tab === 'categorias')      await this.catalogos.actualizarCategoria(id, nombre);
      else if (tab === 'marcas')    await this.catalogos.actualizarMarca(id, nombre);
      else                          await this.catalogos.actualizarAtributo(id, nombre);
      this.notify.success(`${this.tituloTab(tab)} actualizado.`);
      this.cancelarEdicion();
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo actualizar.');
    }
  }

  protected confirmarEliminar(item: ItemCatalogo, tab: Tab): void {
    this.confirmandoEliminar.set({ id: item.id, nombre: item.nombre, tab });
  }

  protected cancelarEliminar(): void {
    this.confirmandoEliminar.set(null);
  }

  protected async ejecutarEliminar(): Promise<void> {
    const target = this.confirmandoEliminar();
    if (!target) return;
    this.eliminando.set(true);
    try {
      if (target.tab === 'categorias')      await this.catalogos.eliminarCategoria(target.id);
      else if (target.tab === 'marcas')    await this.catalogos.eliminarMarca(target.id);
      else                                 await this.catalogos.eliminarAtributo(target.id);
      this.notify.success(`${target.nombre} eliminado.`);
      this.confirmandoEliminar.set(null);
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo eliminar.');
    } finally {
      this.eliminando.set(false);
    }
  }

  // ---------- Modal de valores ----------

  protected conteoValores(atributoId: number): number {
    return this.conteoValoresPorAtributo().get(atributoId) ?? 0;
  }

  protected async abrirValores(atributo: Atributo): Promise<void> {
    this.atributoConValores.set(atributo);
    this.nuevoValorNombre.set('');
    this.editandoValorId.set(null);
    this.confirmandoEliminarValor.set(null);
    this.cargandoValores.set(true);
    const lista = await this.catalogos.obtenerValoresDeAtributo(atributo.id, true);
    this.valoresVisibles.set(lista);
    this.cargandoValores.set(false);
  }

  protected cerrarValores(): void {
    this.atributoConValores.set(null);
    this.valoresVisibles.set([]);
  }

  protected async agregarValor(): Promise<void> {
    const a = this.atributoConValores();
    if (!a) return;
    const nombre = this.nuevoValorNombre().trim();
    if (nombre.length < 1) {
      this.notify.warning('Escribe un valor.');
      return;
    }
    this.guardandoValor.set(true);
    try {
      await this.catalogos.crearAtributoValor(a.id, nombre);
      // Refrescar la lista visible desde el cache del state.
      this.valoresVisibles.set(this.catalogos.valoresDeAtributo(a.id));
      this.nuevoValorNombre.set('');
      this.notify.success('Valor agregado.');
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo crear el valor.');
    } finally {
      this.guardandoValor.set(false);
    }
  }

  protected iniciarEdicionValor(v: AtributoValor): void {
    this.editandoValorId.set(v.id);
    this.editValorBuffer.set(v.nombre);
  }

  protected cancelarEdicionValor(): void {
    this.editandoValorId.set(null);
    this.editValorBuffer.set('');
  }

  protected async guardarEdicionValor(): Promise<void> {
    const a = this.atributoConValores();
    const id = this.editandoValorId();
    if (!a || id === null) return;
    const nombre = this.editValorBuffer().trim();
    if (nombre.length < 1) {
      this.notify.warning('Escribe un valor.');
      return;
    }
    try {
      await this.catalogos.actualizarAtributoValor(id, a.id, nombre);
      this.valoresVisibles.set(this.catalogos.valoresDeAtributo(a.id));
      this.cancelarEdicionValor();
      this.notify.success('Valor actualizado.');
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo actualizar.');
    }
  }

  protected confirmarEliminarValor(v: AtributoValor): void {
    this.confirmandoEliminarValor.set(v);
  }

  protected cancelarEliminarValor(): void {
    this.confirmandoEliminarValor.set(null);
  }

  protected async ejecutarEliminarValor(): Promise<void> {
    const a = this.atributoConValores();
    const v = this.confirmandoEliminarValor();
    if (!a || !v) return;
    this.eliminandoValor.set(true);
    try {
      await this.catalogos.eliminarAtributoValor(v.id, a.id);
      this.valoresVisibles.set(this.catalogos.valoresDeAtributo(a.id));
      this.confirmandoEliminarValor.set(null);
      this.notify.success('Valor eliminado.');
    } catch {
      this.notify.error(this.shell.error() ?? 'No se pudo eliminar (puede estar usado por productos).');
    } finally {
      this.eliminandoValor.set(false);
    }
  }

  protected tituloTab(tab: Tab): string {
    return tab === 'categorias' ? 'Categoría' : tab === 'marcas' ? 'Marca' : 'Atributo';
  }

  protected trackById(_: number, item: ItemCatalogo): number {
    return item.id;
  }

  protected trackByValorId(_: number, v: AtributoValor): number {
    return v.id;
  }

  /**
   * Devuelve el Atributo del state a partir del id. Usado por el template
   * para pasar el objeto entero al modal de valores.
   */
  protected atributoPorId(id: number): Atributo | null {
    return this.catalogos.atributos().find((a) => a.id === id) ?? null;
  }
}
