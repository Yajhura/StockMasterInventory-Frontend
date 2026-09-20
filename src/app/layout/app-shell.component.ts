import {
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { KardexState } from '../core/state/kardex.state';
import { ProductosState } from '../core/state/productos.state';
import { ShellState } from '../core/state/shell.state';
import { AuthService } from '../core/services/auth.service';
import { NuevoProductoComponent } from '../features/nuevo-producto/nuevo-producto.component';
import { KardexModalComponent } from '../core/components/kardex-modal.component';

/**
 * Shell autenticado: header sticky + outlet para Dashboard/Reportes/Kardex.
 * Vive en una ruta padre, asi el LoginComponent queda sin header.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NuevoProductoComponent, KardexModalComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-slate-50/50">
      <header class="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200/70">
        <div class="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
          <a class="flex items-center gap-2.5 group" href="/inventario">
            <span
              class="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm shadow-blue-600/30 text-white transition-transform duration-200 group-hover:scale-105"
              aria-hidden="true"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" />
              </svg>
            </span>
            <div class="flex flex-col leading-tight">
              <span class="text-[17px] font-extrabold tracking-tight text-slate-900">StockMaster</span>
              <span class="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold hidden sm:inline-block">Inventory v1.0</span>
            </div>
          </a>

          <!-- Tabs Navegación Escritorio (Ocultos en Móvil) -->
          <nav class="hidden md:flex ml-6 items-center gap-1" role="tablist" aria-label="Navegación principal">
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabInventarioActivo()"
              [attr.aria-selected]="tabInventarioActivo()"
              (click)="irAInventario()"
            >
              Inventario
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabMovimientoActivo()"
              [attr.aria-selected]="tabMovimientoActivo()"
              (click)="irAMovimiento()"
            >
              Movimiento
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabVentasActivo()"
              [attr.aria-selected]="tabVentasActivo()"
              (click)="irAPuntoVenta()"
            >
              Ventas
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabCuentasActivo()"
              [attr.aria-selected]="tabCuentasActivo()"
              (click)="irACuentasCorrientes()"
            >
              Cobranzas
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabClientesActivo()"
              [attr.aria-selected]="tabClientesActivo()"
              (click)="irAClientes()"
            >
              Clientes
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabKardexActivo()"
              [attr.aria-selected]="tabKardexActivo()"
              (click)="irAKardex()"
            >
              Kardex
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabReportesActivo()"
              [attr.aria-selected]="tabReportesActivo()"
              (click)="irAReportes()"
            >
              Reportes
            </button>
            <button
              type="button"
              role="tab"
              [class.nav-tab]="true"
              [class.nav-tab-active]="tabCatalogoActivo()"
              [attr.aria-selected]="tabCatalogoActivo()"
              (click)="irACatalogo()"
            >
              Catálogo
            </button>
          </nav>

          <div class="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              class="grid place-items-center w-10 h-10 rounded-lg transition-colors"
              [ngClass]="enCatalogos()
                ? 'text-blue-600 bg-blue-50 ring-1 ring-inset ring-blue-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'"
              [attr.aria-label]="'Configuración' + (enCatalogos() ? ' (activo)' : '')"
              [attr.aria-current]="enCatalogos() ? 'page' : null"
              [title]="enCatalogos() ? 'Configuración / Catálogos (activo)' : 'Configuración / Catálogos'"
              (click)="irACatalogos()"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
              </svg>
            </button>

            <div class="w-px h-8 bg-slate-200" aria-hidden="true"></div>

            <div class="relative" #userMenu>
              <button
                type="button"
                class="flex items-center gap-2 pl-1 pr-2 sm:pr-3 h-10 rounded-full hover:bg-slate-100 transition-colors"
                (click)="toggleMenu($event)"
                [attr.aria-expanded]="menuAbierto()"
                aria-haspopup="menu"
              >
                <span class="grid place-items-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white text-xs font-bold ring-2 ring-white">
                  {{ iniciales() }}
                </span>
                <span class="hidden sm:flex flex-col items-start leading-tight">
                  <span class="text-xs font-semibold text-slate-900">{{ auth.currentUser()?.nombreCompleto ?? 'Usuario' }}</span>
                  <span class="text-[10px] text-slate-500">{{ auth.currentUser()?.rol ?? '—' }}</span>
                </span>
              </button>

              @if (menuAbierto()) {
                <div
                  class="absolute right-0 top-12 w-64 surface-card p-1.5 z-50 shadow-xl"
                  role="menu"
                >
                  <div class="px-3 py-2.5 border-b border-slate-100">
                    <p class="text-xs font-semibold text-slate-900 truncate">
                      {{ auth.currentUser()?.nombreCompleto }}
                    </p>
                    <p class="text-[11px] text-slate-500 truncate">
                      {{ auth.currentUser()?.email }}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    class="w-full flex items-center justify-center gap-2.5 px-3 py-2 mt-1 rounded-md text-sm text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    (click)="cerrarSesion()"
                    [disabled]="auth.cargandoLogout()"
                  >
                    @if (auth.cargandoLogout()) {
                      <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>
                      Cerrando sesión...
                    } @else {
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Cerrar sesión
                    }
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      </header>

      <!-- Contenido Principal (con padding inferior suficiente para la barra móvil) -->
      <main class="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-5 sm:py-8 pb-24 md:pb-8">
        <router-outlet />
      </main>

      <!-- BARRA DE NAVEGACIÓN MÓVIL INFERIOR CON CÍRCULO FLOTANTE DINÁMICO -->
      <nav class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] flex items-center justify-around h-16 px-1" role="navigation" aria-label="Navegación móvil">
        <!-- Item 1: Inventario -->
        <button
          type="button"
          class="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative"
          (click)="irAInventario()"
        >
          @if (tabInventarioActivo()) {
            <div class="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center border-2 border-white scale-105 transition-all">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                <path d="m3.3 7 8.7 5 8.7-5"/>
                <path d="M12 22V12"/>
              </svg>
            </div>
            <span class="text-[10px] font-bold text-blue-600 tracking-tight mt-0.5">Inventario</span>
          } @else {
            <svg class="w-5 h-5 mb-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="M12 22V12"/>
            </svg>
            <span class="text-[10px] font-medium text-slate-400 tracking-tight">Inventario</span>
          }
        </button>

        <!-- Item 2: Movimiento -->
        <button
          type="button"
          class="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative"
          (click)="irAMovimiento()"
        >
          @if (tabMovimientoActivo()) {
            <div class="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center border-2 border-white scale-105 transition-all">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 16V4M7 4L3 8M7 4L11 8"/>
                <path d="M17 8V20M17 20L21 16M17 20L13 16"/>
              </svg>
            </div>
            <span class="text-[10px] font-bold text-blue-600 tracking-tight mt-0.5">Movimiento</span>
          } @else {
            <svg class="w-5 h-5 mb-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 16V4M7 4L3 8M7 4L11 8"/>
              <path d="M17 8V20M17 20L21 16M17 20L13 16"/>
            </svg>
            <span class="text-[10px] font-medium text-slate-400 tracking-tight">Movimiento</span>
          }
        </button>

        <!-- Item 3: Kardex -->
        <button
          type="button"
          class="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative"
          (click)="irAKardex()"
        >
          @if (tabKardexActivo()) {
            <div class="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center border-2 border-white scale-105 transition-all">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <span class="text-[10px] font-bold text-blue-600 tracking-tight mt-0.5">Kardex</span>
          } @else {
            <svg class="w-5 h-5 mb-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span class="text-[10px] font-medium text-slate-400 tracking-tight">Kardex</span>
          }
        </button>

        <!-- Item 4: Catálogo -->
        <button
          type="button"
          class="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative"
          (click)="irACatalogo()"
        >
          @if (tabCatalogoActivo()) {
            <div class="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center border-2 border-white scale-105 transition-all">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
              </svg>
            </div>
            <span class="text-[10px] font-bold text-blue-600 tracking-tight mt-0.5">Catálogo</span>
          } @else {
            <svg class="w-5 h-5 mb-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span class="text-[10px] font-medium text-slate-400 tracking-tight">Catálogo</span>
          }
        </button>

        <!-- Item 5: Reportes -->
        <button
          type="button"
          class="flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative"
          (click)="irAReportes()"
        >
          @if (tabReportesActivo()) {
            <div class="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center border-2 border-white scale-105 transition-all">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <span class="text-[10px] font-bold text-blue-600 tracking-tight mt-0.5">Reportes</span>
          } @else {
            <svg class="w-5 h-5 mb-0.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            <span class="text-[10px] font-medium text-slate-400 tracking-tight">Reportes</span>
          }
        </button>
      </nav>

      <footer class="hidden md:block border-t border-slate-200/70 bg-white/60 backdrop-blur-md">
        <div class="max-w-[1440px] mx-auto px-6 lg:px-10 h-14 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p>© 2026 StockMaster. Neuralnova Systems. Todos los derechos reservados.</p>
          <nav class="flex items-center gap-5">
            <a class="hover:text-slate-900 transition-colors" href="#">Términos de Servicio</a>
            <a class="hover:text-slate-900 transition-colors" href="#">Política de Privacidad</a>
            <a class="hover:text-slate-900 transition-colors" href="#">Soporte Técnico</a>
          </nav>
        </div>
      </footer>
    </div>

    @if (shell.modalNuevoProductoAbierto()) {
      <app-nuevo-producto [productoId]="shell.productoEditandoId()" />
    }

    <app-kardex-modal />
  `,
})
export class AppShellComponent implements OnInit {
  protected readonly shell = inject(ShellState);
  protected readonly kardex = inject(KardexState);
  protected readonly productos = inject(ProductosState);
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly menuAbierto = signal<boolean>(false);
  /** Ruta actual normalizada (sin query/fragment). */
  protected readonly rutaActiva = signal<string>(this.router.url);

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => this.rutaActiva.set((e as NavigationEnd).urlAfterRedirects));
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      const url = this.router.url;
      if (url === '/' || url === '/inventario') {
        this.router.navigateByUrl('/movimiento');
      }
    }
  }

  protected readonly enCatalogos = computed<boolean>(() =>
    this.rutaActiva().startsWith('/catalogos')
  );

  protected readonly searchPlaceholder = computed(() => {
    if (this.enCatalogos()) return 'Buscar en catalogos...';
    return this.shell.activeView() === 'inventario' ? 'Buscar (Ctrl+K)' : 'Buscar...';
  });

  protected readonly iniciales = computed(() => {
    const nombre = this.auth.currentUser()?.nombreCompleto ?? '?';
    const parts = nombre.trim().split(/\s+/);
    const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
    return letters.toUpperCase() || 'U';
  });

  protected readonly tabInventarioActivo = computed<boolean>(() => {
    const url = this.rutaActiva();
    return url.startsWith('/inventario') && !this.enCatalogos();
  });

  protected readonly tabMovimientoActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/movimiento') && !this.enCatalogos()
  );

  protected readonly tabVentasActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/punto-venta') && !this.enCatalogos()
  );

  protected readonly tabCuentasActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/cuentas-corrientes') && !this.enCatalogos()
  );

  protected readonly tabClientesActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/clientes') && !this.enCatalogos()
  );

  protected readonly tabKardexActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/kardex') && !this.enCatalogos()
  );

  protected readonly tabReportesActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/reportes') && !this.enCatalogos()
  );

  protected readonly tabCatalogoActivo = computed<boolean>(() =>
    this.rutaActiva().startsWith('/catalogo')
  );

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuAbierto.update((v) => !v);
  }

  protected irACatalogos(): void {
    this.menuAbierto.set(false);
    this.router.navigateByUrl('/catalogos');
  }

  protected irAInventario(): void {
    this.shell.setActiveView('inventario');
    this.router.navigateByUrl('/inventario');
  }

  protected irAMovimiento(): void {
    this.router.navigateByUrl('/movimiento');
  }

  protected irAKardex(): void {
    this.shell.setActiveView('kardex' as any);
    this.router.navigateByUrl('/kardex');
  }

  protected irAReportes(): void {
    this.shell.setActiveView('reportes');
    this.router.navigateByUrl('/reportes');
  }

  protected irACatalogo(): void {
    this.menuAbierto.set(false);
    this.router.navigateByUrl('/catalogo');
  }

  protected irAClientes(): void {
    this.menuAbierto.set(false);
    this.router.navigateByUrl('/clientes');
  }

  protected irAPuntoVenta(): void {
    this.menuAbierto.set(false);
    this.router.navigateByUrl('/punto-venta');
  }

  protected irACuentasCorrientes(): void {
    this.menuAbierto.set(false);
    this.router.navigateByUrl('/cuentas-corrientes');
  }

  protected cerrarSesion(): void {
    this.menuAbierto.set(false);
    this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuAbierto()) return;
    const target = event.target as Node;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.menuAbierto.set(false);
    }
  }
}
