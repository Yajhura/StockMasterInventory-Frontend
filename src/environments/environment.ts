/**
 * Environment base. Para producción crear environment.prod.ts
 * con apiBaseUrl apuntando a la URL pública del backend.
 *
 * `reportesConWac` (WAC-03 runbook §6): flag de staged rollout para
 * la grilla de rentabilidad WAC. Mientras sea `false`, la ruta
 * `/reportes/rentabilidad-wac` queda oculta para usuarios finales y
 * sólo accesible desde QA. El endpoint backend ya está desplegado en
 * `fix/reporting-financial-integrity` y se enciende en simultáneo
 * con este flag. La rama del backend aún no está mergeada a main,
 * por eso el flag vale `false` en ambos environments.
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
  reportesConWac: false,
};
