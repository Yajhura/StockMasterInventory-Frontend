import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfigPublicaService } from '../../core/api/config-publica.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfigPublica } from '../../core/models/config-publica.model';

/**
 * Tope del logo. El backend no limita `LogoBase64` (lo limita el body
 * size de Kestrel), pero 2MB es el limite que anuncia esta pantalla:
 * pasado ese punto el base64 (~1.33x el binario) ya es un payload
 * ridiculo para un request de admin.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * ConfigPageComponent (CFG-09).
 *
 * Edita la fila unica de configuracion publica que consume la landing
 * via `GET /api/public/config`. Los limites de longitud de los
 * validators espejan los `StringLength` de `ActualizarConfigRequest`
 * (backend/.../Features/Config/ConfigEndpoints.cs) para que un payload
 * invalido se frene aca y no viaje a un 400.
 */
@Component({
  selector: 'app-config-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './config-page.component.html',
  styleUrls: ['./config-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ConfigPublicaService);
  private readonly notify = inject(NotificationService);

  protected readonly cargando = signal<boolean>(true);
  protected readonly procesando = signal<boolean>(false);

  /**
   * Snapshot del ultimo estado known-good (lo que devuelve el servidor).
   * Es contra este snapshot que `cancelar()` revierte: un `reset()` a
   * los valores iniciales del form dejaria el formulario en blanco y
   * obligaria a un round-trip para recuperar lo ya cargado.
   */
  private readonly estadoCargado = signal<ConfigPublica | null>(null);

  // El form se declara ANTES de los toSignal de abajo: los initializers
  // de clase corren en orden, y los toSignal leen `this.form.controls`
  // en el momento de inicializarse.
  protected readonly form = this.fb.nonNullable.group({
    nombreMarca: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.email, Validators.maxLength(200)]],
    telefono: ['', [Validators.maxLength(50)]],
    horarioAtencion: ['', [Validators.maxLength(200)]],
    direccion: ['', [Validators.maxLength(300)]],
    ruc: ['', [Validators.maxLength(20)]],
    logoBase64: [''],
    logoMime: ['', [Validators.maxLength(100)]],
  });

  /**
   * Los controles de logo no son signals, asi que para que el `src` del
   * `<img>` reaccione al patch inicial y a cada carga nueva usamos
   * `toSignal` sobre `valueChanges` (mismo patron que PuntoVentaComponent
   * con `formValue`). `patchValue`/`reset` emiten `valueChanges` por
   * default, asi que el primer GET tambien dispara la actualizacion.
   */
  private readonly logoBase64Signal = toSignal(this.form.controls.logoBase64.valueChanges, {
    initialValue: this.form.controls.logoBase64.value,
  });
  private readonly logoMimeSignal = toSignal(this.form.controls.logoMime.valueChanges, {
    initialValue: this.form.controls.logoMime.value,
  });

  /**
   * `form.invalid` no es un signal: con OnPush, el `[disabled]` del
   * submit queda congelado en el ultimo render cuando el estado del
   * form cambia por codigo (el `patchValue` post-GET, el `reset` que
   * dispara `cancelar`, el re-patch que hace `aplicar` tras guardar).
   * Con un signal derivado de `statusChanges` la vista se marca dirty
   * sola y el boton refleja el estado real. (Escribir en el input si
   * dispara CD por ser un evento del template; el problema es solo el
   * camino programatico.)
   */
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  protected readonly formValido = computed<boolean>(() => this.formStatus() === 'VALID');

  /** Base64 crudo tal como viaja al backend (SIN prefijo `data:`). */
  protected readonly logoBase64 = computed<string>(() => (this.logoBase64Signal() ?? '').trim());
  protected readonly logoMime = computed<string>(() => (this.logoMimeSignal() ?? '').trim());

  /**
   * Data URL para el preview. `null` cuando no hay logo cargado: el
   * template cae al placeholder en vez de renderizar un `<img src="">`
   * (que el browser resuelve como request a la pagina actual).
   */
  protected readonly logoSrc = computed<string | null>(() => {
    const base64 = this.logoBase64();
    const mime = this.logoMime();
    if (!base64 || !mime) return null;
    return `data:${mime};base64,${base64}`;
  });

  /** El `src` actual fallo en cargar (base64 corrupto en la base). */
  protected readonly logoRoto = signal<boolean>(false);

  /** Timestamp del ultimo guardado que confirmo el servidor. */
  protected readonly ultimaModificacion = computed<string | null>(
    () => this.estadoCargado()?.modificadoEn ?? null
  );

  constructor() {
    // Un logo nuevo siempre arranca "no roto". Sin esto, si el admin
    // carga un base64 roto y despues sube uno valido, el placeholder
    // seguiria tapando el preview nuevo.
    effect(
      () => {
        this.logoSrc();
        untracked(() => this.logoRoto.set(false));
      },
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (cfg) => {
        this.aplicar(cfg);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.notify.error('No se pudo cargar la configuración.');
      },
    });
  }

  // -------------------------------------------------------------------
  //  Acciones
  // -------------------------------------------------------------------

  protected guardar(): void {
    if (this.procesando()) return;

    if (!this.formValido()) {
      this.form.markAllAsTouched();
      this.notify.error('Revisá los campos marcados antes de guardar.');
      return;
    }

    this.procesando.set(true);
    this.api.update(this.construirPayload()).subscribe({
      next: (cfg) => {
        this.procesando.set(false);
        // Re-sincronizamos contra la respuesta del servidor: el backend
        // hace Trim y colapsa vacios a null, asi que el form puede tener
        // "  " donde la base guardo null.
        this.aplicar(cfg);
        this.notify.success('Configuración guardada.');
      },
      error: () => {
        this.procesando.set(false);
        this.notify.error('No se pudo guardar la configuración.');
      },
    });
  }

  protected cancelar(): void {
    const base = this.estadoCargado();
    if (!base) return;
    this.form.reset(this.aValoresForm(base));
    this.notify.info('Se descartaron los cambios sin guardar.');
  }

  protected quitarLogo(): void {
    this.form.patchValue({ logoBase64: '', logoMime: '' });
  }

  /**
   * Carga de logo. Valida tipo y tamano ANTES de leer el archivo: leer
   * 40MB para despues tirarlo abajo es trabajo gratis que el navegador
   * paga en el hilo principal.
   */
  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.notify.error('El logo debe ser una imagen (PNG, JPG o SVG).');
      this.limpiarInput(input);
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      this.notify.error('El logo no puede pesar más de 2 MB.');
      this.limpiarInput(input);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      this.notify.error('No se pudo leer el archivo seleccionado.');
      this.limpiarInput(input);
    };
    reader.onload = () => {
      const resultado = typeof reader.result === 'string' ? reader.result : '';
      // readAsDataURL devuelve `data:<mime>;base64,<payload>`. El backend
      // guarda base64 PURO, asi que cortamos el prefijo aca. Mandar el
      // data URL entero duplicaria el header en cada request y el `<img>`
      // de la landing no renderizaria (no es un data URL valido).
      const coma = resultado.indexOf(',');
      const base64 = coma >= 0 ? resultado.slice(coma + 1) : resultado;
      if (!base64) {
        this.notify.error('El archivo seleccionado está vacío.');
        this.limpiarInput(input);
        return;
      }
      this.form.patchValue({ logoBase64: base64, logoMime: file.type });
      this.form.controls.logoBase64.markAsDirty();
      this.form.controls.logoMime.markAsDirty();
      this.limpiarInput(input);
    };
    reader.readAsDataURL(file);
  }

  protected onLogoError(): void {
    this.logoRoto.set(true);
  }

  // -------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------

  /**
   * Normaliza el shape del backend (donde Email/Telefono/Horario/
   * Direccion son `string` no-nullables y llegan como `""` cuando estan
   * vacios — ver `ConfigEndpoints.Mapear`) a los strings del form.
   */
  private aValoresForm(cfg: ConfigPublica) {
    return {
      nombreMarca: (cfg.nombreMarca ?? '').trim(),
      email: (cfg.email ?? '').trim(),
      telefono: (cfg.telefono ?? '').trim(),
      horarioAtencion: (cfg.horarioAtencion ?? '').trim(),
      direccion: (cfg.direccion ?? '').trim(),
      ruc: (cfg.ruc ?? '').trim(),
      logoBase64: (cfg.logoBase64 ?? '').trim(),
      logoMime: (cfg.logoMime ?? '').trim(),
    };
  }

  /**
   * Payload del PUT. Vacio/espacios colapsan a `null` para que el
   * backend no guarde strings de espacios (su `Normalizar` hace lo
   * mismo, pero asi el payload que mandamos en tests y logs ya es
   * consistente). `modificadoEn` no lo usa el binder
   * (`ActualizarConfigRequest` no lo expone) pero viaja por shape.
   */
  private construirPayload(): ConfigPublica {
    const v = this.form.getRawValue();
    const vacioANull = (s: string): string | null => {
      const t = s.trim();
      return t.length > 0 ? t : null;
    };

    return {
      nombreMarca: v.nombreMarca.trim(),
      email: vacioANull(v.email),
      telefono: vacioANull(v.telefono),
      horarioAtencion: vacioANull(v.horarioAtencion),
      direccion: vacioANull(v.direccion),
      ruc: vacioANull(v.ruc),
      logoMime: vacioANull(v.logoMime),
      logoBase64: vacioANull(v.logoBase64),
      modificadoEn: this.estadoCargado()?.modificadoEn ?? null,
    };
  }

  private aplicar(cfg: ConfigPublica): void {
    this.estadoCargado.set(cfg);
    this.form.reset(this.aValoresForm(cfg));
  }

  /**
   * Limpia el `<input type="file">` para que re-seleccionar el mismo
   * archivo dispare `change` de nuevo (si no lo limpies, el navegador
   * considera que el valor no cambio y no emite nada).
   */
  private limpiarInput(input: HTMLInputElement): void {
    input.value = '';
  }
}
