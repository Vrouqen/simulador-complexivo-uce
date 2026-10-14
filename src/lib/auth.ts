import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "./db";
import { hashCode, hmac, randomToken, safeEqual, sha256 } from "./crypto";
import { FP_THRESHOLD, parseFingerprint, similarity, type Fingerprint } from "./fingerprint";
import { ApiError, clientInfo } from "./http";
import { rateLimit } from "./ratelimit";

// ---------------------------------------------------------------------------
// Modelo de licencia única:
//  1. Cada licencia pertenece a UNA persona (correo + cédula) y se activa con
//     un código de un solo uso que entrega el administrador tras validar el pago.
//  2. La licencia queda vinculada a UN dispositivo/navegador (max_devices = 1).
//     Desde cualquier otro equipo el ingreso se rechaza aunque la contraseña sea
//     correcta. Solo el administrador puede liberar el dispositivo.
//  3. Solo puede haber UNA sesión activa. Cada sesión está atada a la huella del
//     equipo y a la cookie del navegador: si alguien copia la cookie a otro
//     equipo, la sesión se revoca.
//  4. Las señales de uso compartido se registran; al acumular varias en una
//     semana la licencia se bloquea automáticamente.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "uce_s";
export const BROWSER_COOKIE = "uce_d";
const SESSION_DAYS = 14;
const ALERTS_TO_BLOCK = 3;

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export type License = {
  id: string;
  full_name: string;
  email: string;
  id_number: string | null;
  banks: string[];
  status: string;
  blocked_reason: string | null;
  expires_at: Date | null;
  password_hash: string | null;
  code_hash: string | null;
  max_devices: number;
};

export type Session = {
  sessionId: string;
  license: { id: string; fullName: string; email: string; idNumber: string | null; banks: string[]; expiresAt: Date | null };
};

export async function logEvent(
  licenseId: string | null,
  type: string,
  severity: "info" | "warn" | "alert",
  detail: Record<string, unknown> = {},
  ip?: string
) {
  await sql`insert into app.events (license_id, type, severity, detail, ip)
            values (${licenseId}, ${type}, ${severity}, ${sql.json(detail as never)}, ${ip ?? null})`;
}

