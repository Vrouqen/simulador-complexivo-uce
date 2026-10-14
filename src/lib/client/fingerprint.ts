"use client";

let cached: string | null = null;

function hashStr(s: string) {
  // FNV-1a 32 bits, suficiente para resumir el canvas
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function canvasHash() {
  try {
    const c = document.createElement("canvas");
    c.width = 240; c.height = 60;
    const x = c.getContext("2d");
    if (!x) return "none";
    x.textBaseline = "top";
    x.font = "16px 'Arial'";
    x.fillStyle = "#f60"; x.fillRect(100, 1, 62, 20);
    x.fillStyle = "#069"; x.fillText("UCE Complexivo ñ ✓ 2026", 2, 15);
    x.fillStyle = "rgba(102,204,0,0.7)"; x.fillText("UCE Complexivo ñ ✓ 2026", 4, 17);
    x.beginPath(); x.arc(50, 30, 20, 0, Math.PI * 2); x.stroke();
    return hashStr(c.toDataURL());
  } catch { return "err"; }
}

function webgl() {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "none";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor}|${renderer}`.slice(0, 200);
  } catch { return "err"; }
}

function uaParts() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "edge" : /OPR\//.test(ua) ? "opera" : /Firefox\//.test(ua) ? "firefox"
    : /Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "other";
  const os = /Windows/.test(ua) ? "windows" : /Android/.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) ? "ios"
    : /Mac OS X/.test(ua) ? "mac" : /Linux/.test(ua) ? "linux" : "other";
  return { browser, os };
}

/** Huella codificada para enviar al servidor (cabecera x-fp o campo fp). */
export function getFingerprint(): string {
  if (cached) return cached;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const s = window.screen;
  const dims = [s.width, s.height].sort((a, b) => b - a).join("x"); // independiente de la orientación
  const fp = {
    ...uaParts(),
    platform: nav.platform || "",
    langs: (nav.languages || [nav.language]).slice(0, 3).join(","),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    cores: nav.hardwareConcurrency || 0,
    memory: nav.deviceMemory || 0,
    screen: dims,
    depth: s.colorDepth,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    touch: nav.maxTouchPoints || 0,
    canvas: canvasHash(),
    webgl: webgl(),
  };
  cached = btoa(encodeURIComponent(JSON.stringify(fp)));
  return cached;
}
