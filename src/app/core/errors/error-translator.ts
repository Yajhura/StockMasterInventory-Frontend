// =====================================================================
//  ErrorTranslator.cs (frontend)
// ---------------------------------------------------------------------
//  Traduce errores HTTP del backend (.NET 10 ProblemDetails) y errores
//  de EF Core a mensajes cortos y entendibles para el usuario final.
//
//  Por que existe:
//   - El backend devuelve RFC 7807 (ProblemDetails) para validation errors:
//     { errors: { "CategoriaId": ["La categoria no existe."] } }
//   - Tambien devuelve 500 con inner exception cruda de EF para FK
//     constraints y unique violations.
//   - Antes el frontend mostraba "One or more validation errors occurred."
//     o "An error occurred while saving the entity changes..." que no
//     dicen nada util.
//
//  El translator produce siempre una sola linea humana. Si hay varios
//  errores, los une con " | ".
// =====================================================================

export interface ErrorHttpPayload {
  status?: number;
  /** RFC 7807: title + detail + errors map */
  title?: string;
  detail?: string;
  /** RFC 7807 ValidationProblem: errors: { campo: [mensajes] } */
  errors?: Record<string, string[] | string>;
  /** EF / SQL: mensaje crudo que el backend envia cuando es 500 */
  exceptionMessage?: string;
}

export class ErrorTranslator {
  /**
   * Punto de entrada principal. Acepta cualquier cosa que Angular HttpClient
   * tire como error (HttpErrorResponse, ErrorEvent, etc.) y devuelve un
   * mensaje legible.
   */
  static translate(e: unknown): string {
    const payload = ErrorTranslator.extract(e);
    if (!payload) {
      return ErrorTranslator.fallback(e);
    }

    // 1) ValidationProblem (RFC 7807 con errors)
    if (payload.errors && Object.keys(payload.errors).length > 0) {
      return ErrorTranslator.formatValidationErrors(payload.errors);
    }

    // 2) ProblemDetails con title util
    if (payload.title && !ErrorTranslator.isGenericTitle(payload.title)) {
      return ErrorTranslator.formatProblemTitle(payload.title, payload.detail);
    }

    // 3) detail util
    if (payload.detail && !ErrorTranslator.isGenericTitle(payload.detail)) {
      return payload.detail;
    }

    // 4) EF / SQL exception cruda: mapear a mensaje humano
    if (payload.exceptionMessage) {
      return ErrorTranslator.mapEfMessage(payload.exceptionMessage);
    }

    // 5) Fallback por status code
    return ErrorTranslator.mapStatusCode(payload.status);
  }

  // ---------- Helpers privados ----------

  private static extract(e: unknown): ErrorHttpPayload | null {
    if (!e || typeof e !== 'object') return null;

    // Angular HttpErrorResponse
    const anyE = e as {
      status?: number;
      error?: unknown;
      message?: string;
    };
    if (typeof anyE.status === 'number' && anyE.error !== undefined) {
      const body = anyE.error;
      if (body && typeof body === 'object') {
        const b = body as {
          title?: string;
          detail?: string;
          errors?: Record<string, string[] | string>;
          // EF Core a veces serializa la inner exception dentro de `error` o `message`
          exceptionMessage?: string;
          message?: string;
        };
        return {
          status: anyE.status,
          title: b.title,
          detail: b.detail,
          errors: b.errors,
          exceptionMessage: b.exceptionMessage ?? b.message,
        };
      }
      if (typeof body === 'string') {
        return { status: anyE.status, detail: body };
      }
    }

    return null;
  }

  private static formatValidationErrors(
    errors: Record<string, string[] | string>
  ): string {
    const lines: string[] = [];
    for (const [field, msgs] of Object.entries(errors)) {
      const arr = Array.isArray(msgs) ? msgs : [msgs];
      const niceField = ErrorTranslator.niceFieldName(field);
      for (const m of arr) {
        lines.push(`${niceField}: ${m}`);
      }
    }
    return lines.length > 0 ? lines.join('\n') : 'Datos invalidos.';
  }

  private static formatProblemTitle(title: string, detail?: string): string {
    // "One or more validation errors occurred." es generico: si hay detail
    // (que ASP.NET pone como "See /swagger..."), lo ignoramos.
    if (detail && !ErrorTranslator.isGenericTitle(detail)) {
      return detail;
    }
    return title;
  }

