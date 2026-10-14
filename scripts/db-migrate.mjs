// Crea/actualiza las tablas en la base de datos (DATABASE_URL o MIGRATE_DATABASE_URL).
import fs from "node:fs";
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (ponla en .env.local)");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("✔ Esquema aplicado");
} catch (e) {
  console.error("✖ Error aplicando el esquema:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
