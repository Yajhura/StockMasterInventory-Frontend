/**
 * Environment base. Para producción crear environment.prod.ts
 * con apiBaseUrl apuntando a la URL pública del backend.
 *
 * `reportesConWac` (WAC-03 runbook §6): flag de staged rollout para
 * la grilla de rentabilidad WAC. Backend ya mergeado (PR #23 en
 * Yajhura/StockMaster-Api), frontend WAC-03 mergeado (PR #26),
 * este flag se flipea a `true` para exponer la ruta
 * `/reportes/rentabilidad-wac` a usuarios finales. Para rollback
 * volver a `false` y mergear; la ruta queda oculta hasta el próximo
 * flip.
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
  reportesConWac: true,
};
