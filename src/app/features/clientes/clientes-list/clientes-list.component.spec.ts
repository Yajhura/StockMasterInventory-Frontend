/**
 * ClientesListComponent spec — N-2 audit: el directorio consume el
 * endpoint de similitud (JaroWinkler) cuando el operador busca un
 * cliente. Cubre los caminos criticos:
 *   - tipear en el input dispara buscarSimilares despues del debounce
 *   - la seccion "Clientes similares" se muestra cuando hay matches
 *   - si la busqueda substring ya devolvio un match exacto, la seccion
 *     de similares NO se muestra (es redundante)
 *   - si el usuario limpia los filtros, la seccion desaparece
 */
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ClientesListComponent } from './clientes-list.component';
import { ApiClientesService, ClienteSimilar } from '../../../core/api/api-clientes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/services/auth.service';
import { Cliente, PaginatedClientes } from '../../../core/models/cliente.models';

describe('ClientesListComponent — N-2 similitud en directorio', () => {
  let fixture: ComponentFixture<ClientesListComponent>;
  let component: ClientesListComponent;
  let apiClientes: jasmine.SpyObj<ApiClientesService>;

  const emptyPage: PaginatedClientes = {
    items: [],
    page: 1,
    size: 50,
    totalItems: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };

  function makeClient(id: number, nombre: string): Cliente {
    return {
      id,
      nombre,
      documento: null,
      telefono: null,
      email: null,
      direccion: null,
      tipoDocumentoId: 3,
      tipoDocumentoNombre: 'Sin doc.',
      creadoEn: '2026-09-27T00:00:00Z',
      tieneDeuda: false,
    };
  }

  beforeEach(() => {
    apiClientes = jasmine.createSpyObj<ApiClientesService>('ApiClientesService', [
      'listar', 'listarTiposDocumento', 'obtener', 'crear', 'actualizar',
      'eliminar', 'restaurar', 'exportarExcel', 'obtenerEstadoCuenta',
      'kpis', 'buscarSimilares',
    ]);
    apiClientes.listar.and.returnValue(of(emptyPage));
    apiClientes.listarTiposDocumento.and.returnValue(of([]));
    apiClientes.kpis.and.returnValue(of({
      totalClientes: 0, clientesConDeuda: 0, clientesSinDeuda: 0, nuevosEsteMes: 0,
    }));
    apiClientes.buscarSimilares.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [ClientesListComponent],
      providers: [
        provideRouter([]),
        { provide: ApiClientesService, useValue: apiClientes },
        { provide: NotificationService, useValue: { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') } },
        // Operador por default para no ejercitar paths de Admin (papelera, eliminar).
        {
          provide: AuthService,
          useValue: {
            esAdmin: () => false,
            rol: () => 'Operador',
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ClientesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('no llama a buscarSimilares cuando el termino tiene menos de 3 chars', fakeAsync(() => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'ab';
    input.dispatchEvent(new Event('input'));
    tick(250);
    fixture.detectChanges();

    expect(apiClientes.buscarSimilares).not.toHaveBeenCalled();
  }));

  it('llama a buscarSimilares despues del debounce cuando el termino tiene >= 3 chars', fakeAsync(() => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Juan Perez';
    input.dispatchEvent(new Event('input'));
    tick(250);
    fixture.detectChanges();

    expect(apiClientes.buscarSimilares).toHaveBeenCalledWith('Juan Perez', 70);
  }));

  it('muestra la seccion "Clientes similares" cuando hay matches y no hay match exacto', fakeAsync(() => {
    const similares: ClienteSimilar[] = [
      { id: 7, nombre: 'Juan Prez', documento: null, similitud: 92 },
      { id: 8, nombre: 'Juana Perez', documento: null, similitud: 81 },
    ];
    apiClientes.buscarSimilares.and.returnValue(of(similares));

    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Juan Perez';
    input.dispatchEvent(new Event('input'));
    tick(250);
    fixture.detectChanges();

    const instance = component as any;
    expect(instance.similares().length).toBe(2);
    expect(instance.qActual()).toBe('Juan Perez');

    const html = fixture.nativeElement as HTMLElement;
    const secciones = html.querySelectorAll('section');
    const seccionSimilares = Array.from(secciones).find(
      (s) => (s.textContent ?? '').includes('Clientes similares'),
    );
    expect(seccionSimilares).toBeDefined('la seccion de similares debe renderizarse cuando hay matches');
    expect(seccionSimilares!.textContent).toContain('Clientes similares');
    // Badge % similitud para cada candidato
    expect(seccionSimilares!.textContent).toContain('92% similitud');
    expect(seccionSimilares!.textContent).toContain('81% similitud');
  }));

  it('NO muestra la seccion cuando la busqueda substring ya devolvio el cliente exacto', fakeAsync(() => {
    // Substring devuelve al cliente exacto; similares devuelve matches
    // fuzzy que el operador no necesita ver (es redundante).
    const clienteExacto = makeClient(42, 'Juan Perez');
    apiClientes.listar.and.returnValue(of({
      ...emptyPage, items: [clienteExacto], totalItems: 1, totalPages: 1,
    }));
    apiClientes.buscarSimilares.and.returnValue(of([
      { id: 7, nombre: 'Juan Prez', documento: null, similitud: 92 },
    ]));

    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'juan perez'; // lowercase para verificar case-insensitive
    input.dispatchEvent(new Event('input'));
    tick(250);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    const seccion = html.querySelector('section.surface-card.border-l-amber-400');
    expect(seccion).toBeNull('la seccion debe estar oculta cuando hay match exacto');
  }));

  it('limpia la seccion de similares cuando el operador limpia los filtros', fakeAsync(() => {
    apiClientes.buscarSimilares.and.returnValue(of([
      { id: 7, nombre: 'Juan Prez', documento: null, similitud: 92 },
    ]));
    const instance = component as any;

    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Juan';
    input.dispatchEvent(new Event('input'));
    tick(250);
    fixture.detectChanges();

    expect(instance.similares().length).toBeGreaterThan(0);

    instance.limpiarFiltros();
    fixture.detectChanges();

    expect(instance.similares().length).toBe(0);
    expect(instance.qActual()).toBe('');
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('section.surface-card.border-l-amber-400')).toBeNull();
  }));

  it('click en un candidato similar abre el drawer de estado de cuenta del mismo id', fakeAsync(() => {
    apiClientes.buscarSimilares.and.returnValue(of([
      { id: 7, nombre: 'Juan Prez', documento: null, similitud: 92 },
    ]));
    // spyOn infiere `() => any` por default — casteamos para que acepte args.
    const verCuentaSpy = spyOn(component as any, 'verCuenta') as jasmine.Spy;

    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Juan';
    input.dispatchEvent(new Event('input'));
    tick(250);
    fixture.detectChanges();

    const html = fixture.nativeElement as HTMLElement;
    const secciones = html.querySelectorAll('section');
    const seccionSimilares = Array.from(secciones).find(
      (s) => (s.textContent ?? '').includes('Clientes similares'),
    );
    const boton = seccionSimilares!.querySelector('button') as HTMLButtonElement;
    expect(boton).not.toBeNull();
    boton.click();

    expect(verCuentaSpy).toHaveBeenCalledWith(7);
  }));
});