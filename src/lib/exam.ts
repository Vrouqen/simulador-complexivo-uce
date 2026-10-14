import "server-only";
import { randomInt } from "node:crypto";
import { sql } from "./db";
import { ApiError } from "./http";
import { rateLimit } from "./ratelimit";
import { canUseBank, type Session } from "./auth";
import type { AttemptConfig, AttemptView, Bank, PublicQuestion, Review, ReviewItem } from "./types";

// El navegador NUNCA recibe la respuesta correcta antes de tiempo: el servidor
// arma el intento, guarda el orden de opciones y califica. Las respuestas y
// explicaciones solo se entregan al calificar (al entregar o, en modo de
// retroalimentación inmediata, pregunta por pregunta).

type QData = {
  q: string;
  opts: string[];
  ans: number;
  exp: string;
  level?: string | null;
  kind?: string | null;
  basis?: string | null;
  quote?: string | null;
  source?: string | null;
  slide?: string | null;
};
type Item = { id: string; order: number[] };
type AttemptRow = {
  id: string;
  license_id: string;
  bank_slug: string;
  mode: string;
  config: AttemptConfig;
  items: Item[];
  answers: Record<string, number>;
  locked: number[];
  flags: number[];
  started_at: Date;
  deadline_at: Date | null;
  submitted_at: Date | null;
  correct: number | null;
  answered: number | null;
  total: number;
  score: string | null;
};

const GRACE_MS = 90_000;
const PASS_SCORE = 14;

function shuffle<T>(a: T[]) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export async function listBanks(): Promise<Bank[]> {
  return sql<Bank[]>`
    select b.slug, b.title, b.subtitle, b.description, b.subjects, b.sizes, b.default_size as "defaultSize",
           (select count(*)::int from app.questions q where q.bank_slug = b.slug) as total
    from app.banks b where b.active order by b.sort, b.slug`;
}

export async function getBank(slug: string, s: Session): Promise<Bank> {
  if (!canUseBank(s, slug)) throw new ApiError(403, "NO_ACCESS", "Tu licencia no incluye este banco de preguntas.");
  const [b] = await sql<Bank[]>`
    select b.slug, b.title, b.subtitle, b.description, b.subjects, b.sizes, b.default_size as "defaultSize",
           (select count(*)::int from app.questions q where q.bank_slug = b.slug) as total
    from app.banks b where b.slug = ${slug} and b.active`;
  if (!b) throw new ApiError(404, "NOT_FOUND", "Banco no encontrado.");
  return b;
}

async function loadAttempt(id: string, s: Session) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "NOT_FOUND", "Intento no encontrado.");
  const [a] = await sql<AttemptRow[]>`select * from app.attempts where id = ${id} and license_id = ${s.license.id}`;
  if (!a) throw new ApiError(404, "NOT_FOUND", "Intento no encontrado.");
  return a;
}

async function questionMap(ids: string[]) {
  const rows = await sql<{ id: string; subject: string; data: QData }[]>`
    select id, subject, data from app.questions where id = any(${ids})`;
  return new Map(rows.map((r) => [r.id, r]));
}

const expired = (a: AttemptRow) => !!a.deadline_at && Date.now() > a.deadline_at.getTime() + GRACE_MS;

function sanitizeConfig(raw: Partial<AttemptConfig>, bank: Bank): AttemptConfig {
  const subjects = Array.isArray(raw.subjects) ? raw.subjects.filter((x) => bank.subjects.includes(x)) : bank.subjects;
  const mpq = Number(raw.minutesPerQuestion);
  return {
    mode: raw.mode === "saved" ? "saved" : "normal",
    size: Math.max(1, Math.min(bank.total, Math.floor(Number(raw.size) || bank.defaultSize))),
    subjects: subjects.length ? subjects : bank.subjects,
    minutesPerQuestion: Number.isFinite(mpq) ? Math.max(0, Math.min(10, mpq)) : 2,
    shuffleOptions: raw.shuffleOptions !== false,
    order: raw.order === "group" ? "group" : "mix",
    feedback: raw.feedback === true,
    preferUnseen: raw.preferUnseen !== false,
  };
}

