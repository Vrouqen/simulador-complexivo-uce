"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import type { AttemptConfig, AttemptView, Bank, BankStats, Graded, Review, ReviewItem } from "@/lib/types";

const L = "ABCDEFGH";

type BankResp = { bank: Bank; stats: BankStats; open: AttemptView | null };

function fmtTime(sec: number) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(s).padStart(2, "0");
}
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// =====================================================================
// Contenedor principal
// =====================================================================
export function Simulator({ slug }: { slug: string }) {
  const [data, setData] = useState<BankResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<BankResp>(`/api/banks/${slug}`).then(setData).catch((e) => setError(errMsg(e)));
  }, [slug]);
  useEffect(load, [load]);

  if (error) return <main className="page wrap"><div className="alert error">{error}</div><Link href="/panel">← Volver</Link></main>;
  if (!data) return <main className="page wrap"><p className="muted">Cargando…</p></main>;

  if (review) {
    return (
      <ReviewView
        review={review}
        onNew={() => { setReview(null); setAttempt(null); load(); window.scrollTo(0, 0); }}
      />
    );
  }
  if (attempt) {
    return <Exam attempt={attempt} onDone={(r) => { setReview(r); setAttempt(null); window.scrollTo(0, 0); }} />;
  }
  return <Setup data={data} onStart={setAttempt} onReload={load} />;
}

