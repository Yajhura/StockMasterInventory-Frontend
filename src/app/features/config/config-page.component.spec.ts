/**
 * ConfigPageComponent spec (CFG-11).
 *
 * Cubre los caminos que no se pueden verificar a ojo:
 *   - la carga inicial pega el GET y parchea el form (incluyendo el
 *     caso donde el backend devuelve "" en vez de null para los campos
 *     NOT NULL del record)
 *   - el PUT sale con el payload armado desde el form, no con el objeto
 *     crudo de la respuesta
 *   - el preview arma el data URL con el prefijo correcto, y el
 *     placeholder reaparece si el base64 no carga
 *   - el guard de archivo (tipo + 2 MB) rechaza SIN tocar el form
 *   - el submit queda deshabilitado mientras el form es invalido
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ConfigPageComponent, LOGO_MAX_BYTES } from './config-page.component';
import { ConfigPublicaService } from '../../core/api/config-publica.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfigPublica } from '../../core/models/config-publica.model';

describe('ConfigPageComponent (CFG-09/CFG-10/CFG-11)', () => {
  let fixture: ComponentFixture<ConfigPageComponent>;
  let component: ConfigPageComponent;
  /**
   * El componente expone form/señales como `protected` (mismo criterio
   * que ClientesListComponent.formCliente), asi que el spec castea una
   * sola vez en vez de repetir `as any` en cada assertion.
   */
  let comp: any;
  let api: jasmine.SpyObj<ConfigPublicaService>;
  let notify: {
    success: jasmine.Spy;
    error: jasmine.Spy;
    info: jasmine.Spy;
    warning: jasmine.Spy;
  };

  const configServidor: ConfigPublica = {
    nombreMarca: 'CHESLO',
    email: 'ventas@cheslo.pe',
    telefono: '+51 926 938 985',
    horarioAtencion: 'Lunes a Domingo: 8:00 AM - 10:00 PM',
    direccion: 'Lima, Perú',
    ruc: null,
    logoMime: null,
    logoBase64: null,
    modificadoEn: '2026-09-28T15:00:00Z',
  };

  /** Inyecta un archivo en el input y dispara `change`, como el browser. */
  function seleccionarArchivo(input: HTMLInputElement, file: File): void {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }

  /**
   * Espera a que el FileReader dispare onload. Un solo setTimeout(0) no
   * alcanza: la lectura del blob pasa por mas de una macrotask en Chrome,
   * asi que el helper sondea la condicion en vez de fijar un delay.
   */
  async function esperarHasta(cond: () => boolean, intentos = 100): Promise<void> {
    for (let i = 0; i < intentos; i++) {
      if (cond()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('esperarHasta: la condicion no se cumplio a tiempo');
  }

  function inputArchivo(): HTMLInputElement {
    return fixture.nativeElement.querySelector('#cfg-logo') as HTMLInputElement;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ConfigPublicaService>('ConfigPublicaService', ['get', 'update']);
    api.get.and.returnValue(of({ ...configServidor }));
    api.update.and.callFake((cfg: ConfigPublica) => of({ ...cfg }));

    notify = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
      info: jasmine.createSpy('info'),
      warning: jasmine.createSpy('warning'),
    };

    TestBed.configureTestingModule({
      imports: [ConfigPageComponent],
      providers: [
        { provide: ConfigPublicaService, useValue: api },
        { provide: NotificationService, useValue: notify },
      ],
    });

    fixture = TestBed.createComponent(ConfigPageComponent);
    component = fixture.componentInstance;
    comp = component as any;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------
  //  Carga inicial
  // -----------------------------------------------------------------

  it('hace GET en ngOnInit y parchea el form con la respuesta', () => {
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(comp.form.controls.nombreMarca.value).toBe('CHESLO');
    expect(comp.form.controls.email.value).toBe('ventas@cheslo.pe');
    expect(comp.form.controls.telefono.value).toBe('+51 926 938 985');
    expect(comp.form.controls.horarioAtencion.value).toBe('Lunes a Domingo: 8:00 AM - 10:00 PM');
    expect(comp.form.controls.direccion.value).toBe('Lima, Perú');
    expect(comp.cargando()).toBe(false);
  });

  it('convierte los null del backend en strings vacios en el form', () => {
    expect(comp.form.controls.ruc.value).toBe('');
    expect(comp.form.controls.logoBase64.value).toBe('');
    expect(comp.form.controls.logoMime.value).toBe('');
  });

  it('muestra un toast de error y destraba la pantalla si el GET falla', () => {
    // Re-armamos el fixture con un GET que falla.
    api.get.and.returnValue(throwError(() => new Error('boom')));
    const fixture2 = TestBed.createComponent(ConfigPageComponent);
    fixture2.detectChanges();

    expect(notify.error).toHaveBeenCalledWith('No se pudo cargar la configuración.');
    expect((fixture2.componentInstance as any).cargando()).toBe(false);
    fixture2.destroy();
  });

  // -----------------------------------------------------------------
  //  Guardar
  // -----------------------------------------------------------------

  it('guardar() hace PUT con el payload armado desde el form', () => {
    comp.form.patchValue({
      nombreMarca: '  CHESLO PERU  ',
      telefono: '999 888 777',
      ruc: '   ',
    });
    comp.guardar();

    expect(api.update).toHaveBeenCalledTimes(1);
    const payload = api.update.calls.mostRecent().args[0];
    // Trim en nombreMarca; vacio/espacios colapsan a null en ruc.
    expect(payload.nombreMarca).toBe('CHESLO PERU');
    expect(payload.telefono).toBe('999 888 777');
    expect(payload.ruc).toBeNull();
    // Los campos que no se tocaron se reenvian desde el form.
    expect(payload.email).toBe('ventas@cheslo.pe');
    expect(payload.direccion).toBe('Lima, Perú');
    expect(payload.logoBase64).toBeNull();
    expect(notify.success).toHaveBeenCalledWith('Configuración guardada.');
  });

  it('no guarda si el form es invalido y avisa al usuario', () => {
    comp.form.patchValue({ email: 'no-es-un-email' });
    comp.guardar();

    expect(api.update).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('Revisá los campos marcados antes de guardar.');
    expect(comp.procesando()).toBe(false);
  });

  it('muestra toast de error si el PUT falla y rehabilita el boton', () => {
    api.update.and.returnValue(throwError(() => new Error('boom')));
    comp.guardar();

    expect(notify.error).toHaveBeenCalledWith('No se pudo guardar la configuración.');
    expect(comp.procesando()).toBe(false);
  });

  it('cancelar() revierte el form contra el ultimo estado del servidor', () => {
    comp.form.patchValue({ nombreMarca: 'BORRADOR', email: 'borrador@x.com' });
    comp.cancelar();

    expect(comp.form.controls.nombreMarca.value).toBe('CHESLO');
    expect(comp.form.controls.email.value).toBe('ventas@cheslo.pe');
    expect(api.update).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  //  Logo: validacion, base64 y preview
  // -----------------------------------------------------------------

  it('rechaza archivos que no son imagen y NO toca el form', () => {
    const antes = comp.form.controls.logoBase64.value;
    seleccionarArchivo(
      inputArchivo(),
      new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })
    );

    expect(notify.error).toHaveBeenCalledWith('El logo debe ser una imagen (PNG, JPG o SVG).');
    expect(comp.form.controls.logoBase64.value).toBe(antes);
    expect(comp.form.controls.logoMime.value).toBe('');
  });

  it('rechaza imagenes de mas de 2 MB y NO toca el form', () => {
    const antes = comp.form.controls.logoBase64.value;
    const grande = new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'logo.png', { type: 'image/png' });
    expect(grande.size).toBeGreaterThan(LOGO_MAX_BYTES);

    seleccionarArchivo(inputArchivo(), grande);

    expect(notify.error).toHaveBeenCalledWith('El logo no puede pesar más de 2 MB.');
    expect(comp.form.controls.logoBase64.value).toBe(antes);
    expect(comp.form.controls.logoMime.value).toBe('');
  });

  it('acepta una imagen valida y guarda el base64 SIN el prefijo data:', async () => {
    seleccionarArchivo(inputArchivo(), new File(['FAKEPNG'], 'logo.png', { type: 'image/png' }));
    await esperarHasta(() => comp.form.controls.logoBase64.value !== '');

    expect(comp.form.controls.logoBase64.value).toBe(btoa('FAKEPNG'));
    expect(comp.form.controls.logoBase64.value).not.toContain('data:');
    expect(comp.form.controls.logoMime.value).toBe('image/png');
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('logoSrc() arma el data URL a partir de mime + base64', () => {
    expect(comp.logoSrc()).toBeNull();

    comp.form.patchValue({ logoBase64: 'QUJD', logoMime: 'image/png' });

    expect(comp.logoSrc()).toBe('data:image/png;base64,QUJD');
  });

  it('el preview cae al placeholder si el data URL no carga', () => {
    comp.form.patchValue({ logoBase64: 'QUJD', logoMime: 'image/png' });
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('data:image/png;base64,QUJD');

    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(comp.logoRoto()).toBe(true);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Logo no válido');
  });

  it('subir un logo nuevo resetea el estado "roto" del preview', () => {
    comp.form.patchValue({ logoBase64: 'QUJD', logoMime: 'image/png' });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(comp.logoRoto()).toBe(true);

    // Base64 nuevo -> el placeholder se levanta solo.
    comp.form.patchValue({ logoBase64: 'WFla', logoMime: 'image/png' });
    fixture.detectChanges();

    expect(comp.logoRoto()).toBe(false);
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,WFla');
  });

  it('quitarLogo() limpia mime y base64 del form', () => {
    comp.form.patchValue({ logoBase64: 'QUJD', logoMime: 'image/png' });
    comp.quitarLogo();

    expect(comp.form.controls.logoBase64.value).toBe('');
    expect(comp.form.controls.logoMime.value).toBe('');
    expect(comp.logoSrc()).toBeNull();
  });

  // -----------------------------------------------------------------
  //  Estado del submit
  // -----------------------------------------------------------------

  it('deshabilita el submit mientras el form es invalido', () => {
    fixture.detectChanges();
    const boton = fixture.nativeElement.querySelector('#cfg-guardar') as HTMLButtonElement;
    expect(boton.disabled).toBe(false);

    comp.form.patchValue({ nombreMarca: '' });
    fixture.detectChanges();
    expect(boton.disabled).toBe(true);

    comp.form.patchValue({ nombreMarca: 'CHESLO' });
    fixture.detectChanges();
    expect(boton.disabled).toBe(false);
  });

  it('deshabilita el submit mientras se esta guardando', () => {
    api.update.and.returnValue(of({ ...configServidor }));
    comp.form.patchValue({ nombreMarca: 'OTRA' });
    comp.procesando.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector('#cfg-guardar') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });
});
