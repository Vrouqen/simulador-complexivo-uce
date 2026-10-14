"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import { getFingerprint } from "@/lib/client/fingerprint";

const REASONS: Record<string, string> = {
  KICKED: "Tu sesión se cerró porque alguien inició sesión con tu licencia. Si no fuiste tú, cambia tu contraseña contactando al administrador.",
  REVOKED: "Tu sesión se cerró por seguridad: se detectó un cambio de equipo o navegador.",
  EXPIRED_SESSION: "Tu sesión expiró. Vuelve a ingresar.",
  BLOCKED: "Tu licencia está bloqueada. Contacta al administrador.",
  EXPIRED: "Tu licencia ha vencido. Contacta al administrador para renovarla.",
};

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function LoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("/api/auth/login", { body: { email, password, fp: getFingerprint() } });
          router.replace("/panel");
          router.refresh();
        });
      }}
    >
      <h1 style={{ color: "var(--navy)", fontSize: "1.6rem", marginBottom: 6 }}>Ingresar</h1>
      <p className="muted small" style={{ marginTop: 0 }}>Usa el correo de tu licencia y la contraseña que creaste al activarla.</p>
      {reason && REASONS[reason] && <div className="alert warn">{REASONS[reason]}</div>}
      {error && <div className="alert error">{error}</div>}
      <label className="field">
        <span>Correo</span>
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn primary block" disabled={busy}>{busy ? "Verificando…" : "Ingresar"}</button>
      <p className="small muted" style={{ marginBottom: 0 }}>
        ¿Recibiste un código? <Link href="/activar">Activa tu licencia</Link>. ¿Olvidaste tu contraseña o cambiaste de
        equipo? Contacta al administrador.
      </p>
    </form>
  );
}

export function ActivateForm() {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ email: "", code: "", password: "", password2: "", accept: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          if (f.password !== f.password2) throw new Error("Las contraseñas no coinciden.");
          if (!f.accept) throw new Error("Debes aceptar las condiciones de la licencia.");
          await api("/api/auth/activate", { body: { email: f.email, code: f.code, password: f.password, fp: getFingerprint() } });
          router.replace("/panel");
          router.refresh();
        });
      }}
    >
      <h1 style={{ color: "var(--navy)", fontSize: "1.6rem", marginBottom: 6 }}>Activar licencia</h1>
      <p className="muted small" style={{ marginTop: 0 }}>Ingresa el código que te entregó el administrador. Se usa una sola vez.</p>
      <div className="alert info small">
        <b>Importante:</b> la licencia quedará vinculada a <b>este equipo y este navegador</b>. Actívala en el
        dispositivo donde vas a estudiar. No funcionará en otros equipos.
      </div>
      {error && <div className="alert error">{error}</div>}
      <label className="field">
        <span>Correo registrado</span>
        <input className="input" type="email" autoComplete="email" required value={f.email} onChange={set("email")} />
      </label>
      <label className="field">
        <span>Código de activación</span>
        <input className="input mono" required placeholder="UCE-XXXX-XXXX-XXXX" value={f.code} onChange={set("code")} style={{ textTransform: "uppercase" }} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Crea una contraseña</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} required value={f.password} onChange={set("password")} />
          <small>Mínimo 8 caracteres.</small>
        </label>
        <label className="field">
          <span>Repite la contraseña</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} required value={f.password2} onChange={set("password2")} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.accept} onChange={set("accept")} />
        <span>Entiendo que la licencia es <b>personal e intransferible</b>, funciona en un solo dispositivo y que compartirla provoca su bloqueo.</span>
      </label>
      <button className="btn primary block" disabled={busy} style={{ marginTop: 8 }}>{busy ? "Activando…" : "Activar y entrar"}</button>
    </form>
  );
}

type BankOpt = { slug: string; title: string };

export function RequestForm({ banks }: { banks: BankOpt[] }) {
  const { busy, error, run } = useSubmit();
  const [done, setDone] = useState(false);
  const [f, setF] = useState({ fullName: "", idNumber: "", email: "", phone: "", paymentRef: "", message: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  if (done) {
    return (
      <div className="card">
        <h1 style={{ color: "var(--navy)", fontSize: "1.5rem" }}>¡Solicitud enviada!</h1>
        <p>Validaremos tu pago y te enviaremos el <b>código de activación</b> al correo o WhatsApp que registraste.</p>
        <p className="muted small">Cuando lo recibas, entra a <Link href="/activar">Activar licencia</Link> desde el equipo donde vas a estudiar.</p>
      </div>
    );
  }
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("/api/requests", { body: { ...f, banks: ["*"] } });
          setDone(true);
        });
      }}
    >
      <h1 style={{ color: "var(--navy)", fontSize: "1.6rem", marginBottom: 6 }}>Solicitar licencia</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Primero realiza el pago. Luego envía este formulario con el número de comprobante para que podamos validarlo.
        La licencia incluye: {banks.map((b) => b.title).join(", ")}.
      </p>
      {error && <div className="alert error">{error}</div>}
      <label className="field">
        <span>Nombre completo</span>
        <input className="input" required value={f.fullName} onChange={set("fullName")} autoComplete="name" />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Cédula</span>
          <input className="input" required inputMode="numeric" pattern="\d{10}" maxLength={10} value={f.idNumber} onChange={set("idNumber")} />
        </label>
        <label className="field">
          <span>WhatsApp / teléfono</span>
          <input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" />
        </label>
      </div>
      <label className="field">
        <span>Correo</span>
        <input className="input" type="email" required value={f.email} onChange={set("email")} autoComplete="email" />
        <small>Será tu usuario. Usa un correo propio: la licencia queda a tu nombre.</small>
      </label>
      <label className="field">
        <span>Número de comprobante / referencia del pago</span>
        <input className="input" required value={f.paymentRef} onChange={set("paymentRef")} />
      </label>
      <label className="field">
        <span>Comentario (opcional)</span>
        <textarea className="input" value={f.message} onChange={set("message")} maxLength={1000} />
      </label>
      <button className="btn primary block" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitud"}</button>
    </form>
  );
}
