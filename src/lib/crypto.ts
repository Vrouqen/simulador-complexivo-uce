import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  return s;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const hmac = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Código de activación legible: UCE-XXXX-XXXX-XXXX (alfabeto sin caracteres confusos, ~60 bits)
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function newActivationCode() {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join("");
  return `UCE-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashCode = (c: string) => hmac("code:" + normalizeCode(c));
