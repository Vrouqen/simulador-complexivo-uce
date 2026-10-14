"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import { Brand } from "./Header";

type BankOpt = { slug: string; title: string };
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fmt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("es-EC", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const STATUS: Record<string, [string, string]> = {
  pending: ["warn", "Pendiente de activar"],
  active: ["ok", "Activa"],
  blocked: ["bad", "Bloqueada"],
};
function StatusBadge({ row }: { row: Row }) {
  const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
  if (expired && row.status !== "blocked") return <span className="badge bad">Vencida</span>;
  const [c, t] = STATUS[row.status] || ["", row.status];
  return <span className={`badge ${c}`}>{t}</span>;
}

const EVENT_LABELS: Record<string, string> = {
  license_created: "Licencia creada",
  license_updated: "Datos actualizados",
  activated: "Licencia activada",
  activation_failed: "Código de activación incorrecto",
  device_registered: "Dispositivo registrado",
  device_released: "Dispositivo liberado por el admin",
  code_regenerated: "Nuevo código generado",
  login: "Inicio de sesión",
  login_failed: "Contraseña incorrecta",
  login_other_device: "Intento de ingreso desde OTRO dispositivo (rechazado)",
  device_cookie_copied: "Cookie del navegador copiada a otro equipo (rechazado)",
  session_cookie_copied: "Sesión copiada a otro navegador (cerrada)",
  session_fp_mismatch: "Sesión usada desde otro equipo (cerrada)",
  concurrent_use: "Uso simultáneo detectado",
  auto_blocked: "BLOQUEO AUTOMÁTICO por uso compartido",
  blocked: "Bloqueada por el admin",
  unblocked: "Desbloqueada por el admin",
  admin_logout: "Sesiones cerradas por el admin",
};

export function AdminHeader() {
  return (
    <header className="band">
      <div className="wrap">
        <Brand href="/admin" />
        <nav>
          <Link href="/admin">Licencias</Link>
          <Link href="/" target="_blank">Ver sitio</Link>
          <button
            onClick={async () => {
              await api("/api/admin/logout", { method: "POST" }).catch(() => {});
              window.location.href = "/admin/login";
            }}
          >
            Salir
          </button>
        </nav>
      </div>
    </header>
  );
}

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/admin/login", { body: { email, password } });
          window.location.href = "/admin";
        } catch (err) {
          setError(errMsg(err));
          setBusy(false);
        }
      }}
    >
      <h1 style={{ color: "var(--navy)", fontSize: "1.5rem", marginBottom: 12 }}>Administración</h1>
      {error && <div className="alert error">{error}</div>}
      <label className="field"><span>Correo</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span>Contraseña</span><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="btn primary block" disabled={busy}>Ingresar</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Modal con el código de activación y el mensaje listo para enviar
// ---------------------------------------------------------------------------
type Created = { code: string; email: string; fullName: string; phone?: string | null };

