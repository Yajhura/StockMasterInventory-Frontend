import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';
import { ErrorTranslator } from '../errors/error-translator';

/**
 * Interceptor funcional de errores HTTP. Captura respuestas no-2xx y:
 *   - Si es 401: desloguea y manda al /login. SI muestra toast.
 *   - Si es un error de conexion (status 0): SI muestra toast (no hay
 *     componente que pueda hacerse cargo).
 *   - Para errores 4xx/5xx: NO muestra toast. Re-emite el error al caller
 *     (el state lo guarda, el componente consumidor lo muestra UNA sola vez).
 */
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotificationService);
  const auth   = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401: forzar logout y avisar al usuario.
      if (err.status === 401) {
        const enLogin = router.url.startsWith('/login');
        if (!enLogin) {
          notify.warning('Tu sesión ha expirado. Vuelve a iniciar sesión.');
          auth.logout(true);
        }
        return throwError(() => err);
      }

      // Error de red puro (status 0): no hay caller, mostramos el toast.
      if (err.status === 0) {
        notify.error('No se pudo conectar con el servidor. Verifica tu conexión.');
        return throwError(() => err);
      }

      // Para el resto: dejamos que el state guarde el mensaje y el
      // componente consumidor muestre UN solo toast con su contexto.
      // Solo nos aseguramos de que el error este disponible en
      // ErrorTranslator para que el state lo extraiga bien.
      void ErrorTranslator; // side-effect import para mantener el bundle
      return throwError(() => err);
    })
  );
};
