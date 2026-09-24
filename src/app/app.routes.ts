import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard, adminGuard, wacReportesGuard } from './core/guards/auth.guard';

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
        // WAC-03 — WAC-aware profitability grid. Its availability is
        // controlled by the staged-rollout feature flag.
        path: 'reportes/rentabilidad-wac',
        canActivate: [wacReportesGuard],
        loadComponent: () =>
          import('./features/reportes/wac/wac-rentabilidad-page.component').then((m) => m.WacRentabilidadPageComponent),
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
      {
        path: 'clientes',
        loadComponent: () =>
          import('./features/clientes/clientes-list/clientes-list.component').then((m) => m.ClientesListComponent),
      },
      {
        path: 'punto-venta',
        loadComponent: () =>
          import('./features/ventas/punto-venta/punto-venta.component').then((m) => m.PuntoVentaComponent),
      },
      {
        path: 'cuentas-corrientes',
        loadComponent: () =>
          import('./features/ventas/cuentas-corrientes/cuentas-corrientes.component').then((m) => m.CuentasCorrientesComponent),
      },
      {
        path: 'design-system',
        loadComponent: () =>
          import('./features/design-system/design-system.page.component').then((m) => m.DesignSystemPageComponent),
      },
    ],
  },

  { path: '', redirectTo: 'inventario', pathMatch: 'full' },
  { path: '**', redirectTo: 'inventario' },
];
