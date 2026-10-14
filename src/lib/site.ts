import "server-only";

// Datos públicos del sitio. Se configuran con variables de entorno en Vercel.
export const site = {
  name: process.env.SITE_NAME || "Simulador Complexivo UCE",
  tagline: process.env.SITE_TAGLINE || "Ingeniería en Sistemas de Información",
  price: process.env.LICENSE_PRICE || "Consultar",
  whatsapp: (process.env.CONTACT_WHATSAPP || "").replace(/[^\d]/g, ""),
  contactEmail: process.env.CONTACT_EMAIL || "",
  // Texto libre con los datos para la transferencia (admite saltos de línea con \n)
  paymentInfo: (process.env.PAYMENT_INFO || "Solicita los datos de pago por WhatsApp.").replace(/\n/g, "\n"),
};

export function whatsappLink(text: string) {
  if (!site.whatsapp) return null;
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}
