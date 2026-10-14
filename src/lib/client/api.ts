"use client";

import { getFingerprint } from "./fingerprint";

export class ClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const SESSION_CODES = new Set(["NO_SESSION", "KICKED", "REVOKED", "EXPIRED_SESSION", "BLOCKED", "EXPIRED"]);

/** fetch a la API con la huella del dispositivo y manejo uniforme de errores. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-fp": getFingerprint() },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.error || "SERVER";
    if (res.status === 401 && SESSION_CODES.has(code) && !path.startsWith("/api/admin")) {
      window.location.href = `/ingresar?motivo=${code}`;
    }
    if (res.status === 401 && code === "NO_ADMIN") window.location.href = "/admin/login";
    throw new ClientError(res.status, code, data.message || "Error de conexión.");
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado.");
