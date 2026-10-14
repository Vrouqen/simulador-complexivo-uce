import "server-only";
import { cookies } from "next/headers";
import { sql } from "./db";
import { hashCode, hmac, newActivationCode, safeEqual, sha256 } from "./crypto";
import { ApiError, clientInfo, isEmail, str } from "./http";
import { rateLimit } from "./ratelimit";
import { logEvent, revokeAllSessions } from "./auth";

// ---------- Sesión del administrador ----------
// Credenciales en variables de entorno (ADMIN_EMAIL / ADMIN_PASSWORD).
// La cookie va firmada con HMAC y expira en 12 h; cambiar la contraseña la invalida.

const ADMIN_COOKIE = "uce_a";
const ADMIN_HOURS = 12;

function adminCreds() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) {
    throw new ApiError(500, "ADMIN_NOT_CONFIGURED", "Configura ADMIN_EMAIL y ADMIN_PASSWORD (mín. 10 caracteres).");
  }
  return { email, password };
}

const version = () => sha256(adminCreds().password).slice(0, 12);

export async function adminLogin(email: string, password: string) {
  const { ip } = await clientInfo();
  await rateLimit(`admin:${ip}`, 6, 900, "Demasiados intentos. Espera 15 minutos.");
  const creds = adminCreds();
  const okEmail = safeEqual(sha256(email.trim().toLowerCase()), sha256(creds.email));
  const okPass = safeEqual(sha256(password), sha256(creds.password));
  if (!okEmail || !okPass) {
    await logEvent(null, "admin_login_failed", "warn", {}, ip);
    throw new ApiError(401, "INVALID_LOGIN", "Credenciales incorrectas.");
  }
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ADMIN_HOURS * 3600_000, v: version() })).toString("base64url");
  (await cookies()).set(ADMIN_COOKIE, `${payload}.${hmac("admin:" + payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_HOURS * 3600,
  });
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function isAdmin() {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, hmac("admin:" + payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() && data.v === version();
  } catch {
    return false;
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new ApiError(401, "NO_ADMIN", "Sesión de administrador requerida.");
}

// ---------- Licencias ----------

export type LicenseInput = {
  fullName: string;
  email: string;
  idNumber?: string;
  phone?: string;
  notes?: string;
  paymentRef?: string;
  amount?: number | null;
  banks?: string[];
  expiresAt?: string | null;
  maxDevices?: number;
};

function cleanLicense(b: Record<string, unknown>) {
  const fullName = str(b.fullName, 120);
  const email = str(b.email, 160).toLowerCase();
  if (fullName.length < 3) throw new ApiError(400, "BAD_REQUEST", "Escribe el nombre completo.");
  if (!isEmail(email)) throw new ApiError(400, "BAD_REQUEST", "Correo inválido.");
  const banks = Array.isArray(b.banks) && b.banks.length ? b.banks.map((x) => str(x, 40)).filter(Boolean) : ["*"];
  const amount = b.amount === "" || b.amount == null ? null : Number(b.amount);
  const exp = str(b.expiresAt, 40);
  // Una fecha sola (AAAA-MM-DD) vence al final de ese día en hora de Ecuador
  const expiresAt = exp ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(exp) ? `${exp}T23:59:59-05:00` : exp) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) throw new ApiError(400, "BAD_REQUEST", "Fecha de vencimiento inválida.");
  const maxDevices = Math.max(1, Math.min(3, Math.floor(Number(b.maxDevices) || 1)));
  return {
    full_name: fullName,
    email,
    id_number: str(b.idNumber, 30) || null,
    phone: str(b.phone, 30) || null,
    notes: str(b.notes, 1000) || null,
    payment_ref: str(b.paymentRef, 120) || null,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    banks,
    expires_at: expiresAt,
    max_devices: maxDevices,
  };
}

async function assertUniqueEmail(email: string, exceptId?: string) {
  const [dup] = await sql`select id from app.licenses where lower(email) = ${email} and id is distinct from ${exceptId ?? null}`;
  if (dup) throw new ApiError(409, "DUPLICATE", "Ya existe una licencia con ese correo. Cada persona solo puede tener una licencia.");
}
async function assertUniqueIdNumber(idNumber: string | null, exceptId?: string) {
  if (!idNumber) return;
  const [dup] = await sql`select id from app.licenses where id_number = ${idNumber} and id is distinct from ${exceptId ?? null}`;
  if (dup) throw new ApiError(409, "DUPLICATE", "Ya existe una licencia con esa cédula.");
}

export async function createLicense(b: Record<string, unknown>) {
  const v = cleanLicense(b);
  await assertUniqueEmail(v.email);
  await assertUniqueIdNumber(v.id_number);
  const code = newActivationCode();
  const [lic] = await sql<{ id: string }[]>`
    insert into app.licenses (full_name, email, id_number, phone, notes, payment_ref, amount, banks, expires_at,
                              max_devices, code_hash, code_hint)
    values (${v.full_name}, ${v.email}, ${v.id_number}, ${v.phone}, ${v.notes}, ${v.payment_ref}, ${v.amount},
            ${sql.json(v.banks)}, ${v.expires_at}, ${v.max_devices}, ${hashCode(code)}, ${code.slice(-4)})
    returning id`;
  await logEvent(lic.id, "license_created", "info", { by: "admin" });
  return { id: lic.id, code, email: v.email, fullName: v.full_name };
}

export async function updateLicense(id: string, b: Record<string, unknown>) {
  const v = cleanLicense(b);
  await assertUniqueEmail(v.email, id);
  await assertUniqueIdNumber(v.id_number, id);
  await sql`update app.licenses set full_name = ${v.full_name}, email = ${v.email}, id_number = ${v.id_number},
              phone = ${v.phone}, notes = ${v.notes}, payment_ref = ${v.payment_ref}, amount = ${v.amount},
              banks = ${sql.json(v.banks)}, expires_at = ${v.expires_at}, max_devices = ${v.max_devices}
            where id = ${id}`;
  await logEvent(id, "license_updated", "info", { by: "admin" });
}

export async function licenseAction(id: string, action: string, b: Record<string, unknown>) {
  const [lic] = await sql<{ id: string; full_name: string; email: string }[]>`select id, full_name, email from app.licenses where id = ${id}`;
  if (!lic) throw new ApiError(404, "NOT_FOUND", "Licencia no encontrada.");
  switch (action) {
    case "release_device": {
      // Libera el dispositivo: el próximo ingreso con su contraseña registra el equipo nuevo.
      await sql`update app.devices set revoked_at = now() where license_id = ${id} and revoked_at is null`;
      await revokeAllSessions(id, "device_released");
      await logEvent(id, "device_released", "info", { by: "admin" });
      return {};
    }
    case "new_code": {
      // Restablece por completo: nuevo código, borra contraseña y dispositivos.
      const code = newActivationCode();
      await sql`update app.licenses set code_hash = ${hashCode(code)}, code_hint = ${code.slice(-4)},
                  password_hash = null, status = case when status = 'blocked' then status else 'pending' end
                where id = ${id}`;
      await sql`update app.devices set revoked_at = now() where license_id = ${id} and revoked_at is null`;
      await revokeAllSessions(id, "reset");
      await logEvent(id, "code_regenerated", "info", { by: "admin" });
      return { code, email: lic.email, fullName: lic.full_name };
    }
    case "block": {
      const reason = str(b.reason, 300) || "Licencia bloqueada por el administrador.";
      await sql`update app.licenses set status = 'blocked', blocked_reason = ${reason} where id = ${id}`;
      await revokeAllSessions(id, "blocked");
      await logEvent(id, "blocked", "info", { by: "admin", reason });
      return {};
    }
    case "unblock": {
      await sql`update app.licenses set status = case when password_hash is null then 'pending' else 'active' end,
                  blocked_reason = null where id = ${id}`;
      // Las alertas previas dejan de contar para el bloqueo automático
      await sql`update app.events set severity = 'warn' where license_id = ${id} and severity = 'alert'`;
      await logEvent(id, "unblocked", "info", { by: "admin" });
      return {};
    }
    case "logout": {
      await revokeAllSessions(id, "admin_logout");
      await logEvent(id, "admin_logout", "info", { by: "admin" });
      return {};
    }
    case "delete": {
      await sql`update app.license_requests set license_id = null where license_id = ${id}`;
      await sql`delete from app.licenses where id = ${id}`;
      return {};
    }
    default:
      throw new ApiError(400, "BAD_REQUEST", "Acción desconocida.");
  }
}

export async function listLicenses(q: string) {
  const like = `%${q.toLowerCase()}%`;
  return sql`
    select l.id, l.full_name, l.email, l.id_number, l.phone, l.status, l.banks, l.expires_at, l.created_at,
           l.activated_at, l.last_seen_at, l.payment_ref, l.amount, l.code_hint, l.blocked_reason,
      (select count(*)::int from app.devices d where d.license_id = l.id and d.revoked_at is null) as devices,
      (select count(*)::int from app.events e where e.license_id = l.id and e.severity = 'alert'
         and e.created_at > now() - interval '7 days') as alerts,
      (select count(*)::int from app.events e where e.license_id = l.id and e.type = 'login_other_device'
         and e.created_at > now() - interval '7 days') as other_device,
      (select count(*)::int from app.attempts a where a.license_id = l.id and a.submitted_at is not null) as attempts
    from app.licenses l
    where ${q} = '' or lower(l.full_name) like ${like} or lower(l.email) like ${like} or coalesce(l.id_number,'') like ${like}
    order by l.created_at desc limit 500`;
}

export async function getLicenseDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [license] = await sql`select l.*, (l.password_hash is not null) as has_password from app.licenses l where id = ${id}`;
  if (!license) return null;
  delete license.password_hash;
  delete license.code_hash;
  const devices = await sql`select id, fp, user_agent, first_ip, last_ip, created_at, last_seen_at, revoked_at
                            from app.devices where license_id = ${id} order by created_at desc limit 20`;
  const sessions = await sql`select id, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at, revoke_reason
                             from app.sessions where license_id = ${id} order by created_at desc limit 20`;
  const events = await sql`select id, type, severity, detail, ip, created_at from app.events
                           where license_id = ${id} order by created_at desc limit 150`;
  const attempts = await sql`select a.id, b.title, a.submitted_at, a.total, a.correct, a.score from app.attempts a
                             join app.banks b on b.slug = a.bank_slug
                             where a.license_id = ${id} and a.submitted_at is not null order by a.submitted_at desc limit 30`;
  const ips = await sql`select count(distinct ip)::int as n from app.events where license_id = ${id} and created_at > now() - interval '7 days'`;
  return { license, devices, sessions, events, attempts, distinctIps7d: ips[0].n };
}

// ---------- Solicitudes ----------

export async function listRequests(status: string) {
  return sql`select * from app.license_requests where ${status} = 'all' or status = ${status}
             order by created_at desc limit 300`;
}

export async function requestAction(id: string, action: string, b: Record<string, unknown>) {
  const [r] = await sql<Record<string, unknown>[]>`select * from app.license_requests where id = ${id}`;
  if (!r) throw new ApiError(404, "NOT_FOUND", "Solicitud no encontrada.");
  if (action === "reject") {
    await sql`update app.license_requests set status = 'rejected' where id = ${id}`;
    return {};
  }
  if (action === "approve") {
    if (r.status === "approved") throw new ApiError(409, "DONE", "La solicitud ya fue aprobada.");
    const created = await createLicense({
      fullName: b.fullName ?? r.full_name,
      email: b.email ?? r.email,
      idNumber: b.idNumber ?? r.id_number,
      phone: b.phone ?? r.phone,
      paymentRef: b.paymentRef ?? r.payment_ref,
      amount: b.amount ?? null,
      banks: b.banks ?? r.banks,
      expiresAt: b.expiresAt ?? null,
      notes: b.notes ?? r.message,
    });
    await sql`update app.license_requests set status = 'approved', license_id = ${created.id} where id = ${id}`;
    return created;
  }
  throw new ApiError(400, "BAD_REQUEST", "Acción desconocida.");
}

export async function overview() {
  const [s] = await sql`
    select
      (select count(*)::int from app.licenses) as total,
      (select count(*)::int from app.licenses where status = 'active') as active,
      (select count(*)::int from app.licenses where status = 'pending') as pending,
      (select count(*)::int from app.licenses where status = 'blocked') as blocked,
      (select count(*)::int from app.license_requests where status = 'pending') as requests,
      (select count(*)::int from app.events where severity = 'alert' and created_at > now() - interval '7 days') as alerts,
      (select coalesce(sum(amount),0)::float from app.licenses) as revenue,
      (select count(*)::int from app.attempts where submitted_at > now() - interval '7 days') as attempts7d`;
  return s;
}
