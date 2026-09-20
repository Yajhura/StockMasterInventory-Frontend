import { HttpInterceptorFn } from '@angular/common/http';

/**
 * credentialsInterceptor: clones every API request with `withCredentials: true`
 * so the browser sends the `__Host-sm_session` cookie automatically.
 *
 * Replaces the previous Bearer-token interceptor (auth.interceptor.ts). Auth
 * is now cookie-based: the server sets an HttpOnly Secure SameSite=Strict
 * cookie on `POST /api/auth/login`, and every API request must opt the cookie
 * jar in via `withCredentials: true` for the browser to attach it.
 *
 * Why global: per-call `withCredentials` is repetitive and error-prone.
 * One interceptor at the HttpClient layer guarantees coverage.
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const cloned = req.clone({ withCredentials: true });
  return next(cloned);
};