export async function createAttempt(s: Session, slug: string, raw: Partial<AttemptConfig>) {
  const bank = await getBank(slug, s);
  await rateLimit(`attempt:${s.license.id}`, 60, 86400, "Alcanzaste el límite de intentos por día. Vuelve a intentarlo mañana.");
  const cfg = sanitizeConfig(raw, bank);

  let picked: { id: string; subject: string }[];
  if (cfg.mode === "saved") {
    picked = await sql<{ id: string; subject: string }[]>`
      select q.id, q.subject from app.saved_questions sq join app.questions q on q.id = sq.question_id
      where sq.license_id = ${s.license.id} and q.bank_slug = ${slug}`;
    if (!picked.length) throw new ApiError(400, "NO_SAVED", "No tienes preguntas guardadas para repasar en este banco.");
    picked = shuffle(picked);
  } else {
    const all = await sql<{ id: string; subject: string }[]>`
      select id, subject from app.questions where bank_slug = ${slug} and subject = any(${cfg.subjects})`;
    const seen = new Set<string>();
    if (cfg.preferUnseen) {
      const rows = await sql<{ id: string }[]>`
        select distinct e->>'id' as id from app.attempts a, jsonb_array_elements(a.items) e
        where a.license_id = ${s.license.id} and a.bank_slug = ${slug}`;
      rows.forEach((r) => seen.add(r.id));
    }
    // Reparto equilibrado: se toma una pregunta de cada materia por turnos.
    const pools = shuffle(cfg.subjects).map((sub) => {
      const p = all.filter((q) => q.subject === sub);
      return [...shuffle(p.filter((q) => !seen.has(q.id))), ...shuffle(p.filter((q) => seen.has(q.id)))];
    });
    picked = [];
    while (picked.length < cfg.size) {
      let any = false;
      for (const p of pools) {
        if (picked.length >= cfg.size) break;
        const q = p.shift();
        if (q) { picked.push(q); any = true; }
      }
      if (!any) break;
    }
    if (cfg.order === "group") {
      picked.sort((a, b) => bank.subjects.indexOf(a.subject) - bank.subjects.indexOf(b.subject) || a.id.localeCompare(b.id));
    } else picked = shuffle(picked);
  }

  const qmap = await questionMap(picked.map((p) => p.id));
  const items: Item[] = picked.map((p) => {
    const n = qmap.get(p.id)!.data.opts.length;
    const base = [...Array(n).keys()];
    return { id: p.id, order: cfg.shuffleOptions ? shuffle(base) : base };
  });
  const deadline = cfg.minutesPerQuestion > 0 ? new Date(Date.now() + items.length * cfg.minutesPerQuestion * 60_000) : null;

  // Cierra intentos abiertos anteriores de este banco (se califican tal como quedaron)
  const open = await sql<{ id: string }[]>`
    select id from app.attempts where license_id = ${s.license.id} and bank_slug = ${slug} and submitted_at is null`;
  for (const o of open) await submitAttempt(s, o.id, {});

  const [row] = await sql<AttemptRow[]>`
    insert into app.attempts (license_id, bank_slug, mode, config, items, total, deadline_at)
    values (${s.license.id}, ${slug}, ${cfg.mode}, ${sql.json(cfg as never)}, ${sql.json(items as never)}, ${items.length}, ${deadline})
    returning *`;
  return viewOf(row, qmap);
}

function viewOf(a: AttemptRow, qmap: Map<string, { id: string; subject: string; data: QData }>): AttemptView {
  const questions: PublicQuestion[] = a.items.map((it, i) => {
    const q = qmap.get(it.id);
    if (!q) return { index: i, id: it.id, subject: "", q: "(pregunta eliminada)", opts: [], level: null, kind: null };
    return {
      index: i,
      id: it.id,
      subject: q.subject,
      q: q.data.q,
      opts: it.order.map((o) => q.data.opts[o]),
      level: q.data.level ?? null,
      kind: q.data.kind ?? null,
    };
  });
  const graded: AttemptView["graded"] = {};
  for (const i of a.locked) {
    const g = gradeItem(a, i, qmap);
    if (g) graded[i] = g;
  }
  return {
    id: a.id,
    bank: a.bank_slug,
    config: a.config,
    startedAt: a.started_at.toISOString(),
    deadline: a.deadline_at?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    questions,
    answers: a.answers,
    flags: a.flags,
    graded,
  };
}

function gradeItem(a: AttemptRow, i: number, qmap: Map<string, { id: string; subject: string; data: QData }>) {
  const it = a.items[i];
  const q = it && qmap.get(it.id);
  if (!q) return null;
  const correct = it.order.indexOf(q.data.ans);
  const ans = a.answers[String(i)];
  return {
    correct,
    isCorrect: ans === correct,
    exp: q.data.exp,
    quote: q.data.quote ?? null,
    source: q.data.source ?? null,
    slide: q.data.slide ?? null,
    basis: q.data.basis ?? null,
  };
}

export async function getOpenAttempt(s: Session, slug: string) {
  const [a] = await sql<AttemptRow[]>`
    select * from app.attempts where license_id = ${s.license.id} and bank_slug = ${slug} and submitted_at is null
    order by started_at desc limit 1`;
  if (!a) return null;
  if (expired(a)) {
    await submitAttempt(s, a.id, {});
    return null;
  }
  return viewOf(a, await questionMap(a.items.map((x) => x.id)));
}