function CodeModal({ data, onClose }: { data: Created; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const msg =
    `Hola ${data.fullName.split(" ")[0]}, tu licencia del Simulador Complexivo UCE está lista ✅\n\n` +
    `1. Entra a ${origin}/activar desde el computador o celular donde vas a estudiar.\n` +
    `2. Correo: ${data.email}\n` +
    `3. Código de activación: ${data.code}\n` +
    `4. Crea tu contraseña.\n\n` +
    `Importante: la licencia es personal y queda vinculada a ese único dispositivo. ` +
    `Si se usa en otro equipo o se comparte, se bloquea automáticamente.`;
  const phone = (data.phone || "").replace(/\D/g, "");
  const waPhone = phone.startsWith("0") ? "593" + phone.slice(1) : phone;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Código de activación generado</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Cópialo ahora: por seguridad <b>no se vuelve a mostrar</b> (solo se guarda cifrado). Si se pierde, genera uno nuevo.
        </p>
        <div className="code-box">{data.code}</div>
        <label className="field">
          <span>Mensaje para enviar a {data.fullName}</span>
          <textarea className="input" readOnly value={msg} style={{ minHeight: 190 }} />
        </label>
        <div className="row">
          <button
            className="btn primary"
            onClick={() => navigator.clipboard.writeText(msg).then(() => setCopied(true))}
          >
            {copied ? "¡Copiado!" : "Copiar mensaje"}
          </button>
          {waPhone && (
            <a className="btn ok" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`}>
              Enviar por WhatsApp
            </a>
          )}
          <a className="btn" href={`mailto:${data.email}?subject=${encodeURIComponent("Tu licencia del Simulador Complexivo UCE")}&body=${encodeURIComponent(msg)}`}>
            Enviar por correo
          </a>
          <button className="btn ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de licencia (crear / editar / aprobar)
// ---------------------------------------------------------------------------
type LicForm = {
  fullName: string; email: string; idNumber: string; phone: string; paymentRef: string;
  amount: string; expiresAt: string; notes: string; banks: string[]; maxDevices: number;
};
const emptyForm: LicForm = {
  fullName: "", email: "", idNumber: "", phone: "", paymentRef: "", amount: "", expiresAt: "", notes: "", banks: ["*"], maxDevices: 1,
};

function LicenseForm({ banks, initial, submitLabel, onSubmit }: {
  banks: BankOpt[]; initial: LicForm; submitLabel: string; onSubmit: (f: LicForm) => Promise<void>;
}) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof LicForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const all = f.banks.includes("*");
  const toggleBank = (slug: string, on: boolean) => {
    const cur = all ? banks.map((b) => b.slug) : f.banks;
    const next = on ? [...cur, slug] : cur.filter((x) => x !== slug);
    setF({ ...f, banks: next.length === banks.length ? ["*"] : next });
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(f);
        } catch (err) {
          setError(errMsg(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <div className="alert error">{error}</div>}
      <div className="grid2">
        <label className="field"><span>Nombre completo *</span><input className="input" required value={f.fullName} onChange={set("fullName")} /></label>
        <label className="field"><span>Correo *</span><input className="input" type="email" required value={f.email} onChange={set("email")} /></label>
        <label className="field"><span>Cédula</span><input className="input" value={f.idNumber} onChange={set("idNumber")} /></label>
        <label className="field"><span>WhatsApp / teléfono</span><input className="input" value={f.phone} onChange={set("phone")} /></label>
        <label className="field"><span>Referencia del pago</span><input className="input" value={f.paymentRef} onChange={set("paymentRef")} /></label>
        <label className="field"><span>Monto pagado ($)</span><input className="input" type="number" step="0.01" min="0" value={f.amount} onChange={set("amount")} /></label>
        <label className="field"><span>Vence el (opcional)</span><input className="input" type="date" value={f.expiresAt} onChange={set("expiresAt")} /><small>Vacío = sin vencimiento.</small></label>
        <label className="field">
          <span>Dispositivos permitidos</span>
          <input className="input" type="number" min={1} max={3} value={f.maxDevices} onChange={(e) => setF({ ...f, maxDevices: +e.target.value || 1 })} />
          <small>Recomendado: 1 (licencia de un solo dispositivo).</small>
        </label>
      </div>
      <div className="field">
        <span>Bancos incluidos</span>
        <div className="row">
          {banks.map((b) => (
            <label key={b.slug} className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={all || f.banks.includes(b.slug)} onChange={(e) => toggleBank(b.slug, e.target.checked)} /> {b.title}
            </label>
          ))}
        </div>
      </div>
      <label className="field"><span>Notas internas</span><textarea className="input" value={f.notes} onChange={set("notes")} /></label>
      <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : submitLabel}</button>
    </form>
  );
}

const toPayload = (f: LicForm) => ({ ...f, amount: f.amount === "" ? null : Number(f.amount), expiresAt: f.expiresAt || null });

// ---------------------------------------------------------------------------
// Pantalla principal de administración
// ---------------------------------------------------------------------------
export function AdminApp({ banks }: { banks: BankOpt[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"licenses" | "new">("licenses");
  const [stats, setStats] = useState<Row | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(() => api<Row>("/api/admin/overview").then(setStats).catch(() => {}), []);
  const loadRows = useCallback(() => {
    api<Row[]>(`/api/admin/licenses?q=${encodeURIComponent(q)}`).then(setRows).catch((e) => setError(errMsg(e)));
  }, [q]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setTimeout(loadRows, 250); return () => clearTimeout(t); }, [loadRows]);

  const refresh = () => { loadStats(); loadRows(); };

  return (
    <>
      {stats && (
        <div className="adm-stats five">
          <div><b>{stats.active}</b><span>Licencias activas</span></div>
          <div><b>{stats.pending}</b><span>Pendientes de activar</span></div>
          <div><b>{stats.blocked}</b><span>Bloqueadas</span></div>
          <div><b style={{ color: stats.alerts ? "var(--red)" : undefined }}>{stats.alerts}</b><span>Alertas de uso compartido (7 d)</span></div>
          <div><b>${Number(stats.revenue).toFixed(2)}</b><span>Ingresos registrados</span></div>
        </div>
      )}
      <div className="tabs">
        <button className={tab === "licenses" ? "on" : ""} onClick={() => setTab("licenses")}>Licencias</button>
        <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>+ Nueva licencia</button>
      </div>
      {error && <div className="alert error">{error}</div>}

      {tab === "licenses" && (
        <div className="card">
          <input className="input" placeholder="Buscar por nombre, correo o cédula…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
          {!rows ? <p className="muted">Cargando…</p> : !rows.length ? <p className="muted">No hay licencias.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Titular</th><th>Estado</th><th>Dispositivo</th><th>Alertas 7 d</th><th>Último acceso</th><th>Intentos</th><th>Pago</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="click" onClick={() => router.push(`/admin/licencia/${r.id}`)}>
                      <td><b>{r.full_name}</b><div className="tiny muted">{r.email}{r.id_number ? ` · ${r.id_number}` : ""}</div></td>
                      <td><StatusBadge row={r} /></td>
                      <td>{r.devices ? <span className="badge">Vinculado</span> : <span className="tiny muted">Libre</span>}</td>
                      <td>
                        {r.alerts > 0 && <span className="badge bad">{r.alerts} alerta(s)</span>}{" "}
                        {r.other_device > 0 && <span className="badge warn">{r.other_device} intento(s) otro equipo</span>}
                        {!r.alerts && !r.other_device && <span className="tiny muted">—</span>}
                      </td>
                      <td className="small">{fmt(r.last_seen_at)}</td>
                      <td>{r.attempts}</td>
                      <td className="small">{r.amount != null ? `$${Number(r.amount).toFixed(2)}` : ""}<div className="tiny muted">{r.payment_ref}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "new" && (
        <div className="card">
          <h2 style={{ fontSize: "1.15rem", color: "var(--navy)", marginBottom: 12 }}>Nueva licencia</h2>
          <LicenseForm
            key={created?.code || "new"}
            banks={banks}
            initial={emptyForm}
            submitLabel="Crear licencia y generar código"
            onSubmit={async (f) => {
              const r = await api<Created>("/api/admin/licenses", { body: toPayload(f) });
              setCreated({ ...r, phone: f.phone });
              refresh();
            }}
          />
        </div>
      )}

      {created && <CodeModal data={created} onClose={() => { setCreated(null); setTab("licenses"); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Detalle de una licencia
// ---------------------------------------------------------------------------
export function LicenseDetail({ id, banks }: { id: string; banks: BankOpt[] }) {
  const router = useRouter();
  const [d, setD] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const load = useCallback(() => {
    api<Row>(`/api/admin/licenses/${id}`).then(setD).catch((e) => setError(errMsg(e)));
  }, [id]);
  useEffect(load, [load]);

  const act = async (action: string, confirmMsg: string, extra: Row = {}) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      const r = await api<Row>(`/api/admin/licenses/${id}/action`, { body: { action, ...extra } });
      if (action === "delete") return router.push("/admin");
      if (r.code) setCreated({ code: r.code, email: r.email, fullName: r.fullName, phone: d?.license.phone });
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  if (error) return <div className="alert error">{error}</div>;
  if (!d) return <p className="muted">Cargando…</p>;
  const l = d.license;
  const activeDevice = d.devices.find((x: Row) => !x.revoked_at);
  const alerts = d.events.filter((e: Row) => e.severity === "alert").length;

  return (
    <>
      <Link href="/admin" className="small">← Todas las licencias</Link>
      <div className="dash-head" style={{ marginTop: 10 }}>
        <div>
          <h1>{l.full_name}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <StatusBadge row={l} />
            {alerts > 0 && <span className="badge bad">{alerts} alerta(s) de uso compartido</span>}
            <span className="small muted">{d.distinctIps7d} IP distinta(s) en 7 días</span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(!editing)}>{editing ? "Cancelar edición" : "Editar datos"}</button>
        </div>
      </div>
      {l.status === "blocked" && <div className="alert error"><b>Bloqueada:</b> {l.blocked_reason}</div>}
      {l.status === "pending" && (
        <div className="alert warn">
          Pendiente de activación (código terminado en <b className="mono">{l.code_hint}</b>). Si el titular perdió el código, genera uno nuevo.
        </div>
      )}

      {editing ? (
        <div className="card">
          <LicenseForm
            banks={banks}
            initial={{
              fullName: l.full_name, email: l.email, idNumber: l.id_number || "", phone: l.phone || "",
              paymentRef: l.payment_ref || "", amount: l.amount ?? "", notes: l.notes || "", banks: l.banks,
              expiresAt: l.expires_at ? String(l.expires_at).slice(0, 10) : "", maxDevices: l.max_devices,
            }}
            submitLabel="Guardar cambios"
            onSubmit={async (f) => {
              await api(`/api/admin/licenses/${id}`, { method: "PUT", body: toPayload(f) });
              setEditing(false);
              load();
            }}
          />
        </div>
      ) : (
        <div className="card">
          <dl className="kv">
            <dt>Correo</dt><dd>{l.email}</dd>
            <dt>Cédula</dt><dd>{l.id_number || "—"}</dd>
            <dt>Teléfono</dt><dd>{l.phone || "—"}</dd>
            <dt>Pago</dt><dd>{l.amount != null ? `$${Number(l.amount).toFixed(2)}` : "—"} · {l.payment_ref || "sin referencia"}</dd>
            <dt>Bancos</dt><dd>{l.banks.includes("*") ? "Todos" : l.banks.map((s: string) => banks.find((b) => b.slug === s)?.title || s).join(", ")}</dd>
            <dt>Vence</dt><dd>{l.expires_at ? fmt(l.expires_at) : "Sin vencimiento"}</dd>
            <dt>Creada</dt><dd>{fmt(l.created_at)}</dd>
            <dt>Activada</dt><dd>{fmt(l.activated_at)}</dd>
            <dt>Último acceso</dt><dd>{fmt(l.last_seen_at)}</dd>
            <dt>Dispositivo</dt>
            <dd>
              {activeDevice ? (
                <>
                  {activeDevice.fp?.os} · {activeDevice.fp?.browser} · pantalla {activeDevice.fp?.screen} · {activeDevice.fp?.tz}
                  <div className="tiny muted">{activeDevice.user_agent}</div>
                  <div className="tiny muted">Registrado {fmt(activeDevice.created_at)} · IP {activeDevice.last_ip}</div>
                </>
              ) : "Ninguno vinculado (el próximo ingreso registrará el equipo)"}
            </dd>
            {l.notes && (<><dt>Notas</dt><dd style={{ whiteSpace: "pre-line" }}>{l.notes}</dd></>)}
          </dl>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: "1.1rem", color: "var(--navy)", marginBottom: 10 }}>Acciones</h2>
        <div className="row">
          <button className="btn" disabled={!activeDevice} onClick={() => act("release_device", "¿Liberar el dispositivo? El titular podrá ingresar con su contraseña desde un equipo nuevo (y el anterior dejará de funcionar).")}>
            Liberar dispositivo
          </button>
          <button className="btn" onClick={() => act("new_code", "¿Generar un nuevo código de activación? Se borrará la contraseña y el dispositivo actual; el titular deberá activar de nuevo.")}>
            Nuevo código (olvidó contraseña)
          </button>
          <button className="btn" onClick={() => act("logout", "¿Cerrar todas las sesiones activas?")}>Cerrar sesiones</button>
          {l.status === "blocked" ? (
            <button className="btn ok" onClick={() => act("unblock", "¿Desbloquear la licencia? Las alertas previas dejarán de contar.")}>Desbloquear</button>
          ) : (
            <button
              className="btn danger"
              onClick={() => {
                const reason = prompt("Motivo del bloqueo (lo verá el titular):", "Licencia bloqueada por uso compartido.");
                if (reason !== null) act("block", "", { reason });
              }}
            >
              Bloquear
            </button>
          )}
          <button className="btn danger" onClick={() => act("delete", `¿ELIMINAR definitivamente la licencia de ${l.full_name} y todo su historial? No se puede deshacer.`)}>
            Eliminar
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1.1rem", color: "var(--navy)", marginBottom: 10 }}>Actividad y seguridad</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Evento</th><th>IP</th><th>Detalle</th></tr></thead>
            <tbody>
              {d.events.map((e: Row) => (
                <tr key={e.id} className={e.severity === "alert" ? "ev-alert" : e.severity === "warn" ? "ev-warn" : ""}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{fmt(e.created_at)}</td>
                  <td>{EVENT_LABELS[e.type] || e.type}</td>
                  <td className="small mono">{e.ip}</td>
                  <td className="tiny muted" style={{ maxWidth: 380 }}>
                    {e.detail?.similarity !== undefined && `Similitud del equipo: ${Math.round(e.detail.similarity * 100)}% · `}
                    {e.detail?.ua || e.detail?.reason || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1.1rem", color: "var(--navy)", marginBottom: 10 }}>Sesiones y dispositivos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Inicio</th><th>Última actividad</th><th>IP</th><th>Estado</th><th>Navegador</th></tr></thead>
            <tbody>
              {d.sessions.map((s: Row) => (
                <tr key={s.id}>
                  <td className="small">{fmt(s.created_at)}</td>
                  <td className="small">{fmt(s.last_seen_at)}</td>
                  <td className="small mono">{s.ip}</td>
                  <td>{s.revoked_at ? <span className="tiny muted">Cerrada ({s.revoke_reason})</span> : new Date(s.expires_at) > new Date() ? <span className="badge ok">Activa</span> : <span className="tiny muted">Expirada</span>}</td>
                  <td className="tiny muted">{s.user_agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ fontSize: "0.95rem", margin: "16px 0 6px" }}>Historial de dispositivos</h3>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {d.devices.map((x: Row) => (
                <tr key={x.id}>
                  <td className="small">{fmt(x.created_at)}</td>
                  <td className="small">{x.fp?.os} · {x.fp?.browser} · {x.fp?.screen}</td>
                  <td className="small mono">{x.first_ip}</td>
                  <td>{x.revoked_at ? <span className="tiny muted">Liberado {fmt(x.revoked_at)}</span> : <span className="badge ok">Vinculado</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1.1rem", color: "var(--navy)", marginBottom: 10 }}>Intentos ({d.attempts.length})</h2>
        <table className="table">
          <tbody>
            {d.attempts.map((a: Row) => (
              <tr key={a.id}>
                <td className="small">{fmt(a.submitted_at)}</td>
                <td>{a.title}</td>
                <td>{a.correct}/{a.total}</td>
                <td><b>{Number(a.score).toFixed(2)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {created && <CodeModal data={created} onClose={() => setCreated(null)} />}
    </>
  );
}
