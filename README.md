# StockMaster — Frontend (Angular 17 + Standalone Components)

Aplicación web funcional del dashboard **StockMaster** construida sobre la maqueta visual de Stitch (`ID: 6069616037528266707`).

## Stack

- **Angular 17+** con `bootstrapApplication` y **Standalone Components** (sin `AppModule`).
- **TypeScript** estricto.
- **Reactive Forms** (`FormBuilder`, `FormGroup`, `Validators`).
- **Signals** + `computed` para el estado reactivo del shell y el modal.
- **Tailwind CSS** con sistema de diseño custom (paleta corporativa moderna, tipografía Inter, JetBrains Mono para datos).
- **HttpClient** (preparado para `withFetch()`) con datos **mock** que se reemplazan 1-a-1 cuando el backend .NET responda.
- Nuevo flujo de control: `@if`, `@for`, `@empty`.

## Estructura

```
frontend/
├── angular.json
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
└── src/
    ├── index.html
    ├── main.ts
    ├── styles.css
    └── app/
        ├── app.component.ts        # Shell + header + tab switch
        ├── app.config.ts           # provideRouter, provideHttpClient, provideAnimations
        ├── app.routes.ts           # lazy load del dashboard
        ├── core/
        │   ├── models/
        │   │   └── inventario.models.ts   # Categoria, Marca, Producto, AtributoValor, MovimientoInput, MovimientoKardex, Kpi*
        │   └── services/
        │       └── inventario.service.ts  # Signals + mock data + HttpClient ready
        └── features/
            ├── dashboard/
            │   └── dashboard.component.ts        # Inventario: KPIs, tabla, form reactivo
            ├── reportes/
            │   └── reportes.component.ts         # Reportes: KPIs, gráfico, Kardex
            └── nuevo-producto/
                └── nuevo-producto.component.ts   # Modal dinámico
```

## Cómo correr

```bash
cd frontend
npm install
npm start
```

Abre `http://localhost:4200`.

## Lógica implementada

### 1. Modelos (`inventario.models.ts`)
Interfaces tipadas según el backend transaccional .NET: `Categoria`, `Marca`, `AtributoValor`, `Producto`, `MovimientoInput` + tipos derivados (`MovimientoKardex`, `KpiInventario`, `KpiFinanciero`).

### 2. `InventarioService`
Centraliza todas las llamadas HTTP. Funciones:

| Función | Tipo de retorno | Backend real (referencia) |
|---|---|---|
| `getProductos()` | `Observable<Producto[]>` | `GET /api/Productos` |
| `getCategorias()` | `Observable<Categoria[]>` | `GET /api/Categorias` |
| `getMarcas()` | `Observable<Marca[]>` | `GET /api/Marcas` |
| `getKardex()` | `Observable<MovimientoKardex[]>` | `GET /api/Movimientos` |
| `getKpiFinanciero()` | `Observable<KpiFinanciero>` | `GET /api/Reportes/financiero` |
| `crearProducto(p)` | `Observable<Producto>` | `POST /api/Productos` |
| `registrarMovimiento(m)` | `Observable<MovimientoKardex>` | `POST /api/Movimientos` |

**Estado global (signals):** `activeView`, `modalNuevoProductoAbierto`, `productoSeleccionado`, `totalItems`, `totalUnidades`, `productosBajos`.

### 3. Formulario reactivo de movimiento rápido (Dashboard)
- Toggle `Ingreso` / `Salida` con cambio de estilo dinámico (verde activo / rojo activo).
- Al hacer clic en una fila de la tabla, el `productoId` y `precioUnitario` se inyectan automáticamente al formulario (`seleccionarProducto()`).
- Al procesar, llama a `registrarMovimiento()` y refresca la tabla y el historial reciente.

### 4. Modal "Nuevo Producto" con campos dinámicos
- Apertura/cierre controlado por la signal `modalNuevoProductoAbierto`.
- `valueChanges` sobre `categoriaId`:
  - **Cargador (id=1)** → `Potencia (Watts)` + `Puertos`.
  - **Cable (id=2)** → `Conector` + `Longitud`.
  - **Cargador con Cable (id=3)** → los cuatro campos.
- Al guardar, los inputs dinámicos se mapean al arreglo `atributos: AtributoValor[]` antes de llamar al servicio.

### 5. Navegación por pestañas
- `Inventario` → muestra `<app-dashboard />` (KPIs + tabla + form + historial).
- `Reportes` → muestra `<app-reportes />` (KPIs financieros, gráfico de tendencia, Kardex completo con paginación).

## Diseño visual (Stitch Design System)
- **Tipografía:** Inter (UI) + JetBrains Mono (SKU/datos tabulares).
- **Color primario:** `#2563eb` (azul corporativo).
- **Color éxito:** `#10b981` (Ingresos).
- **Color peligro:** `#ef4444` (Salidas / bajo stock).
- **Radio:** `0.5rem` en inputs/botones, `1rem` en cards.
- **Sombras:** doble nivel (`0 4px 12px` y `0 10px 24px`).
- **Animaciones:** `fadeInUp` al cambiar de vista, `pulse-soft` en indicadores de bajo stock.

## Próximos pasos para conectar al backend
1. Reemplazar la URL mock en `InventarioService` por el endpoint real (ej. `https://localhost:7xxx/api`).
2. Reemplazar `of(...).pipe(delay(150))` por `this.http.get<Producto[]>(...)`.
3. Mapear los DTOs del backend a las interfaces locales (en caso de nombres diferentes).
4. Añadir `HttpInterceptor` para JWT cuando exista autenticación.

## Cómo correr los tests (Karma + Jasmine)

### Prerrequisitos

- **Chrome** instalado (Karma usa `ChromeHeadlessNoSandbox` por defecto; Windows lo encuentra automáticamente en `C:\Program Files\Google\Chrome\Application\chrome.exe`).
- **Dependencias de dev** instaladas (`npm install` ya las baja).

### Comandos

```bash
# Suite completa (1 corrida + coverage + exit non-zero si hay specs fallando)
npm test

# Modo watch para desarrollo
npm run test:watch

# CI (alias explícito de test, mismo comportamiento)
npm run test:ci
```

### Estado actual

- **8 specs pasando**:
  - `auth.service.spec.ts` (3): init desde localStorage, refresh on success, refresh on 401 → silent logout
  - `auth.guard.spec.ts` (2): redirect a `/login` sin sesión, allow con sesión
  - `api-ventas.service.spec.ts` (2): POST happy path, 401 → logout via interceptor real
  - `inventario.state.spec.ts` (1) — REQ-TEST-003. **`InventarioState.kpiInventario`** ahora viene del server: `GET /api/reportes/kpis-inventario` devuelve los agregados sobre TODA la tabla Productos (soft-deleted excluidos por el global EF query filter). El refactor turn el spec **GREEN** sin cambiar las assertions (`5 / 35 / 3`). El exit code de `npm test` es ahora **zero**.

### Coverage

Se emite en `frontend/coverage/stockmaster/` (formato `html` + `text-summary` + `lcovonly`). Abrí `coverage/stockmaster/index.html` en el browser.

# StockMasterInventory-Frontend
