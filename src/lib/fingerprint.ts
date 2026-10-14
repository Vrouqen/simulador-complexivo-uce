// Huella del dispositivo: un conjunto de rasgos estables del navegador/equipo.
// No es infalible (se puede falsificar), pero detecta cuando una sesión o
// cookie se copia a otro equipo, que es el caso típico de "compartir la cuenta".

export type Fingerprint = Record<string, string | number>;

const WEIGHTS: Record<string, number> = {
  canvas: 2,
  webgl: 2,
  platform: 1,
  os: 1,
  browser: 1,
  cores: 1,
  memory: 1,
  screen: 1,
  tz: 1,
  langs: 0.5,
  touch: 0.5,
  dpr: 0.5,
  depth: 0.5,
};

export const FP_THRESHOLD = 0.6;

/** 1 = idéntico, 0 = completamente distinto. */
export function similarity(a: Fingerprint | null | undefined, b: Fingerprint | null | undefined) {
  if (!a || !b) return 0;
  let total = 0, match = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (a[k] === undefined || b[k] === undefined) continue;
    total += w;
    if (String(a[k]) === String(b[k])) match += w;
  }
  return total ? match / total : 0;
}

export function parseFingerprint(raw: string | null | undefined): Fingerprint | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const json = decodeURIComponent(Buffer.from(raw, "base64").toString("utf8"));
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Fingerprint = {};
    for (const k of Object.keys(WEIGHTS)) {
      const v = obj[k];
      if (typeof v === "string") out[k] = v.slice(0, 200);
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return Object.keys(out).length >= 5 ? out : null;
  } catch {
    return null;
  }
}
