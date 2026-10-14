import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Simulador Complexivo UCE", template: "%s · Simulador Complexivo UCE" },
  description: "Simulador del examen complexivo de Ingeniería en Sistemas de Información. Acceso con licencia personal.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f3b7a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
