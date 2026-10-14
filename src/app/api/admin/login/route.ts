import { adminLogin } from "@/lib/admin";
import { body, ok, route, sameOrigin, str } from "@/lib/http";

export const POST = route(async (req: Request) => {
  await sameOrigin();
  const b = await body(req);
  await adminLogin(str(b.email, 160), String(b.password ?? ""));
  return ok();
});
