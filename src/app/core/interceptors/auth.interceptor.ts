import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Adjunta el header `Authorization: Bearer <token>` a cada peticion hacia
 * el backend. Si no hay sesion activa, deja pasar igual (el endpoint
 * decidira si responde 401 o no).
 *
 * Nota: este interceptor ya NO envia el header `TimeZone` que antes
 * tenia hardcoded `'(GMT-05:00) Bogota, Lima, Quito, Rio Branco'`.
 * Era un bug: solo funcionaba para deploys en Peru. Ahora el backend
 * usa su propio `TimeZoneDefault` desde `appsettings.json` (configurable
 * por deployment via env vars / appsettings overrides).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();

  const esApiNuestra = req.url.startsWith(environment.apiBaseUrl);
  if (!esApiNuestra) {
    return next(req);
  }

  let headers = req.headers;
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const cloned = req.clone({ headers });
  return next(cloned);
};
