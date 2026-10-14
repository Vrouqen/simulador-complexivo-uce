import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  return postgres(url, {
    // Supabase "Transaction pooler" (puerto 6543) no admite prepared statements
    prepare: false,
    max: Number(process.env.DB_POOL_MAX) || 3,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
}

export const sql: postgres.Sql = globalThis.__sql ?? create();
if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;
