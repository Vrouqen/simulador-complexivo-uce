// Sube (o actualiza) los bancos de content/*.json a la base de datos.
// Los bancos NO están en git; se generan con: npm run extract -- --maestro ... --bi ... --auditoria ...
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (ponla en .env.local)");
  process.exit(1);
}
const dir = path.resolve("content");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
if (!files.length) {
  console.error("No hay bancos en content/. Ejecuta primero: npm run extract -- --maestro <html> --bi <html> --auditoria <html>");
  process.exit(1);
}
const ORDER = { maestro: 0, auditoria: 1, bi: 2 };
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  for (const f of files) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    await sql.begin(async (tx) => {
      await tx`
        insert into app.banks (slug, title, subtitle, description, subjects, sizes, default_size, sort)
        values (${b.slug}, ${b.title}, ${b.subtitle}, ${b.description}, ${tx.json(b.subjects)},
                ${tx.json(b.sizes)}, ${b.defaultSize}, ${ORDER[b.slug] ?? 9})
        on conflict (slug) do update set title = excluded.title, subtitle = excluded.subtitle,
          description = excluded.description, subjects = excluded.subjects, sizes = excluded.sizes,
          default_size = excluded.default_size`;
      const ids = b.questions.map((q) => q.id);
      for (let i = 0; i < b.questions.length; i += 100) {
        const rows = b.questions.slice(i, i + 100).map(({ id, subject, ...data }) => ({
          id, bank_slug: b.slug, subject, data,
        }));
        await tx`
          insert into app.questions ${tx(rows.map((r) => ({ ...r, data: tx.json(r.data) })), "id", "bank_slug", "subject", "data")}
          on conflict (id) do update set subject = excluded.subject, data = excluded.data, bank_slug = excluded.bank_slug`;
      }
      // Elimina preguntas que ya no existen en el banco (y que nadie usa en intentos guardados)
      await tx`delete from app.questions where bank_slug = ${b.slug} and not (id = any(${ids}))`;
    });
    console.log(`✔ ${b.slug}: ${b.questions.length} preguntas`);
  }
} catch (e) {
  console.error("✖ Error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
