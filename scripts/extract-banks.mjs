// Extrae los bancos de preguntas de los simuladores HTML originales y los
// convierte a un formato común en content/*.json (carpeta ignorada por git).
//
// Uso:
//   node scripts/extract-banks.mjs --maestro <ruta.html> --bi <ruta.html> --auditoria <ruta.html>
//
// Luego: npm run db:seed  (sube los bancos a la base de datos)

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const outDir = path.resolve("content");
fs.mkdirSync(outDir, { recursive: true });

function scriptOf(file) {
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`No se encontró <script> en ${file}`);
  return m[1];
}

function lineValue(js, name) {
  const re = new RegExp(`^const ${name} = (.*);\\s*$`, "m");
  const m = js.match(re);
  if (!m) throw new Error(`No se encontró "const ${name}"`);
  return JSON.parse(m[1]);
}

function validate(bank) {
  const ids = new Set();
  for (const q of bank.questions) {
    if (ids.has(q.id)) throw new Error(`ID duplicado ${q.id}`);
    ids.add(q.id);
    if (!bank.subjects.includes(q.subject)) throw new Error(`Materia desconocida en ${q.id}: ${q.subject}`);
    if (!Array.isArray(q.opts) || q.opts.length < 2) throw new Error(`Opciones inválidas en ${q.id}`);
    if (!(q.ans >= 0 && q.ans < q.opts.length)) throw new Error(`Respuesta inválida en ${q.id}`);
  }
  return bank;
}

function write(bank) {
  validate(bank);
  const file = path.join(outDir, `${bank.slug}.json`);
  fs.writeFileSync(file, JSON.stringify(bank, null, 1));
  const per = {};
  bank.questions.forEach((q) => (per[q.subject] = (per[q.subject] || 0) + 1));
  console.log(`✔ ${bank.slug}: ${bank.questions.length} preguntas → ${file}`);
  for (const [s, n] of Object.entries(per)) console.log(`    ${n.toString().padStart(3)}  ${s}`);
}

// Formato "BANK = [{id, subject, q, opts, ans, exp, level, kind, basis}]"
function fromJsonBank(file, meta) {
  const js = scriptOf(file);
  const bank = lineValue(js, "BANK");
  const subjects = lineValue(js, "SUBJECTS");
  return {
    ...meta,
    subjects,
    questions: bank.map((q) => ({
      id: `${meta.slug}-${String(q.id).padStart(3, "0")}`,
      subject: q.subject,
      q: q.q,
      opts: q.opts,
      ans: q.ans,
      exp: q.exp,
      level: q.level || null,
      kind: q.kind || null,
      basis: q.basis || null,
    })),
  };
}

// Formato del simulador de Auditoría: TOPICS + RAW (JS literal, no JSON)
function fromAuditoria(file, meta) {
  const js = scriptOf(file);
  const start = js.indexOf("const TOPICS=");
  const end = js.indexOf("const BANK=");
  if (start < 0 || end < 0) throw new Error("Formato de auditoría no reconocido");
  const ctx = {};
  vm.runInNewContext(js.slice(start, end).replace(/^const (\w+)=/gm, "this.$1="), ctx, { timeout: 2000 });
  const { TOPICS, RAW } = ctx;
  const count = {};
  return {
    ...meta,
    subjects: TOPICS.map((t) => t.n),
    questions: RAW.map((r, k) => {
      const [t, slide, q, opts, ans, exp, quote, src] = r;
      count[t] = (count[t] || 0) + 1;
      // Igual que el original: reparte la respuesta correcta entre A/B/C/D
      const o = opts.slice();
      const target = (k * 3 + 1) % 4;
      [o[ans], o[target]] = [o[target], o[ans]];
      return {
        id: `${meta.slug}-${String(t + 1).padStart(2, "0")}-${String(count[t]).padStart(2, "0")}`,
        subject: TOPICS[t].n,
        q,
        opts: o,
        ans: target,
        exp,
        quote: quote || null,
        source: (src || TOPICS[t].f || "").replace(/\.pdf$/i, "").replace(/_/g, " ").trim() || null,
        slide: slide || null,
      };
    }),
  };
}

if (args.maestro) {
  write(
    fromJsonBank(args.maestro, {
      slug: "maestro",
      title: "Banco Maestro · Examen Complexivo",
      subtitle: "Ingeniería en Sistemas de Información · 6 asignaturas",
      description:
        "Preguntas contextualizadas con casos de estudio de las seis asignaturas del examen complexivo. El modo oficial simula 60 reactivos equilibrados: 10 por materia.",
      sizes: [60, 120, 180, 240, 300, 360, 480],
      defaultSize: 60,
      balanced: true,
    })
  );
}
if (args.bi) {
  write(
    fromJsonBank(args.bi, {
      slug: "bi",
      title: "Inteligencia de Negocios",
      subtitle: "Banco específico de BI · 8 temas",
      description:
        "Banco basado en los materiales de clase: diapositivas, exposiciones de KPIs y Big Data, estudio de BSA, KDD/CRISP-DM y casos de estudio.",
      sizes: [16, 24, 40, 80],
      defaultSize: 40,
      balanced: true,
    })
  );
}
if (args.auditoria) {
  write(
    fromAuditoria(args.auditoria, {
      slug: "auditoria",
      title: "Auditoría de TI",
      subtitle: "Banco específico de Auditoría · 10 temas",
      description:
        "Preguntas elaboradas a partir de las presentaciones del curso. Cada respuesta incluye la explicación y la cita textual del material con su diapositiva.",
      sizes: [10, 20, 40, 60, 80],
      defaultSize: 40,
      balanced: true,
    })
  );
}
if (!args.maestro && !args.bi && !args.auditoria) {
  console.log("Uso: node scripts/extract-banks.mjs --maestro <html> --bi <html> --auditoria <html>");
  process.exit(1);
}
