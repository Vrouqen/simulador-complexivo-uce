import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);

export function fail(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "SERVER", message: "Ocurrió un error inesperado. Intenta de nuevo." }, { status: 500 });
}

/** Envuelve un handler para devolver errores en JSON uniforme. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return fail(e);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Solicitud inválida.");
  }
}

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  return { ip, ua: (h.get("user-agent") || "").slice(0, 400), fp: h.get("x-fp") };
}

/** Bloquea peticiones de otros orígenes (CSRF) en métodos que modifican datos. */
export async function sameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (origin && host && new URL(origin).host !== host) throw new ApiError(403, "FORBIDDEN", "Origen no permitido.");
}

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