// =====================================================================
// Configuración del intento
// =====================================================================
function Setup({ data, onStart, onReload }: { data: BankResp; onStart: (a: AttemptView) => void; onReload: () => void }) {
  const { bank, stats, open } = data;
  const [subjects, setSubjects] = useState<string[]>(bank.subjects);
  const [size, setSize] = useState(bank.defaultSize);
  const [mpq, setMpq] = useState(2);
  const [noLimit, setNoLimit] = useState(false);
  const [order, setOrder] = useState<"mix" | "group">("mix");
  const [shuffleOptions, setShuffle] = useState(true);
  const [feedback, setFeedback] = useState(false);
  const [preferUnseen, setPreferUnseen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perSubject = Math.round(bank.total / bank.subjects.length);
  const max = Math.max(1, subjects.length * perSubject);
  const n = Math.min(Math.max(1, size), max);

  const start = async (mode: "normal" | "saved") => {
    setBusy(true);
    setError(null);
    try {
      const config: AttemptConfig = {
        mode, size: n, subjects, minutesPerQuestion: noLimit ? 0 : mpq, shuffleOptions, order, feedback, preferUnseen,
      };
      onStart(await api<AttemptView>("/api/attempts", { body: { bank: bank.slug, config } }));
      window.scrollTo(0, 0);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const lo = Math.floor(n / subjects.length), hi = Math.ceil(n / subjects.length);
  const summary = subjects.length
    ? `${n} preguntas · ${lo === hi ? `${lo} por ${subjects.length > 1 ? "materia" : "tema"}` : `entre ${lo} y ${hi} por materia`} · ` +
      (noLimit ? "sin límite de tiempo" : `${fmtTime(n * mpq * 60)} de tiempo`)
    : "Selecciona al menos una materia.";

  return (
    <main className="page wrap">
      <div className="setup">
        <div>
          <Link href="/panel" className="small">← Mis bancos</Link>
          <h1 style={{ marginTop: 10 }}>{bank.title}</h1>
          <p className="muted">{bank.description}</p>
          <div className="ledger">
            <div><span>Preguntas en el banco</span><b>{bank.total}</b></div>
            <div><span>Materias / temas</span><b>{bank.subjects.length}</b></div>
            <div><span>Preguntas que ya viste</span><b>{stats.seen}/{bank.total}</b></div>
            <div><span>Guardadas para repasar</span><b>{stats.saved}</b></div>
            <div><span>Nota de referencia</span><b>14/20</b></div>
          </div>
          {stats.history.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 6 }}>Últimos intentos</h3>
              <table className="table">
                <tbody>
                  {stats.history.map((h) => (
                    <tr key={h.id}>
                      <td className="small">{fmtDate(h.submitted_at)}</td>
                      <td className="small">{h.correct}/{h.total}</td>
                      <td><b className={h.score >= 14 ? "pass" : "fail"}>{h.score.toFixed(2)}</b></td>
                      <td className="small"><Link href={`/panel/intento/${h.id}`}>Revisar</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form className="card" onSubmit={(e) => { e.preventDefault(); start("normal"); }}>
          {open && (
            <div className="alert info">
              Tienes un intento en curso ({Object.keys(open.answers).length}/{open.questions.length} respondidas).
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn primary sm" onClick={() => onStart(open)}>Continuar intento</button>
                <span className="small muted">Si generas uno nuevo, el anterior se entregará tal como está.</span>
              </div>
            </div>
          )}
          {error && <div className="alert error">{error}</div>}

          <label className="field">
            <span>Número de preguntas</span>
            <div className="row">
              <input type="range" min={1} max={max} value={n} onChange={(e) => setSize(+e.target.value)} className="grow" style={{ accentColor: "var(--navy)" }} />
              <input type="number" className="input" style={{ width: 90 }} min={1} max={max} value={n} onChange={(e) => setSize(+e.target.value || 1)} />
            </div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              {bank.sizes.filter((x) => x <= max).map((x) => (
                <button type="button" key={x} className={`btn sm ${x === n ? "primary" : ""}`} onClick={() => setSize(x)}>{x}</button>
              ))}
            </div>
          </label>

          <label className="field">
            <span>Tiempo</span>
            <div className="row">
              <input type="number" className="input" style={{ width: 90 }} min={0.5} max={10} step={0.5} value={mpq} disabled={noLimit} onChange={(e) => setMpq(+e.target.value || 2)} />
              <span className="small muted">minutos por pregunta</span>
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} /> Sin límite
              </label>
            </div>
          </label>

          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <span style={{ display: "block", fontWeight: 650, marginBottom: 6 }}>Materias / temas</span>
            <div className="topics">
              {bank.subjects.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={subjects.includes(s)}
                    onChange={(e) => setSubjects(e.target.checked ? bank.subjects.filter((x) => x === s || subjects.includes(x)) : subjects.filter((x) => x !== s))}
                  />
                  {s}
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className="linkbtn small" onClick={() => setSubjects(bank.subjects)}>Seleccionar todas</button>
              <button type="button" className="linkbtn small" onClick={() => setSubjects([])}>Quitar todas</button>
            </div>
          </fieldset>

          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <span style={{ display: "block", fontWeight: 650, marginBottom: 2 }}>Opciones</span>
            <div className="row">
              <label className="check"><input type="radio" name="ord" checked={order === "mix"} onChange={() => setOrder("mix")} /> Materias mezcladas</label>
              <label className="check"><input type="radio" name="ord" checked={order === "group"} onChange={() => setOrder("group")} /> Agrupadas por materia</label>
            </div>
            <label className="check"><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffle(e.target.checked)} /> Barajar el orden de las opciones A/B/C/D</label>
            <label className="check"><input type="checkbox" checked={preferUnseen} onChange={(e) => setPreferUnseen(e.target.checked)} /> Priorizar preguntas que todavía no he visto</label>
            <label className="check"><input type="checkbox" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} /> Retroalimentación inmediata: cada pregunta se califica al comprobarla y queda bloqueada</label>
          </fieldset>

          <div className="summary">{summary}</div>
          <button className="btn primary block" disabled={busy || !subjects.length}>{busy ? "Generando…" : "Generar intento aleatorio"}</button>
          {stats.saved > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn warn grow" disabled={busy} onClick={() => start("saved")}>★ Practicar mis {stats.saved} guardadas</button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={async () => {
                  if (!confirm("¿Vaciar la lista de preguntas guardadas de este banco?")) return;
                  await api(`/api/saved?bank=${bank.slug}`, { method: "DELETE" }).catch(() => {});
                  onReload();
                }}
              >
                Vaciar lista
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

// =====================================================================
// Examen
// =====================================================================
function Exam({ attempt, onDone }: { attempt: AttemptView; onDone: (r: Review) => void }) {
  const qs = attempt.questions;
  const fb = attempt.config.feedback;
  const [cur, setCur] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(attempt.answers);
  const [flags, setFlags] = useState<number[]>(attempt.flags);
  const [graded, setGraded] = useState<Record<number, Graded>>(attempt.graded);
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useMemo(() => new Date(attempt.serverNow).getTime() - Date.now(), [attempt.serverNow]);
  const deadline = attempt.deadline ? new Date(attempt.deadline).getTime() : null;
  const [now, setNow] = useState(() => Date.now() + offset);
  const state = useRef({ answers, flags, dirty: false, submitting: false });
  state.current.answers = answers;
  state.current.flags = flags;

  // Autoguardado
  const save = useCallback(async () => {
    if (!state.current.dirty || state.current.submitting) return;
    state.current.dirty = false;
    try {
      await api(`/api/attempts/${attempt.id}`, { method: "PATCH", body: { answers: state.current.answers, flags: state.current.flags } });
    } catch {
      state.current.dirty = true;
    }
  }, [attempt.id]);
  useEffect(() => {
    const t = setInterval(save, 4000);
    return () => clearInterval(t);
  }, [save]);

  const submit = useCallback(async () => {
    if (state.current.submitting) return;
    state.current.submitting = true;
    setBusy(true);
    try {
      const r = await api<Review>(`/api/attempts/${attempt.id}/submit`, {
        body: { answers: state.current.answers, flags: state.current.flags },
      });
      onDone(r);
    } catch (e) {
      state.current.submitting = false;
      setError(errMsg(e));
      setBusy(false);
    }
  }, [attempt.id, onDone]);

  // Cronómetro
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  const remaining = deadline ? (deadline - now) / 1000 : null;
  useEffect(() => {
    if (remaining !== null && remaining <= 0) submit();
  }, [remaining, submit]);

  // Aviso al salir con el examen abierto
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (!state.current.submitting) { save(); e.preventDefault(); } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save]);

  const q = qs[cur];
  const g = graded[cur];
  const locked = !!g;
  const answered = Object.keys(answers).length;

  const choose = (i: number) => {
    if (locked) return;
    setAnswers({ ...answers, [cur]: i });
    state.current.dirty = true;
  };
  const check = async (index = cur) => {
    if (!fb || graded[index] || answers[index] === undefined) return;
    try {
      const r = await api<Graded>(`/api/attempts/${attempt.id}/lock`, { body: { index, choice: answers[index] } });
      setGraded((p) => ({ ...p, [index]: r }));
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const go = (i: number) => {
    if (i < 0 || i >= qs.length || i === cur) return;
    if (fb) check(cur); // como el original: al cambiar de pregunta se califica
    setCur(i);
    setNavOpen(false);
    if (window.innerWidth < 960) window.scrollTo(0, 0);
  };
  const toggleFlag = () => {
    setFlags(flags.includes(cur) ? flags.filter((x) => x !== cur) : [...flags, cur]);
    state.current.dirty = true;
  };
  const finish = () => {
    const blank = qs.length - answered;
    const msg = blank
      ? `Tienes ${blank} pregunta(s) sin responder. Cuentan como incorrectas. ¿Entregar de todos modos?`
      : "¿Deseas entregar este intento?";
    if (confirm(msg)) submit();
  };

  // Atajos de teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "arrowright") go(cur + 1);
      else if (k === "arrowleft") go(cur - 1);
      else if (["a", "b", "c", "d"].includes(k) && L.indexOf(k.toUpperCase()) < q.opts.length) choose(L.indexOf(k.toUpperCase()));
      else if (k === "m") toggleFlag();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const okCount = Object.values(graded).filter((x) => x.isCorrect).length;
  const badCount = Object.values(graded).length - okCount;

  return (
    <>
      <div className="ex-bar">
        <div className="wrap">
          <b>Pregunta {cur + 1} de {qs.length}</b>
          <span className="muted small">
            {answered} respondidas · {flags.length} marcadas{fb && ` · ${okCount} ✓ · ${badCount} ✗`}
          </span>
          <span className={`timer ${remaining !== null && remaining < Math.max(60, qs.length * 12) ? "warn" : ""}`}>
            {remaining === null ? "Sin límite" : fmtTime(remaining)}
          </span>
          <button className="btn sm nav-toggle" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen}>Índice</button>
          <button className="btn danger sm" onClick={finish} disabled={busy}>{busy ? "Entregando…" : "Finalizar examen"}</button>
        </div>
      </div>
      <div className="wrap ex-grid">
        <aside className={`card ex-nav ${navOpen ? "open" : ""}`}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Índice de preguntas</h3>
          <div className="cells">
            {qs.map((x, i) => {
              const gi = graded[i];
              const cls = gi ? (gi.isCorrect ? "ok" : "bad") : answers[i] !== undefined ? "ans" : "";
              return (
                <button key={i} className={`cell ${cls} ${flags.includes(i) ? "flag" : ""} ${i === cur ? "cur" : ""}`} onClick={() => go(i)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span><i style={{ background: "var(--soft)", borderColor: "var(--blue)" }} />Respondida</span>
            <span><i style={{ background: "var(--mark)", borderColor: "var(--mark)" }} />Marcada para revisar</span>
            {fb && <span><i style={{ background: "var(--ok-soft)", borderColor: "var(--ok)" }} />Correcta</span>}
            {fb && <span><i style={{ background: "var(--bad-soft)", borderColor: "var(--bad)" }} />Incorrecta</span>}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Atajos: ← → para navegar, A–D para responder, M para marcar.</p>
        </aside>

        <article className="card qcard protected">
          {error && <div className="alert error">{error}</div>}
          <div className="q-meta">
            <span className="row" style={{ gap: 6 }}>
              {q.kind && <span className="badge">{q.kind}</span>}
              {q.level && <span className="badge">{q.level}</span>}
              {(locked || attempt.config.order === "group") && <span className="badge">{q.subject}</span>}
            </span>
            <button className={`btn sm ${flags.includes(cur) ? "warn" : ""}`} onClick={toggleFlag}>
              {flags.includes(cur) ? "★ Marcada" : "☆ Marcar para revisar"}
            </button>
          </div>
          <div className="q-text">{q.q}</div>
          <div>
            {q.opts.map((t, i) => {
              let cls = answers[cur] === i ? "sel" : "";
              let tag = "";
              if (g) {
                if (i === g.correct) { cls = "correct"; tag = answers[cur] === i ? "Tu respuesta · correcta" : "Respuesta correcta"; }
                else if (answers[cur] === i) { cls = "wrong"; tag = "Tu respuesta"; }
                else cls = "";
              }
              return (
                <button key={i} className={`opt ${cls}`} disabled={locked} onClick={() => choose(i)}>
                  <span className="k">{L[i]}</span>
                  <span>{t}</span>
                  {tag && <span className="tag">{tag}</span>}
                </button>
              );
            })}
          </div>
          {fb && !g && (
            <button className="btn ok" style={{ marginTop: 6 }} disabled={answers[cur] === undefined} onClick={() => check()}>
              Comprobar respuesta
            </button>
          )}
          {g && <Explanation item={g} />}
          <div className="qnav">
            <button className="btn" disabled={cur === 0} onClick={() => go(cur - 1)}>← Anterior</button>
            {cur < qs.length - 1 ? (
              <button className="btn primary" onClick={() => go(cur + 1)}>Siguiente →</button>
            ) : (
              <button className="btn red" onClick={finish} disabled={busy}>Finalizar examen</button>
            )}
          </div>
          {!fb && <p className="tiny muted" style={{ marginBottom: 0 }}>No se muestran respuestas hasta entregar. Tu avance se guarda automáticamente.</p>}
        </article>
      </div>
    </>
  );
}

function Explanation({ item }: { item: Pick<Graded, "exp" | "quote" | "source" | "slide" | "basis"> }) {
  return (
    <div className="explain">
      <h4>Explicación</h4>
      <p>{item.exp}</p>
      {item.quote && (
        <>
          <h4>Cita textual del material</h4>
          <blockquote>“{item.quote}”</blockquote>
        </>
      )}
      {(item.source || item.basis) && (
        <p className="tiny muted">
          Fuente: {item.source || item.basis}
          {item.slide ? `, diapositiva «${item.slide}»` : ""}
        </p>
      )}
    </div>
  );
}

// =====================================================================
// Resultados y revisión
// =====================================================================
type Filter = "all" | "wrong" | "bad" | "blank" | "ok" | "flag";
const FILTERS: [Filter, string][] = [
  ["all", "Todas"],
  ["wrong", "Errores y vacías"],
  ["bad", "Incorrectas"],
  ["blank", "Sin responder"],
  ["ok", "Correctas"],
  ["flag", "★ Marcadas"],
];
const stateOf = (it: ReviewItem) => (it.answer === null ? "blank" : it.answer === it.correct ? "ok" : "bad");

export function ReviewView({ review, onNew }: { review: Review; onNew?: () => void }) {
  const [filter, setFilter] = useState<Filter | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>(() => Object.fromEntries(review.items.map((i) => [i.id, i.saved])));
  const listRef = useRef<HTMLDivElement>(null);
  const pass = review.score >= review.passScore;
  const pct = review.total ? review.correct / review.total : 0;
  const wrong = review.answered - review.correct;
  const blank = review.total - review.answered;

  const list = review.items.filter((it) => {
    const s = stateOf(it);
    if (!filter || filter === "all") return true;
    if (filter === "wrong") return s !== "ok";
    if (filter === "flag") return it.flagged || (review.mode === "saved" && saved[it.id]);
    return s === filter;
  });
  const show = (f: Filter) => {
    setFilter(f);
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };
  const toggleSave = async (id: string) => {
    const v = !saved[id];
    setSaved({ ...saved, [id]: v });
    try {
      await api("/api/saved", { body: { questionId: id, saved: v } });
    } catch {
      setSaved({ ...saved, [id]: !v });
    }
  };

  return (
    <main className="page wrap">
      <div className="card">
        <div className="result-hero">
          <div className="score-ring" style={{ background: `conic-gradient(${pass ? "var(--ok)" : "var(--bad)"} ${pct * 360}deg, #e6ebf2 0)` }}>
            <div><b>{review.score.toFixed(2)}</b><span className="muted">/20</span></div>
          </div>
          <div>
            <p className="muted small" style={{ margin: 0 }}>{review.bankTitle} · {fmtDate(review.submittedAt)}{review.mode === "saved" ? " · repaso de guardadas" : ""}</p>
            <h2 style={{ color: "var(--navy)", margin: "4px 0 8px" }}>Resultado</h2>
            <p style={{ fontSize: "1.1rem", margin: "0 0 6px" }}>
              {pass ? <span className="pass">Referencia de 14/20 alcanzada.</span> : <span className="fail">Por debajo de la referencia de 14/20.</span>}
            </p>
            <p style={{ margin: 0 }}>
              <b>{review.correct}</b> correctas · <b>{wrong}</b> incorrectas · <b>{blank}</b> sin responder ·{" "}
              {Math.round(pct * 1000) / 10}% de aciertos
            </p>
            <p className="tiny muted">Nota proporcional: aciertos × 20 / número de preguntas del intento.</p>
          </div>
        </div>

        {review.bySubject.length > 1 && (
          <>
            <h3 style={{ margin: "20px 0 6px", fontSize: "1.05rem" }}>Rendimiento por materia</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Materia</th><th>Aciertos</th><th>%</th><th>Equivalente /20</th></tr></thead>
                <tbody>
                  {review.bySubject.map((s) => (
                    <tr key={s.subject}>
                      <td>{s.subject}</td>
                      <td><b>{s.correct}/{s.total}</b></td>
                      <td>{Math.round((s.correct / s.total) * 100)}%</td>
                      <td className={(s.correct * 20) / s.total >= 14 ? "pass" : "fail"}>{((s.correct * 20) / s.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={() => show("all")}>Revisar todas</button>
          <button className="btn danger" onClick={() => show("wrong")}>Solo errores y vacías</button>
          <button className="btn warn" onClick={() => show("flag")}>★ Revisar marcadas</button>
          {onNew ? (
            <button className="btn ok" onClick={onNew}>Nuevo intento</button>
          ) : (
            <Link className="btn ok" href={`/panel/${review.bank}`}>Nuevo intento</Link>
          )}
          <Link className="btn ghost" href="/panel">Volver al panel</Link>
        </div>
      </div>

      {filter && (
        <div className="card protected" ref={listRef}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <h2 style={{ color: "var(--navy)", fontSize: "1.25rem" }}>Revisión explicada</h2>
            <div className="filters">
              {FILTERS.map(([f, label]) => (
                <button key={f} className={`btn sm ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{label}</button>
              ))}
            </div>
          </div>
          {!list.length && <p className="muted">No hay preguntas en este filtro.</p>}
          {list.map((it) => {
            const s = stateOf(it);
            return (
              <div key={it.index} className={`rev-item ${s}`}>
                <div className="row" style={{ gap: 6 }}>
                  <b className="small">#{it.index + 1}</b>
                  <span className="badge">{it.subject}</span>
                  {it.kind && <span className="badge">{it.kind}</span>}
                  <span className={`badge ${s === "ok" ? "ok" : s === "bad" ? "bad" : "warn"}`}>
                    {s === "ok" ? "Correcta" : s === "bad" ? "Incorrecta" : "Sin responder"}
                  </span>
                  {it.flagged && <span className="badge mark">★ Marcada</span>}
                </div>
                <div className="q-text" style={{ fontSize: "1.05rem", margin: "10px 0" }}>{it.q}</div>
                {it.opts.map((t, k) => {
                  const cls = k === it.correct ? "correct" : k === it.answer ? "wrong" : "";
                  const tag = k === it.correct ? (k === it.answer ? "✓ Tu respuesta · correcta" : "✓ Correcta") : k === it.answer ? "✗ Tu respuesta" : "";
                  return (
                    <div key={k} className={`opt ${cls}`} style={{ cursor: "default" }}>
                      <span className="k">{L[k]}</span>
                      <span>{t}</span>
                      {tag && <span className="tag">{tag}</span>}
                    </div>
                  );
                })}
                <Explanation item={it} />
                <button className="btn sm" style={{ marginTop: 8 }} onClick={() => toggleSave(it.id)}>
                  {saved[it.id] ? "★ Guardada para repasar (quitar)" : "☆ Guardar para repasar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export function AttemptPage({ id }: { id: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Review>(`/api/attempts/${id}`).then(setReview).catch((e) => setError(errMsg(e)));
  }, [id]);
  if (error) return <main className="page wrap"><div className="alert error">{error}</div><Link href="/panel">← Volver</Link></main>;
  if (!review) return <main className="page wrap"><p className="muted">Cargando…</p></main>;
  return <ReviewView review={review} />;
}
