import { sql } from "@/lib/db";
import { ApiError, body, clientInfo, isEmail, ok, route, sameOrigin, str } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

// Formulario público "Solicitar licencia": queda pendiente hasta que el admin valide el pago.
export const POST = route(async (req: Request) => {
  await sameOrigin();
  const { ip } = await clientInfo();
  await rateLimit(`req:${ip}`, 5, 3600, "Ya enviaste varias solicitudes. Espera a que el administrador las revise.");
  const b = await body(req);
  const fullName = str(b.fullName, 120);
  const email = str(b.email, 160).toLowerCase();
  if (fullName.length < 3) throw new ApiError(400, "BAD_REQUEST", "Escribe tu nombre completo.");
  if (!isEmail(email)) throw new ApiError(400, "BAD_REQUEST", "Escribe un correo válido.");
  const idNumber = str(b.idNumber, 30);
  if (!/^\d{10}$/.test(idNumber)) throw new ApiError(400, "BAD_REQUEST", "La cédula debe tener 10 dígitos.");
  const [lic] = await sql`select 1 from app.licenses where lower(email) = ${email} or id_number = ${idNumber}`;
  if (lic) {
    throw new ApiError(409, "DUPLICATE", "Ya existe una licencia con ese correo o cédula. Si es tuya, ingresa o contacta al administrador.");
  }
  const banks = Array.isArray(b.banks) && b.banks.length ? b.banks.map((x) => str(x, 40)).slice(0, 10) : ["*"];
  await sql`insert into app.license_requests (full_name, email, id_number, phone, banks, payment_ref, message, ip)
            values (${fullName}, ${email}, ${idNumber}, ${str(b.phone, 30) || null}, ${sql.json(banks)},
                    ${str(b.paymentRef, 120) || null}, ${str(b.message, 1000) || null}, ${ip})`;
  return ok();
});
