"use client";

import { useEffect } from "react";
import { api } from "@/lib/client/api";

/**
 * - Latido cada 60 s (y al volver a la pestaña): si la sesión se cerró en el
 *   servidor (otro inicio de sesión, bloqueo, cambio de equipo) se expulsa al usuario.
 * - Dificulta copiar, imprimir y guardar el contenido.
 */
export function SessionGuard() {
  useEffect(() => {
    const beat = () => api("/api/auth/me").catch(() => {});
    beat();
    const t = setInterval(beat, 60_000);
    const onVis = () => document.visibilityState === "visible" && beat();
    document.addEventListener("visibilitychange", onVis);

    const block = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea")) return;
      e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["s", "p", "u"].includes(k)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && k === "c" && !(e.target as HTMLElement)?.closest?.("input, textarea")) e.preventDefault();
    };
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", keys);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", keys);
    };
  }, []);
  return null;
}

export function LogoutButton() {
  return (
    <button
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/";
      }}
    >
      Salir
    </button>
  );
}

/** Marca de agua con los datos del titular: identifica capturas de pantalla filtradas. */
export function Watermark({ text }: { text: string }) {
  return (
    <div className="watermark" aria-hidden="true">
      <div>
        {Array.from({ length: 140 }, (_, i) => <span key={i}>{text}</span>)}
      </div>
    </div>
  );
}