/** Bloquea la licencia si acumula demasiadas alertas de uso compartido. */
async function checkSharing(licenseId: string) {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from app.events
    where license_id = ${licenseId} and severity = 'alert' and created_at > now() - interval '7 days'`;
  if (n >= ALERTS_TO_BLOCK) {
    await sql`update app.licenses set status = 'blocked',
                blocked_reason = 'Bloqueo automático: se detectó uso desde varios equipos (licencia compartida).'
              where id = ${licenseId} and status = 'active'`;
    await revokeAllSessions(licenseId, "auto_block");
    await logEvent(licenseId, "auto_blocked", "alert", { alerts: n });
  }
}

export async function revokeAllSessions(licenseId: string, reason: string) {
  await sql`update app.sessions set revoked_at = now(), revoke_reason = ${reason}
            where license_id = ${licenseId} and revoked_at is null`;
}

const normEmail = (e: string) => e.trim().toLowerCase();

async function findLicense(email: string) {
  const [lic] = await sql<License[]>`select * from app.licenses where lower(email) = ${normEmail(email)}`;
  return lic;
}

function assertUsable(lic: License) {
  if (lic.status === "blocked")
    throw new ApiError(403, "BLOCKED", lic.blocked_reason || "Tu licencia está bloqueada. Contacta al administrador.");
  if (lic.expires_at && lic.expires_at.getTime() < Date.now())
    throw new ApiError(403, "EXPIRED", "Tu licencia ha vencido. Contacta al administrador para renovarla.");
}

/** Identificador permanente de este navegador (cookie httpOnly). */
async function browserId() {
  const jar = await cookies();
  let id = jar.get(BROWSER_COOKIE)?.value;
  if (!id || id.length < 30) {
    id = randomToken(32);
    jar.set(BROWSER_COOKIE, id, { ...cookieBase, maxAge: 60 * 60 * 24 * 400 });
  }
  return id;
}

const deviceHash = (bid: string) => hmac("device:" + bid);

/**
 * Vincula (o verifica) el dispositivo actual con la licencia.
 * Devuelve el id del dispositivo o lanza DEVICE_MISMATCH.
 */
async function bindDevice(lic: License, fp: Fingerprint, ip: string, ua: string) {
  const tokenHash = deviceHash(await browserId());
  const [device] = await sql<{ id: string; fp: Fingerprint }[]>`
    select id, fp from app.devices
    where license_id = ${lic.id} and token_hash = ${tokenHash} and revoked_at is null`;

  if (device) {
    const sim = similarity(device.fp, fp);
    if (sim < FP_THRESHOLD) {
      // La cookie del navegador apareció en un equipo con otra huella: se copió.
      await logEvent(lic.id, "device_cookie_copied", "alert", { similarity: sim, ua }, ip);
      await checkSharing(lic.id);
      throw new ApiError(403, "DEVICE_MISMATCH", "Este equipo no coincide con el dispositivo registrado para tu licencia.");
    }
    await sql`update app.devices set fp = ${sql.json(fp)}, last_ip = ${ip}, user_agent = ${ua}, last_seen_at = now()
              where id = ${device.id}`;
    return device.id;
  }

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from app.devices where license_id = ${lic.id} and revoked_at is null`;
  if (n >= lic.max_devices) {
    await logEvent(lic.id, "login_other_device", "warn", { ua }, ip);
    throw new ApiError(
      403,
      "DEVICE_MISMATCH",
      "Tu licencia ya está vinculada a otro dispositivo. La licencia es personal y solo funciona en un equipo. " +
        "Si cambiaste de equipo o borraste los datos del navegador, solicita al administrador que libere tu dispositivo."
    );
  }
  const [created] = await sql<{ id: string }[]>`
    insert into app.devices (license_id, token_hash, fp, user_agent, first_ip, last_ip)
    values (${lic.id}, ${tokenHash}, ${sql.json(fp)}, ${ua}, ${ip}, ${ip}) returning id`;
  await logEvent(lic.id, "device_registered", "info", { ua }, ip);
  return created.id;
}

/** Abre una sesión nueva y cierra cualquier otra (solo 1 sesión activa por licencia). */
async function openSession(lic: License, deviceId: string, fp: Fingerprint, fpRaw: string, ip: string, ua: string) {
  const others = await sql<{ id: string; fp: Fingerprint; last_seen_at: Date }[]>`
    select id, fp, last_seen_at from app.sessions
    where license_id = ${lic.id} and revoked_at is null and expires_at > now()`;
  for (const o of others) {
    const recent = Date.now() - o.last_seen_at.getTime() < 15 * 60 * 1000;
    if (recent && similarity(o.fp, fp) < FP_THRESHOLD) {
      await logEvent(lic.id, "concurrent_use", "alert", { ua }, ip);
    }
  }
  await revokeAllSessions(lic.id, "new_login");

  const token = randomToken(32);
  await sql`
    insert into app.sessions (license_id, device_id, token_hash, fp, fp_hash, ip, user_agent, expires_at)
    values (${lic.id}, ${deviceId}, ${sha256(token)}, ${sql.json(fp)}, ${sha256(fpRaw)}, ${ip}, ${ua},
            now() + make_interval(days => ${SESSION_DAYS}))`;
  await sql`update app.licenses set last_seen_at = now() where id = ${lic.id}`;
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, maxAge: 60 * 60 * 24 * SESSION_DAYS });
  await checkSharing(lic.id);
}

function requireFp(raw: unknown) {
  const fp = parseFingerprint(typeof raw === "string" ? raw : null);
  if (!fp) throw new ApiError(400, "NO_FP", "No se pudo identificar el dispositivo. Activa JavaScript y vuelve a intentarlo.");
  return { fp, raw: raw as string };
}

