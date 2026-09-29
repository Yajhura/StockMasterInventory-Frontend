# Adaptación Móvil Integral: Ventas, Cobranzas, Clientes, Configuración y Navegación

## Objetivo
Adaptar completamente para dispositivos móviles las secciones del sistema que aún carecen de experiencia táctil optimizada: Ventas (Punto de Venta), Cobranzas (Cuentas Corrientes), Clientes y Configuración, además de asegurar que la barra de navegación y el shell de la aplicación permitan acceder fluidamente a las 9 secciones del sistema desde smartphones y tablets.

## Contexto y Alcance
Actualmente, las secciones Inventario, Movimiento, Kardex, Reportes y Catálogo cuentan con layouts y vistas adaptadas a móviles (como alternancia Tarjetas/Tabla y grids responsivos).
Las secciones Ventas, Cobranzas y Clientes usan tablas tradicionales rígidas que requieren scroll horizontal excesivo en móviles y modales que no aprovechan el viewport reducido. Además, la barra de navegación inferior móvil en `AppShellComponent` solo tiene 6 accesos directos, dejando fuera Ventas, Cobranzas y Clientes.

## Tareas

- [x] `MOB-01`: **Navegación Móvil Integral en Shell** (`src/app/layout/app-shell.component.ts`)
  - Agregado botón de menú (hamburguesa) en el header móvil que despliega un drawer/panel lateral estilizado con acceso a los 9 módulos + catálogos auxiliares y sesión.
  - Actualizada la barra inferior móvil para alojar los 9 módulos principales con scroll suave (`no-scrollbar`) y círculo activo flotante con gradiente.
  - Verificado en navegadores y probado en resoluciones móviles.

- [x] `MOB-02`: **Adaptación Móvil de Clientes** (`src/app/features/clientes/clientes-list/`)
  - Implementada alternancia de vista `vistaModo` ('cards' | 'tabla') con tarjetas táctiles responsivas (badges de deuda, acciones de ver cuenta, llamar vía `tel:` y redactar email vía `mailto:`).
  - Integrado paginador para tarjetas y adaptados los modales de cliente a columnas responsivas.
  - Tests unitarios: 6 de 6 pasando.

- [x] `MOB-03`: **Adaptación Móvil de Ventas / Punto de Venta** (`src/app/features/ventas/punto-venta/`)
  - Implementada alternancia Tarjetas/Tabla en el historial de ventas con tarjetas táctiles (ID, fecha, cliente, montos destacados y botón para ver detalle).
  - Optimizado el modal POS (`isPosOpen`): contenedor del carrito con scroll horizontal limpio en móviles estrechos, botones de acción a ancho completo.
  - Optimizado el modal de detalle de venta con scroll táctil y headers responsivos.
  - Tests unitarios: 14 de 14 pasando.

- [x] `MOB-04`: **Adaptación Móvil de Cobranzas / Cuentas Corrientes** (`src/app/features/ventas/cuentas-corrientes/`)
  - Implementada alternancia Tarjetas/Tabla en la cartera de deudas con tarjetas táctiles destacando en rojo la deuda actual y botones "Ver" y "Abonar" táctiles.
  - Optimizado el modal de registro de abono con grilla de cuotas pendientes protegida contra overflow horizontal y botones de acción cómodos.
  - Tests unitarios: 15 de 15 pasando.

- [x] `MOB-05`: **Adaptación Móvil de Configuración y Verificación Global** (`src/app/features/config/`)
  - Ajustados formularios, carga de logo centrado y botones responsive en `config-page.component.html`.
  - Tests unitarios de configuración: 16 de 16 pasando.
  - Verificación global: `npm run build` exitoso (0 errores) y suite completa de tests `npx ng test` (137 de 137 tests exitosos).

## Criterios de Aceptación
1. [x] Todas las 9 secciones son 100% accesibles y navegables desde dispositivos móviles sin elementos rotos o desbordamientos indeseados.
2. [x] Clientes, Ventas y Cobranzas ofrecen vistas de tarjetas pensadas para móviles, respetando el diseño moderno (Tailwind, chips, bordes, sombras sutiles).
3. [x] Modales en Ventas (POS y Detalle) y Cobranzas (Abono) son utilizables en viewports reducidos (<= 400px ancho) con scroll interno y botones de acción accesibles.
4. [x] La suite de pruebas unitarias y el build pasan exitosamente sin errores (137 tests unitarios exitosos, build de producción en 6.8s).
