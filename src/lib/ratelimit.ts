import "server-only";
import { sql } from "./db";
import { ApiError } from "./http";

/** Ventana fija guardada en la base de datos (funciona entre instancias serverless). */
export async function rateLimit(key: string, limit: number, windowSec: number, message?: string) {
  const [row] = await sql<{ count: number }[]>`
    insert into app.rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when app.rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else app.rate_limits.count + 1 end,
      window_start = case when app.rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else app.rate_limits.window_start end
    returning count`;
  if (row.count > limit) {
    throw new ApiError(429, "RATE_LIMIT", message || "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.");
  }
}
