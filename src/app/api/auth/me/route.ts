import { requireSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";

// Latido: el cliente lo llama periódicamente para detectar sesiones cerradas.
export const GET = route(async () => {
  const s = await requireSession();
  return ok({ name: s.license.fullName, email: s.license.email });
});