function cleanAnswers(a: AttemptRow, raw: unknown) {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= a.items.length) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= a.items[i].order.length) continue;
    if (a.locked.includes(i)) continue; // las bloqueadas no se pueden cambiar
    out[String(i)] = v;
  }
  return out;
}
const cleanFlags = (a: AttemptRow, raw: unknown) =>
  Array.isArray(raw) ? [...new Set(raw.filter((i) => Number.isInteger(i) && i >= 0 && i < a.items.length))] : a.flags;

/** Autoguardado del avance (respuestas y marcas). */
export async function saveProgress(s: Session, id: string, body: { answers?: unknown; flags?: unknown }) {
  const a = await loadAttempt(id, s);
  if (a.submitted_at) throw new ApiError(409, "SUBMITTED", "Este intento ya fue entregado.");
  if (expired(a)) throw new ApiError(409, "TIME_UP", "El tiempo terminó.");
  const answers = { ...a.answers, ...cleanAnswers(a, body.answers) };
  for (const i of a.locked) answers[String(i)] = a.answers[String(i)];
  await sql`update app.attempts set answers = ${sql.json(answers)}, flags = ${sql.json(cleanFlags(a, body.flags))}
            where id = ${a.id}`;
}

/** Retroalimentación inmediata: califica y bloquea una pregunta. */
export async function lockAnswer(s: Session, id: string, index: number, choice: number | null) {
  const a = await loadAttempt(id, s);
  if (!a.config.feedback) throw new ApiError(400, "NO_FEEDBACK", "Este intento no usa retroalimentación inmediata.");
  if (a.submitted_at) throw new ApiError(409, "SUBMITTED", "Este intento ya fue entregado.");
  if (!Number.isInteger(index) || index < 0 || index >= a.items.length) throw new ApiError(400, "BAD_REQUEST", "Pregunta inválida.");
  if (!a.locked.includes(index)) {
    if (expired(a)) throw new ApiError(409, "TIME_UP", "El tiempo terminó.");
    const valid = typeof choice === "number" && Number.isInteger(choice) && choice >= 0 && choice < a.items[index].order.length;
    if (!valid) throw new ApiError(400, "BAD_REQUEST", "Selecciona una opción.");
    a.answers[String(index)] = choice;
    a.locked.push(index);
    await sql`update app.attempts set answers = ${sql.json(a.answers)}, locked = ${sql.json(a.locked)} where id = ${a.id}`;
  }
  return gradeItem(a, index, await questionMap([a.items[index].id]));
}

export async function submitAttempt(s: Session, id: string, body: { answers?: unknown; flags?: unknown }) {
  const a = await loadAttempt(id, s);
  if (!a.submitted_at) {
    // Después del tiempo límite (+ margen) solo cuenta lo autoguardado.
    if (!expired(a)) Object.assign(a.answers, cleanAnswers(a, body.answers));
    a.flags = cleanFlags(a, body.flags);
    const qmap = await questionMap(a.items.map((x) => x.id));
    let correct = 0;
    a.items.forEach((it, i) => {
      const q = qmap.get(it.id);
      if (q && a.answers[String(i)] === it.order.indexOf(q.data.ans)) correct++;
    });
    const answered = Object.keys(a.answers).length;
    const score = Math.round((correct * 20 * 100) / a.total) / 100;
    await sql`update app.attempts set answers = ${sql.json(a.answers)}, flags = ${sql.json(a.flags)},
                submitted_at = now(), correct = ${correct}, answered = ${answered}, score = ${score}
              where id = ${a.id} and submitted_at is null`;
    // Las marcadas quedan guardadas para repasar después
    const flaggedIds = a.flags.map((i) => a.items[i]?.id).filter(Boolean);
    if (flaggedIds.length) {
      await sql`insert into app.saved_questions (license_id, question_id)
                select ${s.license.id}, unnest(${flaggedIds}::text[]) on conflict do nothing`;
    }
  }
  return getReview(s, id);
}

