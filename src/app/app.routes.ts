import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Rutas publicas (sin header)
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },

  // Rutas autenticadas: usan AppShellComponent como layout (header + footer)
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'inventario',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'movimiento',
        loadComponent: () =>
          import('./features/movimiento/movimiento.component').then((m) => m.MovimientoComponent),
      },
      {
        path: 'kardex',
        loadComponent: () =>
          import('./features/kardex/kardex-page.component').then((m) => m.KardexPageComponent),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
      {
        path: 'catalogo',
        loadComponent: () =>
          import('./features/catalogo/catalogo.component').then((m) => m.CatalogoComponent),
      },
      {
        path: 'reportes/auditoria',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/auditoria/auditoria.component').then((m) => m.AuditoriaComponent),
      },
      {
        path: 'catalogos',
        loadComponent: () =>
          import('./features/catalogos/catalogos-page.component').then((m) => m.CatalogosPageComponent),
      },
    ],
  },

  { path: '', redirectTo: 'inventario', pathMatch: 'full' },
  { path: '**', redirectTo: 'inventario' },
];
