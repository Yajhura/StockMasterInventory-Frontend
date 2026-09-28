/**
 * Configuracion publica (CFG-10).
 *
 * Contrato espejo de `ConfigPublicaResponse` en el backend
 * (backend/StockMaster.Api). Estos valores son los mismos que expone
 * `GET /api/public/config` para la landing publica, pero el admin los
 * edita contra `GET/PUT /api/config` (autenticado).
 *
 * Notas de mapeo C# -> TS:
 * - `DateTime?` viaja como ISO-8601 en JSON; lo tipamos como `string | null`
 *   y no como `Date` para no arrastrar Parsing a cada consumidor.
 * - `LogoBase64` es base64 PURO (sin prefijo `data:`). El prefijo lo arma
 *   el front solo para el `src` del preview; el payload que viaja al
 *   backend va siempre sin prefijo.
 */
export interface ConfigPublica {
  nombreMarca: string;
  email: string | null;
  telefono: string | null;
  horarioAtencion: string | null;
  direccion: string | null;
  ruc: string | null;
  logoMime: string | null;
  /** Base64 puro, sin el prefijo `data:<mime>;base64,`. */
  logoBase64: string | null;
  modificadoEn: string | null;
}
