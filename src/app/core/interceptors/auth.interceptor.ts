import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Adjunta el header Authorization: Bearer <token> a cada peticion
 * hacia el backend. Si no hay sesion activa, deja pasar igual (el
 * endpoint decidira si responde 401 o no).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();

  const esApiNuestra = req.url.startsWith(environment.apiBaseUrl);
  if (!token || !esApiNuestra) {
    return next(req);
  }

  const cloned = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });
  return next(cloned);
};
