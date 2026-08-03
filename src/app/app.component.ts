import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './core/components/toast-host.component';

/**
 * Componente raiz. Solo renderiza el <router-outlet />.
 * El layout con header vive en AppShellComponent, que se monta
 * en las rutas autenticadas como contenedor padre.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent],
  template: `
    <router-outlet />
    <app-toast-host />
  `,
})
export class AppComponent {}