  /**
   * Filtra titulos que ASP.NET pone automaticamente y que no ayudan.
   */
  private static isGenericTitle(text: string): boolean {
    const t = text.toLowerCase().trim();
    return (
      t === 'one or more validation errors occurred.' ||
      t === 'one or more validation errors occurred' ||
      t === 'an error occurred while saving the entity changes. see the inner exception for details.' ||
      t === 'an error occurred while saving the entity changes' ||
      t.startsWith('an unhandled exception occurred') ||
      t === 'bad request' ||
      t === 'not found' ||
      t === 'internal server error'
    );
  }

  private static mapEfMessage(msg: string): string {
    const m = msg.toLowerCase();

    // FK constraint: "The DELETE statement conflicted with the REFERENCE constraint \"FK_Productos_Categorias_CategoriaId\""
    if (
      m.includes('conflicted with the reference constraint') ||
      m.includes('conflicto con la restriccion') ||
      m.includes('foreign key constraint')
    ) {
      const table = ErrorTranslator.extractConstraintTable(msg);
      if (table) {
        return `No se puede eliminar: hay registros que dependen de este item (${table}).`;
      }
      return 'No se puede eliminar: hay registros que dependen de este item.';
    }

    // Unique violation: "Cannot insert duplicate key row in object 'dbo.Categorias' with unique index 'UX_Categorias_Nombre'."
    if (
      m.includes('duplicate key') ||
      m.includes('cannot insert duplicate') ||
      m.includes('unique constraint') ||
      m.includes('unique index')
    ) {
      return 'Ya existe un registro con ese nombre.';
    }

    // SQL timeout
    if (m.includes('timeout') && m.includes('expired')) {
      return 'La operacion tardo demasiado. Intentalo de nuevo.';
    }

    // Connection
    if (m.includes('connection') || m.includes('network')) {
      return 'No se pudo conectar con el servidor. Verifica tu conexion.';
    }

    // Cualquier otro EF: devolver el mensaje recortado (sin SQL verboso)
    const cleaned = msg.replace(/at\s+\w+\.+\w+/g, '').replace(/\s+/g, ' ').trim();
    return cleaned.length > 180 ? cleaned.substring(0, 180) + '...' : cleaned;
  }

  private static extractConstraintTable(msg: string): string | null {
    // Patrones tipicos:
    //   FK "FK_Productos_Categorias_CategoriaId"
    //   constraint "FK_Productos_Categorias_CategoriaId"
    const m = msg.match(/FK[_ ]?([A-Za-z]+)_/);
    if (m) {
      return m[1].toLowerCase();
    }
    return null;
  }

  private static mapStatusCode(status?: number): string {
    switch (status) {
      case 0:   return 'No se pudo conectar con el servidor. Verifica tu conexion.';
      case 400: return 'La solicitud tiene datos invalidos.';
      case 401: return 'Sesion expirada. Inicia sesion de nuevo.';
      case 403: return 'No tienes permisos para esta accion.';
      case 404: return 'No se encontro el recurso solicitado.';
      case 409: return 'Conflicto: el recurso ya existe o esta en uso.';
      case 413: return 'El archivo o dato es demasiado grande.';
      case 500: return 'Error del servidor. Intentalo de nuevo.';
      case 503: return 'El servidor no esta disponible. Intentalo mas tarde.';
      default:  return status ? `Error ${status}. Intentalo de nuevo.` : 'Error desconocido.';
    }
  }

  /**
   * "CategoriaId" -> "Categoria", "nombre" -> "Nombre", "CodigoBarra" -> "Codigo de barras"
   */
  private static niceFieldName(field: string): string {
    if (!field) return 'Dato';
    if (/^id$/i.test(field)) return 'ID';

    // Dividir por CamelCase
    const spaced = field
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');

    // Quitar prefijos comunes
    const cleaned = spaced.replace(/^(id|codigo|codigo de barra|marca|categoria|precio|nombre)\b/i, (m) => m);

    // Capitalizar primera letra
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }

  private static fallback(e: unknown): string {
    if (e && typeof e === 'object') {
      const m = (e as { message?: string }).message;
      if (m && !ErrorTranslator.isGenericTitle(m)) return m;
    }
    return 'Error desconocido al comunicarse con el servidor.';
  }
}