function validatePassword(p: string) {
  if (p.length < 8) throw new ApiError(400, "WEAK_PASSWORD", "La contraseña debe tener al menos 8 caracteres.");
  if (p.length > 72) throw new ApiError(400, "WEAK_PASSWORD", "La contraseña es demasiado larga.");
}

export async function activate(input: { email: string; code: string; password: string; fp: unknown }) {
  const { ip, ua } = await clientInfo();
  await rateLimit(`act:ip:${ip}`, 10, 900);
  const { fp, raw } = requireFp(input.fp);
  validatePassword(input.password);

  const lic = await findLicense(input.email);
  const generic = new ApiError(400, "INVALID_CODE", "El correo o el código de activación no son válidos.");
  if (!lic || !lic.code_hash) throw generic;
  await rateLimit(`act:lic:${lic.id}`, 8, 3600);
  if (!safeEqual(lic.code_hash, hashCode(input.code))) {
    await logEvent(lic.id, "activation_failed", "warn", {}, ip);
    throw generic;
  }
  if (lic.status === "active" && lic.password_hash) throw new ApiError(400, "ALREADY_ACTIVE", "Esta licencia ya fue activada. Ingresa con tu contraseña.");
  assertUsable(lic);

  const passwordHash = await bcrypt.hash(input.password, 11);
  // El código es de un solo uso: se borra al activar.
  await sql`update app.licenses set password_hash = ${passwordHash}, code_hash = null, status = 'active',
              activated_at = coalesce(activated_at, now())
            where id = ${lic.id}`;
  await logEvent(lic.id, "activated", "info", { ua }, ip);
  const deviceId = await bindDevice({ ...lic, status: "active" }, fp, ip, ua);
  await openSession(lic, deviceId, fp, raw, ip, ua);
}

let dummyHash: string | undefined;

export async function login(input: { email: string; password: string; fp: unknown }) {
  const { ip, ua } = await clientInfo();
  await rateLimit(`login:ip:${ip}`, 20, 900);
  const { fp, raw } = requireFp(input.fp);
  const lic = await findLicense(input.email);
  const generic = new ApiError(401, "INVALID_LOGIN", "Correo o contraseña incorrectos.");
  if (!lic) {
    dummyHash ??= await bcrypt.hash("dummy-password", 11);
    await bcrypt.compare(input.password, dummyHash); // mismo tiempo de respuesta exista o no el correo
    throw generic;
  }
  await rateLimit(`login:lic:${lic.id}`, 10, 900);
  if (!lic.password_hash) throw new ApiError(401, "NOT_ACTIVATED", "Tu licencia aún no está activada. Usa tu código en «Activar licencia».");
  if (!(await bcrypt.compare(input.password, lic.password_hash))) {
    await logEvent(lic.id, "login_failed", "info", {}, ip);
    throw generic;
  }
  assertUsable(lic);
  const deviceId = await bindDevice(lic, fp, ip, ua);
  await openSession(lic, deviceId, fp, raw, ip, ua);
  await logEvent(lic.id, "login", "info", { ua }, ip);
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await sql`update app.sessions set revoked_at = now(), revoke_reason = 'logout'
              where token_hash = ${sha256(token)} and revoked_at is null`;
  }
  jar.delete(SESSION_COOKIE);
}

type SessionRow = {
  session_id: string;
  fp: Fingerprint;
  fp_hash: string;
  s_last_seen: Date;
  device_token_hash: string;
  s_revoked: Date | null;
  revoke_reason: string | null;
  s_expires: Date;
  device_revoked: Date | null;
} & License;

export type SessionResult = { session: Session } | { session: null; reason: string };

/**
 * Valida la sesión actual.
 * strict = true en la API: exige la huella del dispositivo en la cabecera x-fp
 * y revoca la sesión si no coincide con la del equipo que inició sesión.
 */
