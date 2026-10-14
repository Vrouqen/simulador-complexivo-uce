import Link from "next/link";
import { Footer, PublicHeader } from "@/components/Header";
import { listBanks } from "@/lib/exam";
import { site, whatsappLink } from "@/lib/site";
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
  const wa = whatsappLink("Hola, quiero comprar una licencia del Simulador Complexivo UCE.");

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
            <Link href="/solicitar" className="btn light">Comprar licencia</Link>
            <Link href="/ingresar" className="btn outline">Ya tengo licencia</Link>
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
          <h2>¿Cómo obtengo acceso?</h2>
          <div className="steps">
            <div><h3>Realiza el pago</h3><p>Transfiere el valor de la licencia con los datos de pago indicados abajo.</p></div>
            <div><h3>Envía tu solicitud</h3><p>Llena el formulario con tu nombre, cédula, correo y el número del comprobante.</p></div>
            <div><h3>Recibe tu código</h3><p>Validamos el pago y te enviamos un código de activación personal.</p></div>
            <div><h3>Activa y practica</h3><p>Activa la licencia en tu equipo, crea tu contraseña y empieza a practicar.</p></div>
          </div>
        </div>
      </section>

      <section className="section" id="comprar">
        <div className="wrap price-box">
          <div className="card">
            <span className="badge">Licencia personal</span>
            <div className="price" style={{ marginTop: 10 }}>{site.price}</div>
            <p className="muted">Acceso a todos los bancos incluidos en tu licencia, historial de intentos y repaso de preguntas marcadas.</p>
            <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>Datos para el pago</h3>
            <div className="payinfo">{site.paymentInfo}</div>
            <div className="row" style={{ marginTop: 16 }}>
              <Link href="/solicitar" className="btn primary">Enviar solicitud</Link>
              {wa && <a href={wa} className="btn ok" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>}
            </div>
          </div>
          <div className="card">
            <h3 style={{ color: "var(--navy)", marginBottom: 8 }}>Condiciones de la licencia</h3>
            <ul className="rules">
              <li><b>Una licencia = una persona.</b> Está registrada a tu nombre, cédula y correo.</li>
              <li><b>Un solo dispositivo.</b> Al activarla queda vinculada al equipo y navegador donde la activas. No funciona en otros equipos.</li>
              <li><b>Una sesión a la vez.</b> Si alguien inicia sesión con tus datos, tu sesión se cierra y queda registrado.</li>
              <li><b>Uso compartido = bloqueo.</b> El sistema detecta accesos desde varios equipos y bloquea la licencia automáticamente, sin reembolso.</li>
              <li>¿Cambiaste de computadora o borraste el navegador? Escríbenos y liberamos tu dispositivo.</li>
            </ul>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
