import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Adjunta los headers `Authorization: Bearer <token>` y `TimeZone` a
 * cada peticion hacia el backend.
 *
 * El header `TimeZone` se computa DINAMICAMENTE desde el navegador del
 * usuario, en el formato `(GMT±HH:MM) IANA_NAME` que el backend
 * espera (ver `PeruDateTime.ParseZone` en el backend). Ejemplos:
 *
 *   Usuario en Lima      → `(GMT-05:00) America/Lima`
 *   Usuario en NYC       → `(GMT-04:00) America/New_York`
 *   Usuario en Berlin    → `(GMT+02:00) Europe/Berlin`
 *
 * Asi cada request lleva el timezone real del cliente, no uno hardcoded
 * para Peru. Si el header falta o es invalido, el backend cae al
 * `TimeZoneDefault` de `appsettings.json` (ver `PeruDateTime.TimeZoneDefault`).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();

  const esApiNuestra = req.url.startsWith(environment.apiBaseUrl);
  if (!esApiNuestra) {
    return next(req);
  }

  let headers = req.headers.set('TimeZone', buildTimeZoneHeader());
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const cloned = req.clone({ headers });
  return next(cloned);
};

/**
 * Build the TimeZone header value in the format
 * `(GMT±HH:MM) IANA_NAME` that the backend expects.
 *
 * - `getTimezoneOffset()` returns minutes WEST of UTC as positive
 *   (so Lima is +300, Berlin is -60). We negate to get the conventional
 *   sign (Lima -300 → "-05:00", Berlin +60 → "+01:00").
 * - `Intl.DateTimeFormat().resolvedOptions().timeZone` returns the IANA
 *   name (e.g., `America/Lima`). Falls back to `UTC` if not supported.
 */
function buildTimeZoneHeader(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const name = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? 'UTC';
  return `(GMT${sign}${hh}:${mm}) ${name}`;
}