export async function readSession(strict: boolean): Promise<SessionResult> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const bid = jar.get(BROWSER_COOKIE)?.value;
  if (!token) return { session: null, reason: "NO_SESSION" };

  const [row] = await sql<SessionRow[]>`
    select l.*, s.id as session_id, s.fp, s.fp_hash, s.last_seen_at as s_last_seen, s.revoked_at as s_revoked,
           s.revoke_reason, s.expires_at as s_expires,
           d.token_hash as device_token_hash, d.revoked_at as device_revoked
    from app.sessions s
    join app.devices d on d.id = s.device_id
    join app.licenses l on l.id = s.license_id
    where s.token_hash = ${sha256(token)}`;
  if (!row) return { session: null, reason: "NO_SESSION" };
  if (row.s_revoked) {
    const reason = row.revoke_reason === "new_login" ? "KICKED" : row.revoke_reason === "logout" ? "NO_SESSION" : "REVOKED";
    return { session: null, reason };
  }
  if (row.s_expires.getTime() < Date.now() || row.device_revoked) return { session: null, reason: "EXPIRED_SESSION" };
  if (row.status !== "active") return { session: null, reason: row.status === "blocked" ? "BLOCKED" : "NO_SESSION" };
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return { session: null, reason: "EXPIRED" };

  const { ip, fp: fpHeader } = await clientInfo();
  const revoke = async (type: string, reason: string) => {
    await sql`update app.sessions set revoked_at = now(), revoke_reason = ${reason} where id = ${row.session_id}`;
    await logEvent(row.id, type, "alert", {}, ip);
    await checkSharing(row.id);
    return { session: null, reason: "REVOKED" } as const;
  };

  // La cookie de sesión solo vale junto a la cookie del navegador que la creó.
  if (!bid || !safeEqual(deviceHash(bid), row.device_token_hash)) {
    return revoke("session_cookie_copied", "browser_mismatch");
  }

  if (strict) {
    const fp = parseFingerprint(fpHeader);
    if (!fp) return { session: null, reason: "NO_FP" };
    if (sha256(fpHeader!) !== row.fp_hash) {
      if (similarity(row.fp, fp) < FP_THRESHOLD) return revoke("session_fp_mismatch", "fp_mismatch");
      await sql`update app.sessions set fp = ${sql.json(fp)}, fp_hash = ${sha256(fpHeader!)} where id = ${row.session_id}`;
    }
  }

  if (Date.now() - row.s_last_seen.getTime() > 60_000) {
    await sql`update app.sessions set last_seen_at = now(), ip = ${ip} where id = ${row.session_id}`;
    await sql`update app.licenses set last_seen_at = now() where id = ${row.id}`;
    await sql`update app.devices set last_seen_at = now(), last_ip = ${ip} where token_hash = ${row.device_token_hash} and license_id = ${row.id}`;
  }

  return {
    session: {
      sessionId: row.session_id,
      license: {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        idNumber: row.id_number,
        banks: row.banks,
        expiresAt: row.expires_at,
      },
    },
  };
}

const REASONS: Record<string, string> = {
  NO_SESSION: "Inicia sesión para continuar.",
  KICKED: "Tu sesión se cerró porque se inició sesión nuevamente con tu licencia.",
  REVOKED: "Tu sesión fue cerrada por seguridad: se detectó un cambio de equipo.",
  EXPIRED_SESSION: "Tu sesión expiró. Vuelve a iniciar sesión.",
  BLOCKED: "Tu licencia está bloqueada. Contacta al administrador.",
  EXPIRED: "Tu licencia ha vencido.",
  NO_FP: "No se pudo verificar el dispositivo. Recarga la página.",
};

/** Para la API: devuelve la sesión o lanza 401 con el motivo. */
export async function requireSession(): Promise<Session> {
  const r = await readSession(true);
  if (!r.session) throw new ApiError(401, r.reason, REASONS[r.reason] || REASONS.NO_SESSION);
  return r.session;
}

export function canUseBank(s: Session, slug: string) {
  return s.license.banks.includes("*") || s.license.banks.includes(slug);
}

/** Sesión para páginas (sin huella), deduplicada por petición. */
export const currentSession = cache(() => readSession(false));
