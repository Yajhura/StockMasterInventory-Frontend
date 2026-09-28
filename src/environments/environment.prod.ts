/**
 * Production environment. The public API base URL is intentionally safe to
 * publish; authentication is cookie-based and no credentials belong here.
 *
 * Keep the WAC rollout route aligned with environment.ts. The backend and
 * frontend route are already released, so production must not hide it.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://cheslo-001-site1.dtempurl.com',
  reportesConWac: true,
};
