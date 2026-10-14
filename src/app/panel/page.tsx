import Link from "next/link";
import { redirect } from "next/navigation";
import { canUseBank, currentSession } from "@/lib/auth";
import { dashboard, listBanks } from "@/lib/exam";

export const metadata = { title: "Mis bancos" };

const fmt = (d: Date) =>
  d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Panel() {
  const r = await currentSession();
  if (!r.session) redirect("/ingresar");
  const s = r.session;
  const [banks, d] = await Promise.all([listBanks(), dashboard(s)]);
  const mine = banks.filter((b) => canUseBank(s, b.slug));
  const stat = new Map(d.stats.map((x) => [x.bank_slug, x]));

  return (
    <main className="page wrap">
      <div className="dash-head">
        <div>
          <p className="muted small" style={{ margin: 0 }}>Bienvenido/a</p>
          <h1>{s.license.fullName}</h1>
        </div>
        <span className="muted small">
          Licencia personal{s.license.expiresAt ? ` · vence el ${s.license.expiresAt.toLocaleDateString("es-EC")}` : " · sin vencimiento"}
        </span>
      </div>

      <div className="cards3">
        {mine.map((b) => {
          const st = stat.get(b.slug);
          return (
            <div key={b.slug} className="card bank-card">
              <h3>{b.title}</h3>
              <span className="muted small">{b.subtitle}</span>
              <div className="ledger" style={{ marginTop: 14 }}>
                <div><span>Preguntas en el banco</span><b>{b.total}</b></div>
                <div><span>Preguntas que ya viste</span><b>{st?.seen ?? 0}</b></div>
                <div><span>Guardadas para repasar</span><b>{st?.saved ?? 0}</b></div>
              </div>
              <div style={{ flex: 1 }} />
              <Link href={`/panel/${b.slug}`} className="btn primary block" style={{ marginTop: 16 }}>Practicar</Link>
            </div>
          );
        })}
      </div>
      {!mine.length && <div className="alert warn">Tu licencia no tiene bancos habilitados. Contacta al administrador.</div>}

      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: "1.2rem", color: "var(--navy)", marginBottom: 10 }}>Historial de intentos</h2>
        {d.attempts.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Banco</th><th>Aciertos</th><th>Nota /20</th><th></th></tr>
              </thead>
              <tbody>
                {d.attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{fmt(a.submitted_at)}</td>
                    <td>{a.title}{a.mode === "saved" && <span className="badge mark" style={{ marginLeft: 6 }}>Repaso</span>}</td>
                    <td>{a.correct}/{a.total}</td>
                    <td><b className={Number(a.score) >= 14 ? "pass" : "fail"}>{Number(a.score).toFixed(2)}</b></td>
                    <td><Link href={`/panel/intento/${a.id}`}>Revisar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Aún no has completado intentos.</p>
        )}
      </div>
    </main>
  );
}