export async function getReview(s: Session, id: string): Promise<Review> {
  const a = await loadAttempt(id, s);
  if (!a.submitted_at) throw new ApiError(409, "NOT_SUBMITTED", "El intento aún no se ha entregado.");
  const qmap = await questionMap(a.items.map((x) => x.id));
  const saved = new Set(
    (await sql<{ question_id: string }[]>`
      select question_id from app.saved_questions where license_id = ${s.license.id}`).map((r) => r.question_id)
  );
  const [bank] = await sql<{ title: string; subjects: string[] }[]>`select title, subjects from app.banks where slug = ${a.bank_slug}`;
  const items: ReviewItem[] = a.items.map((it, i) => {
    const q = qmap.get(it.id);
    const g = gradeItem(a, i, qmap);
    const ans = a.answers[String(i)];
    return {
      index: i,
      id: it.id,
      subject: q?.subject ?? "",
      q: q?.data.q ?? "(pregunta eliminada)",
      opts: q ? it.order.map((o) => q.data.opts[o]) : [],
      level: q?.data.level ?? null,
      kind: q?.data.kind ?? null,
      answer: ans === undefined ? null : ans,
      flagged: a.flags.includes(i),
      saved: saved.has(it.id),
      correct: g?.correct ?? -1,
      exp: g?.exp ?? "",
      quote: g?.quote ?? null,
      source: g?.source ?? null,
      slide: g?.slide ?? null,
      basis: g?.basis ?? null,
    };
  });
  const bySubject = (bank?.subjects ?? [])
    .map((sub) => {
      const its = items.filter((x) => x.subject === sub);
      const ok = its.filter((x) => x.answer === x.correct).length;
      return { subject: sub, correct: ok, total: its.length };
    })
    .filter((x) => x.total > 0);
  const correct = a.correct ?? 0;
  return {
    id: a.id,
    bank: a.bank_slug,
    bankTitle: bank?.title ?? a.bank_slug,
    mode: a.mode,
    startedAt: a.started_at.toISOString(),
    submittedAt: a.submitted_at.toISOString(),
    total: a.total,
    correct,
    answered: a.answered ?? 0,
    score: Number(a.score ?? 0),
    passScore: PASS_SCORE,
    bySubject,
    items,
  };
}

export async function setSaved(s: Session, questionId: string, saved: boolean) {
  // Solo se pueden guardar preguntas que el usuario ya vio en algún intento suyo.
  const [seen] = await sql`
    select 1 from app.attempts where license_id = ${s.license.id} and items @> ${sql.json([{ id: questionId }])} limit 1`;
  if (!seen) throw new ApiError(404, "NOT_FOUND", "Pregunta no encontrada.");
  if (saved) {
    await sql`insert into app.saved_questions (license_id, question_id) values (${s.license.id}, ${questionId})
              on conflict do nothing`;
  } else {
    await sql`delete from app.saved_questions where license_id = ${s.license.id} and question_id = ${questionId}`;
  }
}

export async function clearSaved(s: Session, slug: string) {
  await sql`delete from app.saved_questions sq using app.questions q
            where sq.question_id = q.id and sq.license_id = ${s.license.id} and q.bank_slug = ${slug}`;
}

export async function dashboard(s: Session) {
  const attempts = await sql<
    { id: string; bank_slug: string; title: string; mode: string; submitted_at: Date; total: number; correct: number; score: string }[]
  >`
    select a.id, a.bank_slug, b.title, a.mode, a.submitted_at, a.total, a.correct, a.score
    from app.attempts a join app.banks b on b.slug = a.bank_slug
    where a.license_id = ${s.license.id} and a.submitted_at is not null
    order by a.submitted_at desc limit 50`;
  const stats = await sql<{ bank_slug: string; saved: number; seen: number }[]>`
    select b.slug as bank_slug,
      (select count(*)::int from app.saved_questions sq join app.questions q on q.id = sq.question_id
        where sq.license_id = ${s.license.id} and q.bank_slug = b.slug) as saved,
      (select count(distinct e->>'id')::int from app.attempts a, jsonb_array_elements(a.items) e
        where a.license_id = ${s.license.id} and a.bank_slug = b.slug) as seen
    from app.banks b`;
  return { attempts, stats };
}

export async function bankStats(s: Session, slug: string) {
  const [r] = await sql<{ saved: number; seen: number }[]>`
    select
      (select count(*)::int from app.saved_questions sq join app.questions q on q.id = sq.question_id
        where sq.license_id = ${s.license.id} and q.bank_slug = ${slug}) as saved,
      (select count(distinct e->>'id')::int from app.attempts a, jsonb_array_elements(a.items) e
        where a.license_id = ${s.license.id} and a.bank_slug = ${slug}) as seen`;
  const history = await sql<{ id: string; submitted_at: Date; total: number; correct: number; score: string; mode: string }[]>`
    select id, submitted_at, total, correct, score, mode from app.attempts
    where license_id = ${s.license.id} and bank_slug = ${slug} and submitted_at is not null
    order by submitted_at desc limit 10`;
  return {
    saved: r.saved,
    seen: r.seen,
    history: history.map((h) => ({ ...h, submitted_at: h.submitted_at.toISOString(), score: Number(h.score) })),
  };
}
