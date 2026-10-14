import Link from "next/link";
import { Footer, PublicHeader } from "@/components/Header";
import { listBanks } from "@/lib/exam";
import type { Bank } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let banks: Bank[] = [];
  try {
    banks = await listBanks();
  } catch (e) {
    console.error("No se pudieron cargar los bancos", e);
  }
  const total = banks.reduce((n, b) => n + b.total, 0);

  return (
    <>
      <PublicHeader />
      <section className="hero">
        <div className="wrap">
          <h1>Prepárate para el examen complexivo con simulacros reales</h1>
          <p className="lead">
            Bancos de preguntas con casos de estudio, cronómetro oficial, calificación sobre 20, revisión explicada y
            repaso de tus preguntas marcadas. Acceso personal con licencia.
          </p>
          <div className="row">
            <Link href="/ingresar" className="btn light">Ingresar</Link>
            <Link href="/activar" className="btn outline">Activar mi licencia</Link>
          </div>
          <div className="kpis">
            <div><b>{total || "640"}</b><span>preguntas en total</span></div>
            <div><b>{banks.length || 3}</b><span>bancos de práctica</span></div>
            <div><b>2 min</b><span>por pregunta (ritmo oficial)</span></div>
            <div><b>/20</b><span>nota con referencia 14</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>Bancos incluidos</h2>
          <p className="muted">Cada intento se genera al azar y de forma equilibrada entre las materias o temas que elijas.</p>
          <div className="cards3">
            {banks.map((b) => (
              <div key={b.slug} className="card bank-card">
                <h3>{b.title}</h3>
                <span className="muted small">{b.subtitle}</span>
                <div className="count">{b.total}</div>
                <span className="muted small">preguntas</span>
                <p className="small">{b.description}</p>
                <ul>
                  {b.subjects.slice(0, 6).map((s) => <li key={s}>{s}</li>)}
                  {b.subjects.length > 6 && <li>y {b.subjects.length - 6} temas más</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: "#fff", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="wrap">
          <h2>¿Cómo accedo?</h2>
          <div className="steps three">
            <div><h3>Recibe tu código</h3><p>El administrador te entrega un código de activación personal.</p></div>
            <div><h3>Activa tu licencia</h3><p>Entra a «Activar licencia» desde el equipo donde vas a estudiar y crea tu contraseña.</p></div>
            <div><h3>Practica</h3><p>Ingresa con tu correo y contraseña cuando quieras y genera intentos aleatorios.</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap medium">
          <div className="card">
            <h3 style={{ color: "var(--navy)", marginBottom: 8 }}>Condiciones de la licencia</h3>
            <ul className="rules">
              <li><b>Una licencia = una persona.</b> Está registrada a tu nombre, cédula y correo.</li>
              <li><b>Un solo dispositivo.</b> Al activarla queda vinculada al equipo y navegador donde la activas. No funciona en otros equipos.</li>
              <li><b>Una sesión a la vez.</b> Si alguien inicia sesión con tus datos, tu sesión se cierra y queda registrado.</li>
              <li><b>Uso compartido = bloqueo.</b> El sistema detecta accesos desde varios equipos y bloquea la licencia automáticamente.</li>
              <li>¿Cambiaste de computadora o borraste el navegador? Contacta al administrador para liberar tu dispositivo.</li>
            </ul>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
