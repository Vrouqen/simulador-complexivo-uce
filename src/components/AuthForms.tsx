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
